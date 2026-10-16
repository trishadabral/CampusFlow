// Student journey: one endpoint powering the "My journey" dashboard.
// For every application, returns the full pipeline state the student cares
// about: application → test session (venue/time) → result → interview.

const express = require('express');
const pool = require('../dbms/db');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { fmtWhen } = require('../os/pipeline');

const router = express.Router();

function step(key, label, state, detail) {
  return { key, label, state, detail: detail || null };
}

// GET /student/journey
router.get('/journey', authenticateToken, requireRole('student'), async (req, res, next) => {
  try {
    const [apps] = await pool.query(
      `SELECT a.id, a.status, a.applied_at,
              d.id AS drive_id, d.title AS drive_title, d.status AS drive_status,
              c.name AS company_name
       FROM applications a
       JOIN drives d ON d.id = a.drive_id
       JOIN companies c ON c.id = d.company_id
       WHERE a.student_id = ?
       ORDER BY a.applied_at DESC`,
      [req.user.id]
    );

    const journey = [];
    for (const a of apps) {
      const [sessions] = await pool.query(
        `SELECT b.id AS booking_id, s.type, s.title, s.starts_at, s.ends_at,
                r.name AS venue
         FROM bookings b
         JOIN slots s ON s.id = b.slot_id
         LEFT JOIN resources r ON r.id = s.resource_id
         WHERE b.student_id = ? AND s.drive_id = ? AND b.status = 'confirmed'
         ORDER BY s.starts_at`,
        [req.user.id, a.drive_id]
      );
      const testSession = sessions.find((s) => s.type === 'test') || null;
      const interviewRaw = sessions.find((s) => s.type === 'interview') || null;
      const [results] = await pool.query(
        'SELECT score, total, percentage, submitted_at FROM test_results WHERE drive_id = ? AND student_id = ?',
        [a.drive_id, req.user.id]
      );
      const result = results[0] || null;

      // Panel number is encoded in the interview slot title ("Interview · Panel N").
      let interview = null;
      if (interviewRaw) {
        const m = /Panel (\d+)/.exec(interviewRaw.title || '');
        interview = { ...interviewRaw, panel: m ? Number(m[1]) : null };
      }

      const steps = [];
      steps.push(step('applied', 'Applied', 'done', `Applied ${fmtWhen(a.applied_at)}`));

      if (testSession) {
        // Note: the session title already includes the venue ("… · Lab A").
        steps.push(step(
          'test', 'Test session', result ? 'done' : 'current',
          `${testSession.title}`
        ));
      } else {
        steps.push(step(
          'test', 'Test session', 'todo',
          a.drive_status === 'open'
            ? 'Scheduled automatically once applications close'
            : 'Not scheduled yet'
        ));
      }

      if (result) {
        steps.push(step(
          'result', 'Test result',
          a.status === 'shortlisted' || a.status === 'selected' ? 'done' : 'current',
          `Scored ${Number(result.percentage).toFixed(1)}% (${Number(result.score)}/${Number(result.total)})`
        ));
      } else {
        steps.push(step('result', 'Test result', 'todo', testSession ? 'Take the test to unlock your score' : null));
      }

      if (interview) {
        steps.push(step(
          'interview', 'Interview', 'current',
          `${interview.title}${interview.venue ? ` · ${interview.venue}` : ''}`
        ));
      } else if (a.status === 'shortlisted' || a.status === 'selected') {
        steps.push(step('interview', 'Interview', 'current', 'Shortlisted — schedule coming soon'));
      } else if (a.status === 'rejected') {
        steps.push(step('interview', 'Interview', 'todo', 'Not shortlisted for this drive'));
      } else {
        steps.push(step('interview', 'Interview', 'todo', null));
      }

      journey.push({
        application: { id: a.id, status: a.status, applied_at: a.applied_at },
        drive: { id: a.drive_id, title: a.drive_title, company: a.company_name, status: a.drive_status },
        testSession,
        result: result
          ? { score: Number(result.score), total: Number(result.total), percentage: Number(result.percentage), submitted_at: result.submitted_at }
          : null,
        interview,
        steps,
      });
    }
    res.json(journey);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
