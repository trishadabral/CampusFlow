// Resource & allocation routes. Allocations run the Banker's safety check.
const express = require('express');
const pool = require('../dbms/db');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { checkAllocation } = require('../os/banker');

const router = express.Router();

// GET /resources
router.get('/resources', async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      'SELECT id, name, type, capacity, location, status FROM resources ORDER BY type, name'
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// POST /resources — admin adds a resource
router.post('/resources', authenticateToken, requireRole('admin'), async (req, res, next) => {
  try {
    const { name, type, capacity, location } = req.body || {};
    if (!name || !type) {
      return res.status(400).json({ error: 'Resource name and type are required.' });
    }
    if (!['lab', 'room', 'interviewer'].includes(type)) {
      return res.status(400).json({ error: 'Type must be one of: lab, room, interviewer.' });
    }
    const [result] = await pool.query(
      'INSERT INTO resources (name, type, capacity, location) VALUES (?, ?, ?, ?)',
      [name, type, capacity || 1, location || null]
    );
    const [rows] = await pool.query('SELECT * FROM resources WHERE id = ?', [result.insertId]);
    res.status(201).json({ resource: rows[0] });
  } catch (err) {
    next(err);
  }
});

// GET /allocations
router.get('/allocations', async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT a.id, a.purpose, a.seats_needed, a.starts_at, a.ends_at, a.slot_id,
              r.id AS resource_id, r.name AS resource_name, r.type AS resource_type,
              r.capacity AS resource_capacity, r.location AS resource_location
       FROM allocations a
       JOIN resources r ON r.id = a.resource_id
       ORDER BY a.starts_at`
    );
    res.json(
      rows.map((r) => ({
        id: r.id,
        resource: {
          id: r.resource_id,
          name: r.resource_name,
          type: r.resource_type,
          capacity: r.resource_capacity,
          location: r.resource_location,
        },
        purpose: r.purpose,
        seats_needed: r.seats_needed,
        starts_at: r.starts_at,
        ends_at: r.ends_at,
        slot_id: r.slot_id,
      }))
    );
  } catch (err) {
    next(err);
  }
});

// POST /allocations — admin/recruiter allocates a resource (Banker's safety check)
router.post(
  '/allocations',
  authenticateToken,
  requireRole('admin', 'recruiter'),
  async (req, res, next) => {
    try {
      const { resource_id, purpose, starts_at, ends_at, slot_id, seats_needed } = req.body || {};
      if (!resource_id || !purpose || !starts_at || !ends_at) {
        return res
          .status(400)
          .json({ error: 'resource_id, purpose, starts_at and ends_at are required.' });
      }
      if (isNaN(Date.parse(starts_at)) || isNaN(Date.parse(ends_at))) {
        return res.status(400).json({ error: 'starts_at and ends_at must be valid dates.' });
      }
      if (new Date(ends_at) <= new Date(starts_at)) {
        return res.status(400).json({ error: 'The allocation must end after it starts.' });
      }

      // Banker's check: throws a 409 with an explanation when unsafe.
      const { resource } = await checkAllocation(pool, {
        resource_id,
        seats_needed: seats_needed == null ? 1 : seats_needed,
        starts_at,
        ends_at,
      });

      const [result] = await pool.query(
        `INSERT INTO allocations (resource_id, slot_id, purpose, seats_needed, starts_at, ends_at, allocated_by)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          resource_id,
          slot_id || null,
          purpose,
          resource.type === 'lab' ? Math.max(1, Number(seats_needed) || 1) : 1,
          starts_at,
          ends_at,
          req.user.id,
        ]
      );
      res.status(201).json({
        allocation: {
          id: result.insertId,
          resource_id,
          slot_id: slot_id || null,
          purpose,
          starts_at,
          ends_at,
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
