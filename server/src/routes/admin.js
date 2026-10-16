// Admin control center: the full pipeline at a glance — per-drive stats,
// the master schedule of every test & interview session, and who is where.
// All SQL lives in dbms/reports.js; this route only shapes the JSON.

const express = require('express');
const { driveOverview, masterSchedule, driveRoster } = require('../dbms/reports');
const { authenticateToken, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(authenticateToken, requireRole('admin'));

// GET /admin/overview — one row per drive: stage, funnel counts, readiness
router.get('/overview', async (req, res, next) => {
  try {
    const rows = await driveOverview();
    res.json(
      rows.map((r) => ({
        id: r.id,
        title: r.title,
        company: r.company_name,
        stage: r.status,
        test_date: r.test_date,
        interview_date: r.interview_date,
        config: {
          num_interviewers: r.num_interviewers,
          min_test_score: Number(r.min_test_score),
          max_shortlist: r.max_shortlist,
        },
        applied: Number(r.applied || 0),
        tests_taken: Number(r.tests_taken || 0),
        shortlisted: Number(r.shortlisted || 0),
        selected: Number(r.selected || 0),
        test_sessions: Number(r.test_sessions || 0),
        interview_slots: Number(r.interview_slots || 0),
        questions: Number(r.questions || 0),
        // What the admin can do next, in order:
        next_action:
          r.status === 'open' && Number(r.applied || 0) > 0
            ? 'schedule_tests'
            : r.status === 'testing' && Number(r.tests_taken || 0) > 0
              ? 'publish_results'
              : null,
      }))
    );
  } catch (err) {
    next(err);
  }
});

// GET /admin/schedule — master timetable: every test & interview session
router.get('/schedule', async (req, res, next) => {
  try {
    res.json(await masterSchedule());
  } catch (err) {
    next(err);
  }
});

// GET /admin/drive/:id/roster — who is where: every applicant with session + result
router.get('/drive/:id/roster', async (req, res, next) => {
  try {
    res.json(await driveRoster(req.params.id));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
