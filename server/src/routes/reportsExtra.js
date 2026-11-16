// server/src/routes/reportsExtra.js
// Extra reporting endpoints for OS Lab (branches, companies, packages) and CSV export.
// Merged from Ishika's repo 2026-11-16. The three views live in
// database/schema.sql (and migrate_v7.sql); they read `offer_letters`,
// not a separate `offers` table, so "placed"/"offers" counts come from
// accepted/pending letters. Recruiter scoping uses the recruiter's own
// drives (users has no company link in this repo).

const express = require('express');
const pool = require('../dbms/db');
const { authenticateToken, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(authenticateToken);

// Helper to enforce admin or recruiter access
function adminOnly(req, res, next) {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only.' });
  next();
}
function recruiterOrAdmin(req, res, next) {
  if (req.user.role === 'admin' || req.user.role === 'recruiter') return next();
  return res.status(403).json({ error: 'Admin or recruiter required.' });
}

// GET /api/reports/branches – admin only
router.get('/branches', adminOnly, async (req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT * FROM v_branch_placement');
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

// GET /api/reports/companies – admin sees all, recruiter sees own companies only
router.get('/companies', recruiterOrAdmin, async (req, res, next) => {
  try {
    let sql = 'SELECT * FROM v_company_funnel';
    const params = [];
    if (req.user.role === 'recruiter') {
      sql += ' WHERE company_id IN (SELECT company_id FROM drives WHERE created_by = ?)';
      params.push(req.user.id);
    }
    const [rows] = await pool.query(sql, params);
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

// GET /api/reports/packages – admin only
router.get('/packages', adminOnly, async (req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT * FROM v_package_stats');
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

// CSV export helper – builds simple CSV string with UTF-8 BOM and safe quoting
function toCsv(rows) {
  if (!rows || !rows.length) return '';
  const headers = Object.keys(rows[0]);
  const escape = (val) => {
    if (val == null) return '';
    const s = String(val);
    // prefix dangerous formulas
    const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
    // quote if contains comma, quote, or newline
    if (/[",\n]/.test(safe)) return `"${safe.replace(/"/g, '""')}"`;
    return safe;
  };
  const lines = [];
  lines.push(headers.map(escape).join(','));
  rows.forEach(row => {
    lines.push(headers.map(h => escape(row[h])).join(','));
  });
  return '\uFEFF' + lines.join('\r\n');
}

// CSV endpoints – admin only for all, recruiter limited to own companies for companies CSV
router.get('/branches.csv', adminOnly, async (req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT * FROM v_branch_placement');
    const csv = toCsv(rows);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="branches.csv"');
    res.send(csv);
  } catch (e) {
    next(e);
  }
});

router.get('/companies.csv', recruiterOrAdmin, async (req, res, next) => {
  try {
    let sql = 'SELECT * FROM v_company_funnel';
    const params = [];
    if (req.user.role === 'recruiter') {
      sql += ' WHERE company_id IN (SELECT company_id FROM drives WHERE created_by = ?)';
      params.push(req.user.id);
    }
    const [rows] = await pool.query(sql, params);
    const csv = toCsv(rows);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="companies.csv"');
    res.send(csv);
  } catch (e) {
    next(e);
  }
});

router.get('/packages.csv', adminOnly, async (req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT * FROM v_package_stats');
    const csv = toCsv(rows);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="packages.csv"');
    res.send(csv);
  } catch (e) {
    next(e);
  }
});

module.exports = router;
