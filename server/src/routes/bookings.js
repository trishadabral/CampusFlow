// Booking routes. Booking is the critical section: all serialization
// lives in os/critical-section.js (SELECT ... FOR UPDATE in one transaction).
const express = require('express');
const pool = require('../dbms/db');
const { setActor, clearActor } = require('../dbms/db');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { bookSeat } = require('../os/critical-section');
const { notifyUser } = require('../mailer');
const { publish } = require('../realtime');

const router = express.Router();

// POST /bookings — student books a seat (serialized in the DB)
router.post('/', authenticateToken, requireRole('student'), async (req, res, next) => {
  try {
    const { slot_id } = req.body || {};
    if (!slot_id) {
      return res.status(400).json({ error: 'slot_id is required.' });
    }
    // Human booking: a full slot puts the student on the waiting list
    // instead of failing (bookSeat only waitlists when asked — the
    // auto-scheduler never waitlists).
    const booking = await bookSeat(slot_id, req.user.id, req.user.email, { allowWaitlist: true });
    // Live update so dashboards and the bell refresh without waiting to poll.
    const [slots] = await pool.query(
      `SELECT s.drive_id, s.title, d.title AS drive_title
       FROM slots s JOIN drives d ON d.id = s.drive_id WHERE s.id = ?`,
      [slot_id]
    );
    const slot = slots[0];
    if (slot && !booking.waitlisted) {
      publish('booking-changed', {
        driveId: slot.drive_id,
        driveTitle: slot.drive_title,
        message: `Seat booked: ${slot.title}`,
      });
    }
    if (booking.waitlisted) {
      if (slot) {
        publish('booking-changed', {
          driveId: slot.drive_id,
          driveTitle: slot.drive_title,
          message: `Joined the waiting list: ${slot.title}`,
        });
      }
      // The waiting list is only useful if the student hears about it:
      // write a bell item (email is best-effort inside notifyUser).
      // Never fail the booking if the notification write fails.
      try {
        await notifyUser(pool, {
          userId: req.user.id,
          title: `You're #${booking.position} on the waiting list`,
          body: slot
            ? `${slot.title} (${slot.drive_title}) is full — you're #${booking.position} on the waiting list. We'll let you know if a seat opens up.`
            : `You're #${booking.position} on the waiting list. We'll let you know if a seat opens up.`,
          link: '/student/bookings',
        });
      } catch (err) {
        console.error('[bookings] waitlist notice failed:', err.message);
      }
      return res.status(201).json({
        booking,
        waitlisted: true,
        position: booking.position,
        message: `This session is full — you're #${booking.position} on the waiting list. We'll let you know if a seat opens up.`,
      });
    }
    res.status(201).json({ booking });
  } catch (err) {
    next(err);
  }
});

