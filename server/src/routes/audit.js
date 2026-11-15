// Admin audit-log viewer — searchable, filterable history of everything
// the database triggers recorded (bookings, applications, allocations).
// SQL lives in dbms/audit.js; this route only validates the filters and
// shapes the JSON. All queries are parameterised.

const express = require('express');
const { searchActivity, entityHistory, activitySummary } = require('../dbms/audit');
const { authenticateToken, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(authenticateToken, requireRole('admin'));

function parseDetails(row) {
  return {
    id: row.id,
    action: row.action,
    entity: row.entity,
    entity_id: row.entity_id,
    details:
      row.details == null
        ? null
        : typeof row.details === 'string'
          ? JSON.parse(row.details)
          : row.details,
    actor_id: row.actor_id ?? null,
    actor_name: row.actor_name ?? null,
    created_at: row.created_at,
  };
}

function badDate(value) {
  return value != null && value !== '' && Number.isNaN(Date.parse(value));
}

// GET /admin/audit?q=&entity=&action=&user_id=&from=&to=&limit=&offset=
// Search across what was changed, filter by area / what happened / who /
// date range. Newest first, paginated (limit default 50, max 100).
router.get('/', async (req, res, next) => {
  try {
    const { q, entity, action, user_id, from, to } = req.query;
    if (badDate(from) || badDate(to)) {
      return res.status(400).json({ error: 'That date does not look right. Use a calendar date.' });
    }
    if (user_id != null && user_id !== '' && !/^\d+$/.test(user_id)) {
      return res.status(400).json({ error: 'User id must be a number.' });
    }
    if (from && to && new Date(from) > new Date(to)) {
      return res.status(400).json({ error: 'The start date must be before the end date.' });
    }
    const { rows, total, limit, offset } = await searchActivity({
      q: q || undefined,
      entity: entity || undefined,
      action: action || undefined,
      actorId: user_id ? Number(user_id) : undefined,
      from: from || undefined,
      to: to || undefined,
      limit: req.query.limit,
      offset: req.query.offset,
    });
    res.json({ rows: rows.map(parseDetails), total, limit, offset });
  } catch (err) {
    next(err);
  }
});

// GET /admin/audit/summary?days=7 — counts by what happened and which area.
router.get('/summary', async (req, res, next) => {
  try {
    const days = Number(req.query.days);
    if (req.query.days != null && (!Number.isInteger(days) || days < 1 || days > 90)) {
      return res.status(400).json({ error: 'Days must be a whole number between 1 and 90.' });
    }
    res.json(await activitySummary({ days: Number.isInteger(days) ? days : 7 }));
  } catch (err) {
    next(err);
  }
});

// GET /admin/audit/:entity/:entityId — the full change history of one record,
// oldest first so the story reads top to bottom.
router.get('/:entity/:entityId', async (req, res, next) => {
  try {
    const { entity, entityId } = req.params;
    if (!/^[a-z_]+$/.test(entity)) {
      return res.status(400).json({ error: 'That area name does not look right.' });
    }
    if (!/^\d+$/.test(entityId)) {
      return res.status(400).json({ error: 'Record id must be a number.' });
    }
    const rows = await entityHistory(entity, Number(entityId));
    res.json(rows.map(parseDetails));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
