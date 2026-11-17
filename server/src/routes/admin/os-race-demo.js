// server/src/routes/admin/os-race-demo.js
// Admin race-condition demonstration endpoint.
// - Route path is '/' (mounted at /api/os/race-demo in index.js, matching
//   what client api.js calls).
// - The safe-mode branch calls withTransaction(async conn => ...) —
//   withTransaction takes (work, actorId), not (pool, work).

const express = require('express');
const pool = require('../../dbms/db');
const { authenticateToken, requireRole } = require('../../middleware/auth');
const { withTransaction } = require('../../dbms/transactions');

const router = express.Router();
router.use(authenticateToken, requireRole('admin'));

// Validate payload
function validateBody(body) {
  const { mode, attempts, capacity } = body || {};
  if (!['unsafe', 'safe'].includes(mode)) return 'mode must be "unsafe" or "safe"';
  if (!Number.isInteger(attempts) || attempts < 1 || attempts > 200) return 'attempts must be integer 1..200';
  if (!Number.isInteger(capacity) || capacity < 1 || capacity > 50) return 'capacity must be integer 1..50';
  return null;
}

router.post('/', async (req, res, next) => {
  try {
    const err = validateBody(req.body);
    if (err) return res.status(400).json({ error: err });
    const { mode, attempts, capacity } = req.body;
    // Ensure a clean demo row exists
    const [{ insertId }] = await pool.query('INSERT INTO demo_seats (capacity, confirmed) VALUES (?,0)', [capacity]);
    const seatId = insertId;
    const start = Date.now();
    let oversold = 0;
    const timeline = [];
    if (mode === 'safe') {
      // Entire loop inside a transaction with row lock
      await withTransaction(async conn => {
        // lock the row
        await conn.query('SELECT confirmed FROM demo_seats WHERE id = ? FOR UPDATE', [seatId]);
        for (let i = 0; i < attempts; i++) {
          const [{ confirmed, capacity: cap }] = await conn.query('SELECT confirmed, capacity FROM demo_seats WHERE id = ?', [seatId]);
          if (confirmed < cap) {
            await conn.query('UPDATE demo_seats SET confirmed = confirmed + 1 WHERE id = ?', [seatId]);
            timeline.push({ attempt: i + 1, result: 'booked' });
          } else {
            timeline.push({ attempt: i + 1, result: 'full' });
          }
        }
      });
    } else {
      // unsafe: each attempt runs its own SELECT/UPDATE without lock
      for (let i = 0; i < attempts; i++) {
        const [{ confirmed, capacity: cap }] = await pool.query('SELECT confirmed, capacity FROM demo_seats WHERE id = ?', [seatId]);
        if (confirmed < cap) {
          await pool.query('UPDATE demo_seats SET confirmed = confirmed + 1 WHERE id = ?', [seatId]);
          timeline.push({ attempt: i + 1, result: 'booked' });
        } else {
          oversold += 1; // counting an oversell when we still try to book? we treat as oversell when confirmed >= capacity but we still increment
          // unsafe demo may still increment beyond capacity, so we force an extra update to simulate oversell
          await pool.query('UPDATE demo_seats SET confirmed = confirmed + 1 WHERE id = ?', [seatId]);
          timeline.push({ attempt: i + 1, result: 'oversold' });
        }
      }
    }
    const [{ confirmed, capacity: finalCap }] = await pool.query('SELECT confirmed, capacity FROM demo_seats WHERE id = ?', [seatId]);
    const durationMs = Date.now() - start;
    // Clean up demo row
    await pool.query('DELETE FROM demo_seats WHERE id = ?', [seatId]);
    res.json({ capacity: finalCap, confirmed, oversold, duration_ms: durationMs, timeline });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
