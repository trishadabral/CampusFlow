// Resource & allocation routes. Allocations run the Banker's safety check.
const express = require('express');
const pool = require('../dbms/db');
const { withActor } = require('../dbms/db');
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

      // withActor: the INSERT fires the audit trigger on this connection,
      // so the admin/recruiter making the booking is recorded as the actor.
      const [result] = await withActor(req.user.id, (conn) =>
        conn.query(
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
        )
      );
      res.status(201).json({
        allocation: {
          id: result.insertId,
          resource_id,
          slot_id: slot_id || null,
          purpose,
          seats_needed: resource.type === 'lab' ? Math.max(1, Number(seats_needed) || 1) : 1,
          starts_at,
          ends_at,
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

// --- Resource calendar (Phase 2, M4) -------------------------------------
// Week view of every lab/room: system sessions (slots) + hand-added
// manual_events. Slots are read-only here; only manual events can be
// created, moved or deleted.

// Overlap test: two bookings clash exactly when each one starts before
// the other ends. Adjacent bookings that only touch at an endpoint
// (one ends 10:00, the next starts 10:00) do NOT overlap, because the
// comparisons are strict: existing.starts < new.ends AND existing.ends > new.starts.
async function hasOverlap(resourceId, startsAt, endsAt, excludeManualEventId) {
  const [slotRows] = await pool.query(
    `SELECT id FROM slots
      WHERE resource_id = ? AND starts_at < ? AND ends_at > ? LIMIT 1`,
    [resourceId, endsAt, startsAt]
  );
  if (slotRows.length) return true;
  const params = [resourceId, endsAt, startsAt];
  let sql =
    `SELECT id FROM manual_events
      WHERE resource_id = ? AND starts_at < ? AND ends_at > ?`;
  if (excludeManualEventId != null) {
    sql += ' AND id <> ?';
    params.push(excludeManualEventId);
  }
  const [eventRows] = await pool.query(sql + ' LIMIT 1', params);
  return eventRows.length > 0;
}

// GET /resources/calendar?from=YYYY-MM-DD&to=YYYY-MM-DD — events in range
router.get(
  '/resources/calendar',
  authenticateToken,
  requireRole('admin', 'recruiter'),
  async (req, res, next) => {
    try {
      const { from, to } = req.query;
      if (!from || !to || isNaN(Date.parse(from)) || isNaN(Date.parse(to))) {
        return res.status(400).json({ error: 'Give a from and to date (YYYY-MM-DD).' });
      }
      if (new Date(to) < new Date(from)) {
        return res.status(400).json({ error: 'The end date must be on or after the start date.' });
      }
      // Half-open range [from 00:00, day-after-to 00:00) so an event that
      // starts exactly at midnight on the `to` day is still included.
      const rangeStart = `${from} 00:00:00`;
      const endDate = new Date(to);
      endDate.setDate(endDate.getDate() + 1);
      const rangeEnd = `${endDate.toISOString().slice(0, 10)} 00:00:00`;

      const [resources] = await pool.query(
        "SELECT id, name, type, capacity, location FROM resources WHERE type IN ('lab', 'room') ORDER BY type, name"
      );
      const [slotRows] = await pool.query(
        `SELECT s.id, s.type, s.title, s.starts_at, s.ends_at, s.capacity, s.booked_count,
                s.resource_id, r.name AS resource_name, d.title AS drive_title
         FROM slots s
         JOIN drives d ON d.id = s.drive_id
         LEFT JOIN resources r ON r.id = s.resource_id
         WHERE s.resource_id IS NOT NULL AND s.starts_at < ? AND s.ends_at > ?
         ORDER BY s.starts_at`,
        [rangeEnd, rangeStart]
      );
      const [manualRows] = await pool.query(
        `SELECT me.id, me.resource_id, me.title, me.starts_at, me.ends_at,
                r.name AS resource_name
         FROM manual_events me
         JOIN resources r ON r.id = me.resource_id
         WHERE me.starts_at < ? AND me.ends_at > ?
         ORDER BY me.starts_at`,
        [rangeEnd, rangeStart]
      );
      const events = [
        ...slotRows.map((s) => ({
          id: `slot-${s.id}`,
          kind: 'slot',
          slot_id: s.id,
          resource_id: s.resource_id,
          resource_name: s.resource_name,
          title: s.title,
          drive_title: s.drive_title,
          type: s.type,
          starts_at: s.starts_at,
          ends_at: s.ends_at,
          capacity: s.capacity,
          booked_count: s.booked_count,
        })),
        ...manualRows.map((m) => ({
          id: `manual-${m.id}`,
          kind: 'manual',
          manual_event_id: m.id,
          resource_id: m.resource_id,
          resource_name: m.resource_name,
          title: m.title,
          starts_at: m.starts_at,
          ends_at: m.ends_at,
        })),
      ].sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at));
      res.json({ from, to, resources, events });
    } catch (err) {
      next(err);
    }
  }
);

// POST /resources/manual-events — admin books a room by hand
router.post(
  '/resources/manual-events',
  authenticateToken,
  requireRole('admin'),
  async (req, res, next) => {
    try {
      const { resourceId, title, startsAt, endsAt } = req.body || {};
      if (!resourceId || !title || !startsAt || !endsAt) {
        return res.status(400).json({ error: 'Resource, title, start and end time are required.' });
      }
      if (isNaN(Date.parse(startsAt)) || isNaN(Date.parse(endsAt))) {
        return res.status(400).json({ error: 'Start and end must be valid dates.' });
      }
      if (new Date(endsAt) <= new Date(startsAt)) {
        return res.status(400).json({ error: 'The booking must end after it starts.' });
      }
      const [resRows] = await pool.query('SELECT id, name FROM resources WHERE id = ?', [resourceId]);
      if (!resRows.length) {
        return res.status(404).json({ error: 'Resource not found.' });
      }
      if (await hasOverlap(resourceId, startsAt, endsAt, null)) {
        return res.status(409).json({ error: 'That room is already booked at that time.' });
      }
      const [result] = await pool.query(
        'INSERT INTO manual_events (resource_id, title, starts_at, ends_at, created_by) VALUES (?, ?, ?, ?, ?)',
        [resourceId, title.trim(), startsAt, endsAt, req.user.id]
      );
      const [rows] = await pool.query(
        `SELECT me.id, me.resource_id, me.title, me.starts_at, me.ends_at, r.name AS resource_name
         FROM manual_events me JOIN resources r ON r.id = me.resource_id WHERE me.id = ?`,
        [result.insertId]
      );
      res.status(201).json({ event: rows[0] });
    } catch (err) {
      next(err);
    }
  }
);

// PATCH /resources/manual-events/:id — move a manual event (same overlap check, excluding itself)
router.patch(
  '/resources/manual-events/:id',
  authenticateToken,
  requireRole('admin'),
  async (req, res, next) => {
    try {
      const [existing] = await pool.query('SELECT * FROM manual_events WHERE id = ?', [req.params.id]);
      if (!existing.length) {
        return res.status(404).json({ error: 'Booking not found.' });
      }
      const startsAt = req.body?.startsAt || existing[0].starts_at;
      const endsAt = req.body?.endsAt || existing[0].ends_at;
      if (isNaN(Date.parse(startsAt)) || isNaN(Date.parse(endsAt))) {
        return res.status(400).json({ error: 'Start and end must be valid dates.' });
      }
      if (new Date(endsAt) <= new Date(startsAt)) {
        return res.status(400).json({ error: 'The booking must end after it starts.' });
      }
      if (await hasOverlap(existing[0].resource_id, startsAt, endsAt, existing[0].id)) {
        return res.status(409).json({ error: 'That room is already booked at that time.' });
      }
      await pool.query('UPDATE manual_events SET starts_at = ?, ends_at = ? WHERE id = ?', [
        startsAt,
        endsAt,
        existing[0].id,
      ]);
      const [rows] = await pool.query(
        `SELECT me.id, me.resource_id, me.title, me.starts_at, me.ends_at, r.name AS resource_name
         FROM manual_events me JOIN resources r ON r.id = me.resource_id WHERE me.id = ?`,
        [existing[0].id]
      );
      res.json({ event: rows[0] });
    } catch (err) {
      next(err);
    }
  }
);

// DELETE /resources/manual-events/:id
router.delete(
  '/resources/manual-events/:id',
  authenticateToken,
  requireRole('admin'),
  async (req, res, next) => {
    try {
      const [result] = await pool.query('DELETE FROM manual_events WHERE id = ?', [req.params.id]);
      if (!result.affectedRows) {
        return res.status(404).json({ error: 'Booking not found.' });
      }
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
