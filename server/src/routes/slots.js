// Slot routes.
const express = require('express');
const pool = require('../db');
const { authenticateToken, requireRole } = require('../middleware/auth');

const router = express.Router();

function shapeSlot(row) {
  return {
    id: row.id,
    drive_id: row.drive_id,
    type: row.type,
    title: row.title,
    starts_at: row.starts_at,
    ends_at: row.ends_at,
    capacity: row.capacity,
    booked_count: row.booked_count,
    seats_left: row.capacity - row.booked_count,
  };
}

// GET /slots?drive_id=
router.get('/', async (req, res, next) => {
  try {
    const { drive_id } = req.query;
    const [rows] = await pool.query(
      `SELECT * FROM slots ${drive_id ? 'WHERE drive_id = ?' : ''} ORDER BY starts_at`,
      drive_id ? [drive_id] : []
    );
    res.json(rows.map(shapeSlot));
  } catch (err) {
    next(err);
  }
});

// POST /slots — recruiter creates a test/interview slot
router.post('/', authenticateToken, requireRole('recruiter', 'admin'), async (req, res, next) => {
  try {
    const { drive_id, type, title, starts_at, ends_at, capacity } = req.body || {};
    if (!drive_id || !type || !title || !starts_at || !ends_at || capacity == null) {
      return res
        .status(400)
        .json({ error: 'drive_id, type, title, starts_at, ends_at and capacity are required.' });
    }
    if (!['test', 'interview'].includes(type)) {
      return res.status(400).json({ error: 'Type must be either test or interview.' });
    }
    if (Number(capacity) <= 0) {
      return res.status(400).json({ error: 'Capacity must be a positive number.' });
    }
    if (new Date(ends_at) <= new Date(starts_at)) {
      return res.status(400).json({ error: 'The slot must end after it starts.' });
    }
    const [drives] = await pool.query('SELECT id FROM drives WHERE id = ?', [drive_id]);
    if (!drives.length) {
      return res.status(404).json({ error: 'Drive not found.' });
    }
    const [result] = await pool.query(
      'INSERT INTO slots (drive_id, type, title, starts_at, ends_at, capacity) VALUES (?, ?, ?, ?, ?, ?)',
      [drive_id, type, title, starts_at, ends_at, capacity]
    );
    const [rows] = await pool.query('SELECT * FROM slots WHERE id = ?', [result.insertId]);
    res.status(201).json({ slot: shapeSlot(rows[0]) });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
