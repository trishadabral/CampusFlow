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

// searchActivity — the admin audit-log viewer: search + filters + pages.
// q searches what was changed (entity, record id, details); entity/action/
// actor narrow it down; from/to bound the date range. Newest first.
// All values are parameters — nothing is ever spliced into the SQL.
async function searchActivity({ q, entity, action, actorId, from, to, limit = 50, offset = 0 } = {}) {
  const where = [];
  const params = [];
  if (q) {
    const like = `%${q}%`;
    where.push('(a.entity LIKE ? OR CAST(a.entity_id AS CHAR) LIKE ? OR CAST(a.details AS CHAR) LIKE ?)');
    params.push(like, like, like);
  }
  if (entity) {
    where.push('a.entity = ?');
    params.push(entity);
  }
  if (action) {
    where.push('a.action = ?');
    params.push(action);
  }
  if (actorId != null) {
    where.push('a.actor_id = ?');
    params.push(actorId);
  }
  if (from) {
    where.push('a.created_at >= ?');
    params.push(from);
  }
  if (to) {
    where.push('a.created_at <= ?');
    params.push(to);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const lim = Math.min(Math.max(parseLimit(limit, 50, 100), 1), 100);
  const off = Math.max(Number(offset) || 0, 0);

  const [[{ total }]] = await pool.query(
    `SELECT COUNT(*) AS total FROM audit_log a ${whereSql}`,
    params
  );
  const [rows] = await pool.query(
    `SELECT a.id, a.action, a.entity, a.entity_id, a.details, a.created_at,
            a.actor_id, u.name AS actor_name
     FROM audit_log a
     LEFT JOIN users u ON u.id = a.actor_id
     ${whereSql}
     ORDER BY a.id DESC
     LIMIT ? OFFSET ?`,
    [...params, lim, off]
  );
  return { rows, total: Number(total), limit: lim, offset: off };
}

module.exports = { recentActivity, entityHistory, activitySummary, searchActivity };