// GET /bookings/me — student's own bookings
router.get('/me', authenticateToken, requireRole('student'), async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT b.id, b.status, b.booked_at,
              (SELECT COUNT(*) FROM bookings w
                WHERE w.slot_id = b.slot_id AND w.status = 'waitlist'
                  AND (w.booked_at < b.booked_at OR (w.booked_at = b.booked_at AND w.id < b.id))) + 1
                AS waitlist_position,
              s.id AS slot_id, s.drive_id, s.type, s.title, s.starts_at, s.ends_at,
              s.capacity, s.booked_count
       FROM bookings b
       JOIN slots s ON s.id = b.slot_id
       WHERE b.student_id = ?
       ORDER BY b.booked_at DESC`,
      [req.user.id]
    );
    res.json(
      rows.map((r) => ({
        id: r.id,
        slot: {
          id: r.slot_id,
          drive_id: r.drive_id,
          type: r.type,
          title: r.title,
          starts_at: r.starts_at,
          ends_at: r.ends_at,
          capacity: r.capacity,
          booked_count: r.booked_count,
        },
        status: r.status,
        booked_at: r.booked_at,
        // Only meaningful while on the waiting list; null otherwise.
        waitlist_position: r.status === 'waitlist' ? Number(r.waitlist_position) : null,
      }))
    );
  } catch (err) {
    next(err);
  }
});

// DELETE /bookings/:id — cancel own booking (admin can cancel any).
// Cancelling a confirmed seat auto-promotes the next student on the
// waiting list, in the same locked transaction (see below).
router.delete('/:id', authenticateToken, async (req, res, next) => {
  const conn = await pool.getConnection();
  let promoted = null; // { studentId, slotTitle } — notified only after commit
  try {
    await conn.beginTransaction();
    // Audit attribution: the cancel (and any auto-promotion) below fires the
    // audit triggers on THIS connection, so the canceller is recorded.
    await setActor(conn, req.user.id);
    // Lock the booking row first: two cancels of the same booking (or a
    // cancel racing a new booking) are serialized here.
    const [rows] = await conn.query(
      'SELECT id, slot_id, student_id, status FROM bookings WHERE id = ? FOR UPDATE',
      [req.params.id]
    );
    const booking = rows[0];
    if (!booking) {
      await conn.rollback();
      return res.status(404).json({ error: 'Booking not found.' });
    }
    if (req.user.role !== 'admin' && booking.student_id !== req.user.id) {
      await conn.rollback();
      return res.status(403).json({ error: 'You can only cancel your own bookings.' });
    }
    if (booking.status === 'cancelled') {
      await conn.rollback();
      return res.status(400).json({ error: 'This booking is already cancelled.' });
    }

    // Soft-cancel: keep the row for history (the ENUM has a 'cancelled' state for this).
    // A later re-booking revives the same row in os/critical-section.js.
    await conn.query("UPDATE bookings SET status = 'cancelled' WHERE id = ?", [booking.id]);
    if (booking.status === 'confirmed') {
      await conn.query('UPDATE slots SET booked_count = booked_count - 1 WHERE id = ?', [
        booking.slot_id,
      ]);

      // --- auto-promotion: same transaction, same slot lock ---
      // Lock the slot row, then RE-CHECK booked_count < capacity before
      // promoting. The re-check is the whole point: between "a seat freed"
      // and "promote the next student", another request could have taken
      // that seat (a fresh booking also locks this row, so it cannot slip
      // in mid-transaction — but if booked_count were already back at
      // capacity for any reason, promoting would overbook the session).
      const [[slotRow]] = await conn.query(
        'SELECT id, capacity, booked_count, title FROM slots WHERE id = ? FOR UPDATE',
        [booking.slot_id]
      );
      if (slotRow && slotRow.booked_count < slotRow.capacity) {
        const [waiting] = await conn.query(
          `SELECT id, student_id FROM bookings
            WHERE slot_id = ? AND status = 'waitlist'
            ORDER BY booked_at ASC, id ASC LIMIT 1`,
          [booking.slot_id]
        );
        if (waiting.length) {
          await conn.query("UPDATE bookings SET status = 'confirmed', booked_at = NOW() WHERE id = ?", [
            waiting[0].id,
          ]);
          await conn.query('UPDATE slots SET booked_count = booked_count + 1 WHERE id = ?', [
            booking.slot_id,
          ]);
          promoted = { studentId: waiting[0].student_id, slotTitle: slotRow.title };
        }
      }
    }
    await conn.commit();
    // Notify AFTER commit: the promotion is durable now, and notifyUser
    // writes its own notification row — doing that inside the transaction
    // would hold the slot lock while sending mail.
    if (promoted) {
      try {
        await notifyUser(pool, {
          userId: promoted.studentId,
          title: "A seat opened up — you're booked in",
          body: `A seat opened up for ${promoted.slotTitle} and you're now booked in. Check My Schedule for the time and venue.`,
          link: '/student/bookings',
        });
      } catch (err) {
        console.error('[bookings] promotion notice failed:', err.message);
      }
    }
    const [slots] = await pool.query(
      `SELECT s.drive_id, s.title, d.title AS drive_title
       FROM slots s JOIN drives d ON d.id = s.drive_id WHERE s.id = ?`,
      [booking.slot_id]
    );
    const slot = slots[0];
    if (slot) {
      publish('booking-changed', {
        driveId: slot.drive_id,
        driveTitle: slot.drive_title,
        message: `Booking cancelled: ${slot.title}`,
      });
    }
    res.json({ ok: true, promoted: Boolean(promoted) });
  } catch (err) {
    try {
      await conn.rollback();
    } catch (_) {}
    next(err);
  } finally {
    await clearActor(conn);
    conn.release();
  }
});

module.exports = router;
