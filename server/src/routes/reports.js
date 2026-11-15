// Reports routes. SQL lives in dbms/reports.js; this route shapes the JSON.
const express = require('express');
const pool = require('../dbms/db');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { placementReport, driveRoster, placementStats, analytics } = require('../dbms/reports');
const { toCSV } = require('../utils/csv');

const router = express.Router();

// Send rows as a downloadable CSV file (RFC 4180 via the shared helper).
function sendCSV(res, filename, columns, rows) {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(toCSV(columns, rows));
}

const PLACEMENT_COLUMNS = [
  { key: 'drive_title', header: 'Drive' },
  { key: 'company', header: 'Company' },
  { key: 'applied', header: 'Applied' },
  { key: 'shortlisted', header: 'Shortlisted' },
  { key: 'selected', header: 'Selected' },
  { key: 'avg_cgpa_shortlisted', header: 'Avg CGPA (shortlisted)' },
];

function placementRow(r) {
  return {
    drive_title: r.drive_title,
    company: r.company,
    applied: Number(r.applied || 0),
    shortlisted: Number(r.shortlisted || 0),
    selected: Number(r.selected || 0),
    avg_cgpa_shortlisted: r.avg_cgpa_shortlisted == null ? '' : Number(r.avg_cgpa_shortlisted),
  };
}

// GET /reports/export.csv — whole placement report as CSV
router.get(
  '/export.csv',
  authenticateToken,
  requireRole('admin', 'recruiter'),
  async (req, res, next) => {
    try {
      const rows = await placementReport();
      sendCSV(res, 'placement-report.csv', PLACEMENT_COLUMNS, rows.map(placementRow));
    } catch (err) {
      next(err);
    }
  }
);

// GET /reports/drives/:id/export.csv — one drive's placement row as CSV
router.get(
  '/drives/:id/export.csv',
  authenticateToken,
  requireRole('admin', 'recruiter'),
  async (req, res, next) => {
    try {
      const rows = await placementReport();
      const row = rows.find((r) => String(r.drive_id) === String(req.params.id));
      if (!row) return res.status(404).json({ error: 'Drive not found.' });
      sendCSV(res, `drive-${req.params.id}-placement.csv`, PLACEMENT_COLUMNS, [placementRow(row)]);
    } catch (err) {
      next(err);
    }
  }
);

// GET /reports/drives/:id/roster.csv — that drive's student list as CSV.
// Same access rule as the analytics route: the drive's recruiter, or an admin.
router.get(
  '/drives/:id/roster.csv',
  authenticateToken,
  requireRole('recruiter', 'admin'),
  async (req, res, next) => {
    try {
      const [drives] = await pool.query('SELECT id, created_by FROM drives WHERE id = ?', [req.params.id]);
      if (!drives.length) return res.status(404).json({ error: 'Drive not found.' });
      if (req.user.role !== 'admin' && drives[0].created_by !== req.user.id) {
        return res.status(403).json({ error: 'Only the recruiter who created this drive (or an admin) can download its list.' });
      }
      const rows = await driveRoster(req.params.id);
      sendCSV(res, `drive-${req.params.id}-roster.csv`, [
        { key: 'name', header: 'Name' },
        { key: 'email', header: 'Email' },
        { key: 'branch', header: 'Branch' },
        { key: 'cgpa', header: 'CGPA' },
        { key: 'status', header: 'Status' },
        { key: 'test_percentage', header: 'Test %' },
        { key: 'test_session', header: 'Test session' },
        { key: 'interview_slot', header: 'Interview slot' },
      ], rows.map((r) => ({
        name: r.name,
        email: r.email,
        branch: r.branch,
        cgpa: r.cgpa == null ? '' : Number(r.cgpa),
        status: r.status,
        test_percentage: r.test_percentage == null ? '' : Number(r.test_percentage),
        test_session: r.test_session ?? '',
        interview_slot: r.interview_slot ?? '',
      })));
    } catch (err) {
      next(err);
    }
  }
);

// GET /reports/placement — one row per drive (from the v_drive_report view)
router.get('/placement', authenticateToken, requireRole('admin', 'recruiter'), async (req, res, next) => {
  try {
    const rows = await placementReport();
    res.json(
      rows.map((r) => ({
        drive_id: r.drive_id,
        drive_title: r.drive_title,
        company: r.company,
        applied: Number(r.applied || 0),
        shortlisted: Number(r.shortlisted || 0),
        selected: Number(r.selected || 0),
        avg_cgpa_shortlisted:
          r.avg_cgpa_shortlisted == null ? null : Number(r.avg_cgpa_shortlisted),
      }))
    );
  } catch (err) {
    next(err);
  }
});

// GET /reports/placement-stats — year-wise placement %, packages, top recruiters
router.get('/placement-stats', authenticateToken, requireRole('admin'), async (req, res, next) => {
  try {
    res.json(await placementStats());
  } catch (err) {
    next(err);
  }
});

// GET /reports/drives/:id/analytics — per-drive charts (Phase 2, M2).
// Recruiter who created the drive, or an admin.
router.get(
  '/drives/:id/analytics',
  authenticateToken,
  requireRole('recruiter', 'admin'),
  async (req, res, next) => {
    try {
      const [rows] = await pool.query('SELECT id, created_by FROM drives WHERE id = ?', [req.params.id]);
      if (!rows.length) return res.status(404).json({ error: 'Drive not found.' });
      if (req.user.role !== 'admin' && rows[0].created_by !== req.user.id) {
        return res.status(403).json({ error: 'Only the recruiter who created this drive (or an admin) can see its analytics.' });
      }
      res.json(await analytics(req.params.id));
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
