// DBMS — audit trail reads.
//
// Triggers on bookings, applications and allocations write every mutation
// into audit_log (see database/schema.sql). The database records history by
// itself — the application can never "forget to log". This module reads that
// history back: the tamper-evident story of the whole placement operation.
//
// Powers the System Monitor's activity feed today, and the admin audit-log
// viewer planned for Phase 2.

const pool = require('./db');

function parseLimit(value, def = 50, max = 500) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) return def;
  return Math.min(n, max);
}

// recentActivity — newest audit entries first (the monitor's activity feed).
async function recentActivity({ limit = 50 } = {}) {
  const [rows] = await pool.query(
    `SELECT id, action, entity, entity_id, details, created_at
     FROM audit_log
     ORDER BY id DESC
     LIMIT ?`,
    [parseLimit(limit)]
  );
  return rows;
}

// entityHistory — every recorded change to one record, oldest first,
// so the full story reads top to bottom. Uses the idx_audit_entity index.
async function entityHistory(entity, entityId, { limit = 100 } = {}) {
  const [rows] = await pool.query(
    `SELECT id, action, entity, entity_id, details, created_at
     FROM audit_log
     WHERE entity = ? AND entity_id = ?
     ORDER BY id ASC
     LIMIT ?`,
    [entity, entityId, parseLimit(limit, 100)]
  );
  return rows;
}

// activitySummary — "what happened this week": counts grouped by action and
// entity. One GROUP BY over the indexed created_at column.
async function activitySummary({ days = 7 } = {}) {
  const [rows] = await pool.query(
    `SELECT action, entity, COUNT(*) AS events
     FROM audit_log
     WHERE created_at >= NOW() - INTERVAL ? DAY
     GROUP BY action, entity
     ORDER BY events DESC`,
    [Number(days) > 0 ? Number(days) : 7]
  );
  return rows.map((r) => ({ action: r.action, entity: r.entity, events: Number(r.events) }));
}

module.exports = { recentActivity, entityHistory, activitySummary };
