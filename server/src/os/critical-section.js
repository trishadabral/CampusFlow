// Booking a slot = entering a critical section.
// The slot row is the mutex: SELECT ... FOR UPDATE inside a transaction
// serializes every booking attempt in the DATABASE, which is the single
// source of truth for correctness. Node's lock manager (os/locks.js) only
// observes and visualizes the lock for the Kernel Monitor — there is
// deliberately NO app-level mutex here. Viva talking point: the DB lock
// alone guarantees that exactly `capacity` bookings can succeed, no matter
// how many Node requests race.
const pool = require('../dbms/db');
const { setActor, clearActor } = require('../dbms/db');
const { logLockEvent } = require('./locks');

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

async function bookSeat(slotId, studentId, holderLabel, opts = {}) {
  // allowWaitlist is opt-in and ONLY the human booking route sets it.
  // The pipeline auto-scheduler and the rush-hour test call bookSeat()
  // without it, so their behaviour is exactly as before: a full slot
  // throws and the caller skips that student.
  const allowWaitlist = opts.allowWaitlist === true;
  const lockName = `slot:${slotId}`;
  const conn = await pool.getConnection();
  let lockLogged = false;
  const releaseLock = () => logLockEvent(lockName, holderLabel, 'release', 0);
  try {
    await conn.beginTransaction();
    // Audit attribution: the booking rows written below fire the audit
    // triggers on THIS connection. The actor is whoever asked for the seat
    // (opts.actorId — the recruiter running the scheduler) or the student
    // booking for themselves when nobody else is acting.
    await setActor(conn, opts.actorId ?? studentId);

    // --- acquire the mutex (row lock) ---
    const t0 = Date.now();
    const [rows] = await conn.query(
      'SELECT id, capacity, booked_count FROM slots WHERE id = ? FOR UPDATE',
      [slotId]
    );
    const waitMs = Date.now() - t0;
    await logLockEvent(lockName, holderLabel, waitMs > 30 ? 'wait' : 'acquire', waitMs);
    lockLogged = true;

    const slot = rows[0];
    if (!slot) {
      await conn.rollback();
      await releaseLock();
      throw httpError(404, 'Slot not found.');
    }

    const [existing] = await conn.query(
      'SELECT id, status FROM bookings WHERE slot_id = ? AND student_id = ?',
      [slotId, studentId]
    );
    if (existing.length && existing[0].status !== 'cancelled') {
      await conn.rollback();
      await releaseLock();
      if (existing[0].status === 'waitlist') {
        throw httpError(409, 'You are already on the waiting list for this session.');
      }
      throw httpError(409, 'Already booked for this slot.');
    }

    if (slot.booked_count >= slot.capacity) {
      if (!allowWaitlist) {
        await conn.rollback();
        await releaseLock();
        throw httpError(409, 'Slot is full.');
      }
      // --- waiting list: same transaction discipline, no seat taken ---
      // Still under the slot row lock, so two students racing for the last
      // waiting-list place are ordered one after another and nobody is
      // added twice (the duplicate check above already ran under the lock).
      // booked_count is NOT touched: a waiting-list entry is not a seat.
      let bookingId;
      if (existing.length && existing[0].status === 'cancelled') {
        await conn.query(
          "UPDATE bookings SET status = 'waitlist', booked_at = NOW() WHERE id = ?",
          [existing[0].id]
        );
        bookingId = existing[0].id;
      } else {
        try {
          const [res] = await conn.query(
            'INSERT INTO bookings (slot_id, student_id, status) VALUES (?, ?, ?)',
            [slotId, studentId, 'waitlist']
          );
          bookingId = res.insertId;
        } catch (err) {
          await conn.rollback();
          await releaseLock();
          if (err.code === 'ER_DUP_ENTRY') throw httpError(409, 'You are already on the waiting list for this session.');
          throw err;
        }
      }
      // Position = entries ahead of this student, ordered by when they
      // joined the list (booked_at, then id as the tie-breaker).
      const [[mine]] = await conn.query('SELECT booked_at FROM bookings WHERE id = ?', [bookingId]);
      const [[pos]] = await conn.query(
        `SELECT COUNT(*) AS ahead FROM bookings
          WHERE slot_id = ? AND status = 'waitlist'
            AND (booked_at < ? OR (booked_at = ? AND id < ?))`,
        [slotId, mine.booked_at, mine.booked_at, bookingId]
      );
      const position = Number(pos.ahead || 0) + 1;

      await conn.commit();
      await releaseLock();

      const [bRows] = await pool.query(
        'SELECT id, slot_id, student_id, status, booked_at FROM bookings WHERE id = ?',
        [bookingId]
      );
      return { ...bRows[0], waitlisted: true, position };
    }

    // --- critical section: insert booking + bump the counter atomically ---
    // A previously-cancelled booking is revived instead of re-inserted
    // (the UNIQUE(slot_id, student_id) key forbids a second row).
    let bookingId;
    if (existing.length && existing[0].status === 'cancelled') {
      await conn.query(
        "UPDATE bookings SET status = 'confirmed', booked_at = NOW() WHERE id = ?",
        [existing[0].id]
      );
      bookingId = existing[0].id;
    } else {
      try {
        const [res] = await conn.query(
          'INSERT INTO bookings (slot_id, student_id, status) VALUES (?, ?, ?)',
          [slotId, studentId, 'confirmed']
        );
        bookingId = res.insertId;
      } catch (err) {
        await conn.rollback();
        await releaseLock();
        if (err.code === 'ER_DUP_ENTRY') throw httpError(409, 'Already booked for this slot.');
        throw err;
      }
    }
    await conn.query('UPDATE slots SET booked_count = booked_count + 1 WHERE id = ?', [slotId]);

    await conn.commit();
    await releaseLock();

    const [bRows] = await pool.query(
      'SELECT id, slot_id, student_id, status, booked_at FROM bookings WHERE id = ?',
      [bookingId]
    );
    return bRows[0];
  } catch (err) {
    try {
      await conn.rollback();
    } catch (_) {
      // already rolled back or never began — safe to ignore
    }
    throw err;
  } finally {
    await clearActor(conn);
    conn.release(); // always return the connection to the pool
  }
}

module.exports = { bookSeat, httpError };
