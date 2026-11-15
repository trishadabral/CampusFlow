// Lab-agent routes — the C++ lab agent (agent/lab-agent.cpp) reports here.
//
// The agent has no login, so it authenticates with a shared key instead:
// header X-Agent-Key must match env LAB_AGENT_KEY. The default
// 'dev-agent-key' is for local development only — a real deployment must
// set LAB_AGENT_KEY (see agent/README.md). Wrong or missing key -> 401.
//
// 'down' is never stored by the agent: it is inferred in the GET response
// below when a machine has not reported for over 5 minutes. A machine that
// has gone quiet cannot report itself.

const express = require('express');
const pool = require('../dbms/db');
const { authenticateToken, requireRole } = require('../middleware/auth');

const router = express.Router();

// A machine is treated as down when it has not reported for this long.
const STALE_MINUTES = 5;
const REPORTABLE = ['up', 'free', 'busy'];

function agentKey() {
  return process.env.LAB_AGENT_KEY || 'dev-agent-key';
}

function checkAgentKey(req, res, next) {
  if (req.get('X-Agent-Key') !== agentKey()) {
    return res
      .status(401)
      .json({ error: 'This report needs the lab agent key. Check LAB_AGENT_KEY on the server.' });
  }
  next();
}

// POST /lab-agent/report — upsert each machine's live status.
// Body: { lab_resource_id, machines: [{ name, status }], reported_by? }
router.post('/report', checkAgentKey, async (req, res, next) => {
  try {
    const { lab_resource_id, machines, reported_by } = req.body || {};
    if (!Number.isInteger(lab_resource_id) || lab_resource_id <= 0) {
      return res
        .status(400)
        .json({ error: 'lab_resource_id must be the numeric id of a lab in Resources.' });
    }
    if (!Array.isArray(machines) || !machines.length) {
      return res.status(400).json({ error: 'machines must be a non-empty list of machine reports.' });
    }
    for (const m of machines) {
      if (!m || typeof m.name !== 'string' || !m.name.trim()) {
        return res.status(400).json({ error: 'Every machine report needs a name.' });
      }
      if (!REPORTABLE.includes(m.status)) {
        return res.status(400).json({
          error: `Machine status must be one of: ${REPORTABLE.join(', ')}. ` +
            'Machines cannot report themselves as down — the server marks quiet machines down by itself.',
        });
      }
    }

    const [[lab]] = await pool.query(
      "SELECT id FROM resources WHERE id = ? AND type = 'lab'",
      [lab_resource_id]
    );
    if (!lab) {
      return res
        .status(400)
        .json({ error: 'No lab with that id. Check the lab id in Resources first.' });
    }

    // Whoever reports identifies itself (the C++ agent sends
    // "lab-agent"); fall back to that when the field is missing, so
    // other reporters can be told apart in the status view.
    const reportedBy =
      typeof reported_by === 'string' && reported_by.trim()
        ? reported_by.trim().slice(0, 100)
        : 'lab-agent';

    // One statement per machine; ON DUPLICATE KEY re-reports the same
    // machine instead of duplicating it (UNIQUE(resource_id, machine_name)).
    for (const m of machines) {
      await pool.query(
        `INSERT INTO lab_machines (resource_id, machine_name, status, reported_by)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE status = VALUES(status), last_seen = NOW(), reported_by = VALUES(reported_by)`,
        [lab_resource_id, m.name.trim(), m.status, reportedBy]
      );
    }
    res.json({ reported: machines.length });
  } catch (err) {
    next(err);
  }
});

// GET /lab-agent/status — admin/recruiter: live machine list.
// 'down' is computed in the RESPONSE only (never written to the DB):
// a machine is down when it has not reported for over 5 minutes.
router.get('/status', authenticateToken, requireRole('admin', 'recruiter'), async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT lm.id, lm.resource_id, lm.machine_name, lm.status AS reported_status,
              lm.last_seen, lm.reported_by,
              r.name AS lab_name,
              TIMESTAMPDIFF(MINUTE, lm.last_seen, NOW()) AS minutes_since_last_seen
       FROM lab_machines lm
       LEFT JOIN resources r ON r.id = lm.resource_id
       ORDER BY r.name, lm.machine_name`
    );
    res.json(
      rows.map((r) => {
        const minutes = r.minutes_since_last_seen == null ? null : Number(r.minutes_since_last_seen);
        const stale = minutes != null && minutes > STALE_MINUTES;
        return {
          id: r.id,
          resource_id: r.resource_id,
          machine_name: r.machine_name,
          lab_name: r.lab_name,
          // What the machine last said, and what we conclude from its silence.
          reported_status: r.reported_status,
          status: stale ? 'down' : r.reported_status,
          last_seen: r.last_seen,
          minutes_since_last_seen: minutes,
          reported_by: r.reported_by,
        };
      })
    );
  } catch (err) {
    next(err);
  }
});

module.exports = router;
