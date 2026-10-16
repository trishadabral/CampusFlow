// Admin control center: the full pipeline at a glance — per-drive stats,
// the master schedule of every test & interview session, and who is where.

const express = require('express');
const pool = require('../db');
const { authenticateToken, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(authenticateToken, requireRole('admin'));

// GET /admin/overview — one row per drive: stage, funnel counts, readiness
router.get('/overview', async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT d.id, d.title, d.status, d.test_date, d.interview_date,
              d.num_interviewers, d.min_test_score, d.max_shortlist,
              c.name AS company_name,
              COUNT(DISTINCT a.id) AS applied,
              COUNT(DISTINCT tr.student_id) AS tests_taken,
              COUNT(DISTINCT CASE WHEN a.status IN ('shortlisted','selected') THEN a.id END) AS shortlisted,
              COUNT(DISTINCT CASE WHEN a.status = 'selected' THEN a.id END) AS selected,
              COUNT(DISTINCT CASE WHEN s.type = 'test' THEN s.id END) AS test_sessions,
              COUNT(DISTINCT CASE WHEN s.type = 'interview' THEN s.id END) AS interview_slots,
              (SELECT COUNT(*) FROM test_questions q WHERE q.drive_id = d.id) AS questions
       FROM drives d
       JOIN companies c ON c.id = d.company_id
       LEFT JOIN applications a ON a.drive_id = d.id
       LEFT JOIN test_results tr ON tr.drive_id = d.id
       LEFT JOIN slots s ON s.drive_id = d.id
       GROUP BY d.id
       ORDER BY d.application_deadline DESC`
    );
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
    const [rows] = await pool.query(
      `SELECT s.id, s.type, s.title, s.starts_at, s.ends_at, s.capacity, s.booked_count,
              d.id AS drive_id, d.title AS drive_title, c.name AS company_name,
              r.name AS venue, r.type AS venue_type
       FROM slots s
       JOIN drives d ON d.id = s.drive_id
       JOIN companies c ON c.id = d.company_id
       LEFT JOIN resources r ON r.id = s.resource_id
       ORDER BY s.starts_at`
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// GET /admin/drive/:id/roster — who is where: every applicant with session + result
router.get('/drive/:id/roster', async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT u.name, u.email, s.roll_no, s.branch, s.cgpa,
              a.status, a.applied_at,
              tr.percentage AS test_percentage,
              ts.title AS test_session, ts.starts_at AS test_at, tr2.name AS test_venue,
              iv.title AS interview_slot, iv.starts_at AS interview_at, ir.name AS interview_venue
       FROM applications a
       JOIN students s ON s.user_id = a.student_id
       JOIN users u ON u.id = s.user_id
       LEFT JOIN test_results tr ON tr.drive_id = a.drive_id AND tr.student_id = a.student_id
       LEFT JOIN bookings bt ON bt.student_id = a.student_id AND bt.status = 'confirmed'
       LEFT JOIN slots ts ON ts.id = bt.slot_id AND ts.drive_id = a.drive_id AND ts.type = 'test'
       LEFT JOIN resources tr2 ON tr2.id = ts.resource_id
       LEFT JOIN bookings bi ON bi.student_id = a.student_id AND bi.status = 'confirmed'
       LEFT JOIN slots iv ON iv.id = bi.slot_id AND iv.drive_id = a.drive_id AND iv.type = 'interview'
       LEFT JOIN resources ir ON ir.id = iv.resource_id
       WHERE a.drive_id = ?
       GROUP BY a.id
       ORDER BY tr.percentage DESC, u.name`,
      [req.params.id]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
