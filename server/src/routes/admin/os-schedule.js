// server/src/routes/admin/os-schedule.js
// Admin OS scheduling endpoints (run a single algorithm or compare all).
// Merged from Ishika's repo 2026-11-16, fixed:
// - Route paths are '/run' and '/compare' (mounted at /api/os/schedule in
//   index.js, matching what client api.js calls). In Ishika's repo these
//   were '/schedule/run' mounted under /api/admin/os/schedule, so the
//   client call /api/os/schedule/run hit nothing in either place.
// - 'rr' is NOT in the compare list: Round-Robin was deliberately removed
//   from this app (preemptive time-slicing makes no sense for interviews),
//   so the lab compares fcfs / priority / sjf / srtf only.

const express = require('express');
const pool = require('../../dbms/db');
const { authenticateToken, requireRole } = require('../../middleware/auth');
const { withTransaction } = require('../../dbms/transactions');
const { simulate } = require('../../os/cpu-scheduler');

const router = express.Router();
router.use(authenticateToken, requireRole('admin'));

// Helper to validate process objects
function validateProcesses(procs) {
  if (!Array.isArray(procs) || !procs.length) return 'processes must be a non-empty array';
  for (const p of procs) {
    if (typeof p.id !== 'number' && typeof p.id !== 'string') return 'each process must have an id';
    if (typeof p.burst !== 'number' || p.burst <= 0) return 'burst must be a positive number';
    if (p.arrival != null && typeof p.arrival !== 'number') return 'arrival must be a number if provided';
    if (p.priority != null && typeof p.priority !== 'number') return 'priority must be a number if provided';
  }
  return null;
}

// POST /api/os/schedule/run
router.post('/run', async (req, res, next) => {
  try {
    const { algorithm, quantum, processes } = req.body || {};
    const err = validateProcesses(processes);
    if (err) return res.status(400).json({ error: err });
    if (!algorithm) return res.status(400).json({ error: 'algorithm is required' });
    const result = simulate(algorithm, processes, quantum);
    // Persist run
    await withTransaction(async conn => {
      await conn.query(
        `INSERT INTO os_runs (module, algorithm, input_json, result_json, created_by) VALUES (?,?,?,?,?)`,
        ['cpu-scheduler', algorithm, JSON.stringify({ processes, quantum }), JSON.stringify(result), req.user.id]
      );
    });
    res.json(result);
  } catch (e) {
    next(e);
  }
});

// POST /api/os/schedule/compare
router.post('/compare', async (req, res, next) => {
  try {
    const { processes, quantum } = req.body || {};
    const err = validateProcesses(processes);
    if (err) return res.status(400).json({ error: err });
    const algorithms = ['fcfs', 'priority', 'sjf', 'srtf'];
    const results = {};
    for (const alg of algorithms) {
      results[alg] = simulate(alg, processes, quantum);
    }
    // Persist a compare run – store as one row with algorithm='compare'
    await withTransaction(async conn => {
      await conn.query(
        `INSERT INTO os_runs (module, algorithm, input_json, result_json, created_by) VALUES (?,?,?,?,?)`,
        ['cpu-scheduler', 'compare', JSON.stringify({ processes, quantum }), JSON.stringify(results), req.user.id]
      );
    });
    res.json(results);
  } catch (e) {
    next(e);
  }
});

module.exports = router;
