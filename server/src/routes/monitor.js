// Kernel Monitor routes: lock table, stats, audit activity, stress test.
const express = require('express');
const bcrypt = require('bcryptjs');
const pool = require('../dbms/db');
const { tableCounts } = require('../dbms/db');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { bookSeat } = require('../os/critical-section');
const { recentActivity } = require('../dbms/audit');
const { runDemo } = require('../os/deadlock-demo');

const router = express.Router();

function parseLimit(value, def = 50, max = 500) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) return def;
  return Math.min(n, max);
}

// GET /monitor/locks?limit=50 — newest lock events first
router.get('/locks', authenticateToken, requireRole('admin'), async (req, res, next) => {
  try {
    const limit = parseLimit(req.query.limit);
    const [rows] = await pool.query(
      'SELECT id, lock_name, holder, action, wait_ms, created_at FROM lock_events ORDER BY id DESC LIMIT ?',
      [limit]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// GET /monitor/stats — table counts + currently held locks
router.get('/stats', authenticateToken, requireRole('admin'), async (req, res, next) => {
  try {
    const counts = await tableCounts();
    // A lock is "active" when the latest event for its (lock, holder) pair
    // is an acquire/wait with no matching release yet.
    const [[active]] = await pool.query(
      `SELECT COUNT(*) AS active_locks
       FROM (SELECT lock_name, holder, MAX(id) AS max_id
             FROM lock_events GROUP BY lock_name, holder) t
       JOIN lock_events le ON le.id = t.max_id
       WHERE le.action IN ('acquire', 'wait')`
    );
    res.json({
      students: Number(counts.students),
      drives: Number(counts.drives),
      applications: Number(counts.applications),
      bookings: Number(counts.bookings),
      resources: Number(counts.resources),
      active_locks: Number(active.active_locks),
    });
  } catch (err) {
    next(err);
  }
});

// GET /monitor/activity?limit=50 — newest audit_log entries first
// (SQL lives in dbms/audit.js; this route shapes the JSON)
router.get('/activity', authenticateToken, requireRole('admin'), async (req, res, next) => {
  try {
    const rows = await recentActivity({ limit: req.query.limit });
    res.json(
      rows.map((r) => ({
        id: r.id,
        action: r.action,
        entity: r.entity,
        entity_id: r.entity_id,
        details:
          r.details == null
            ? null
            : typeof r.details === 'string'
              ? JSON.parse(r.details)
              : r.details,
        created_at: r.created_at,
      }))
    );
  } catch (err) {
    next(err);
  }
});

// POST /monitor/stress — admin fires `count` concurrent booking attempts.
// Correctness guarantee: confirmed == min(count, seats available), because
// every attempt serializes on the slot row lock (see os/critical-section.js).
router.post('/stress', authenticateToken, requireRole('admin'), async (req, res, next) => {
  try {
    const { slot_id, count } = req.body || {};
    const n = Number(count);
    if (!slot_id) {
      return res.status(400).json({ error: 'slot_id is required.' });
    }
    if (!Number.isInteger(n) || n < 1 || n > 200) {
      return res.status(400).json({ error: 'count must be an integer between 1 and 200.' });
    }
    const [[slot]] = await pool.query('SELECT id, capacity, booked_count FROM slots WHERE id = ?', [
      slot_id,
    ]);
    if (!slot) {
      return res.status(404).json({ error: 'Slot not found.' });
    }

    const t0 = Date.now();

    // Temporary student accounts so repeated runs always race cleanly.
    const tag = `${Date.now()}${Math.floor(Math.random() * 90 + 10)}`;
    const hash = await bcrypt.hash('password123', 10); // one hash reused for all temp users
    const branches = ['CSE', 'IT', 'ECE'];
    const userRows = [];
    for (let i = 0; i < n; i++) {
      userRows.push([`Stress Student ${i + 1}`, `stress${tag}${i}@test.local`, hash, 'student']);
    }
    const [uRes] = await pool.query(
      'INSERT INTO users (name, email, password_hash, role) VALUES ?',
      [userRows]
    );
    const firstId = uRes.insertId;
    const studentRows = [];
    for (let i = 0; i < n; i++) {
      studentRows.push([
        firstId + i,
        `ST${tag}${i}`,
        branches[i % branches.length],
        (8 + (i % 20) / 10).toFixed(2),
        0,
        2027,
      ]);
    }
    await pool.query(
      'INSERT INTO students (user_id, roll_no, branch, cgpa, backlogs, graduation_year) VALUES ?',
      [studentRows]
    );

    const ids = Array.from({ length: n }, (_, i) => firstId + i);
    let confirmed = 0;
    try {
      const results = await Promise.allSettled(
        ids.map((id) => bookSeat(slot_id, id, 'stress-test'))
      );
      confirmed = results.filter((r) => r.status === 'fulfilled').length;
    } finally {
      // In all outcomes, remove exactly the users created for the stress test
      // (merged from Ishika's repo 2026-11-16: the old version left up to
      // 200 throwaway accounts in the database after every run).
      try {
        await pool.query('DELETE FROM students WHERE user_id IN (?)', [ids]);
        await pool.query('DELETE FROM users WHERE id IN (?)', [ids]);
        // Deleting the temp users cascades their bookings away, so the
        // slot's counter would otherwise be left claiming seats that no
        // longer exist. Recompute it from the bookings that remain.
        await pool.query(
          "UPDATE slots SET booked_count = (SELECT COUNT(*) FROM bookings WHERE slot_id = ? AND status = 'confirmed') WHERE id = ?",
          [slot_id, slot_id]
        );
      } catch (cleanErr) {
        console.error('[stress] cleanup error:', cleanErr.message);
      }
    }

    res.json({ attempted: n, confirmed, rejected: n - confirmed, ms: Date.now() - t0 });
  } catch (err) {
    next(err);
  }
});

// POST /monitor/deadlock-demo — admin runs the guided deadlock demo.
// Pure in-memory teaching demo (os/deadlock-demo.js): pretend bookings only,
// never touches real bookings, slots or allocations. Stateless — the same
// demo runs identically every time.
router.post('/deadlock-demo', authenticateToken, requireRole('admin'), (req, res) => {
  res.json(runDemo());
});

module.exports = router;
