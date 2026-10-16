// Booking routes. Booking is the critical section: all serialization
// lives in os/critical-section.js (SELECT ... FOR UPDATE in one transaction).
const express = require('express');
const pool = require('../dbms/db');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { bookSeat } = require('../os/critical-section');

const router = express.Router();

// POST /bookings — student books a seat (serialized in the DB)
router.post('/', authenticateToken, requireRole('student'), async (req, res, next) => {
  try {
    const { slot_id } = req.body || {};
    if (!slot_id) {
      return res.status(400).json({ error: 'slot_id is required.' });
    }
    const booking = await bookSeat(slot_id, req.user.id, req.user.email);
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
      }))
    );
  } catch (err) {
    next(err);
  }
});

// DELETE /bookings/:id — cancel own booking (admin can cancel any)
router.delete('/:id', authenticateToken, async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    const [rows] = await conn.query('SELECT id, slot_id, student_id, status FROM bookings WHERE id = ?', [
      req.params.id,
    ]);
    const booking = rows[0];
    if (!booking) {
      return res.status(404).json({ error: 'Booking not found.' });
    }
    if (req.user.role !== 'admin' && booking.student_id !== req.user.id) {
      return res.status(403).json({ error: 'You can only cancel your own bookings.' });
    }

    await conn.beginTransaction();
    // Soft-cancel: keep the row for history (the ENUM has a 'cancelled' state for this).
    // A later re-booking revives the same row in os/critical-section.js.
    await conn.query("UPDATE bookings SET status = 'cancelled' WHERE id = ?", [booking.id]);
    if (booking.status === 'confirmed') {
      await conn.query('UPDATE slots SET booked_count = booked_count - 1 WHERE id = ?', [
        booking.slot_id,
      ]);
    }
    await conn.commit();
    res.json({ ok: true });
  } catch (err) {
    try {
      await conn.rollback();
    } catch (_) {}
    next(err);
  } finally {
    conn.release();
  }
});

module.exports = router;
