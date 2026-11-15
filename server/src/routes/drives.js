// Drive routes: list, create (wizard), detail, questions, pipeline actions,
// test taking, applications, apply.
//
// The pipeline is system-managed: recruiter configures (drive → questions →
// interview params), the engine schedules test sessions and interviews,
// students only show up. Stage flow: open → testing → interviews → closed.

const express = require('express');
const pool = require('../dbms/db');
const { withActor } = require('../dbms/db');
const { authenticateToken, requireRole, optionalAuth } = require('../middleware/auth');
const { checkEligibility, parseBranches } = require('../dbms/eligibility');
const { notifyUser } = require('../mailer');
const { replaceQuestionSet } = require('../dbms/transactions');
const { buildOfferLetter } = require('../os/offer-letter');
const {
  scheduleTestSessions,
  publishResults,
  submitTest,
  eligibleStudents,
} = require('../os/pipeline');

const router = express.Router();

function shapeDrive(row) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    company: { id: row.company_id, name: row.company_name },
    min_cgpa: Number(row.min_cgpa),
    allowed_branches: parseBranches(row.allowed_branches),
    max_backlogs: row.max_backlogs,
    graduation_year: row.graduation_year,
    application_deadline: row.application_deadline,
    test_date: row.test_date,
    interview_date: row.interview_date,
    test_duration_min: row.test_duration_min,
    interview_duration_min: row.interview_duration_min,
    num_interviewers: row.num_interviewers,
    min_test_score: Number(row.min_test_score),
    max_shortlist: row.max_shortlist,
    package_lpa: row.package_lpa != null ? Number(row.package_lpa) : null,
    status: row.status,
    feedback_pending: Number(row.feedback_pending || 0),
    counts: {
      applied: Number(row.applied || 0),
      shortlisted: Number(row.shortlisted || 0),
    },
  };
}

// How many interview notes are still missing for this drive: shortlisted /
// selected students who have fewer notes than the drive expects
// (drive.num_interviewers). One correlated subquery, so it rides along on
// the list and detail queries without an extra round trip.
const FEEDBACK_PENDING_SQL = `(SELECT COUNT(*) FROM applications a2
     WHERE a2.drive_id = d.id AND a2.status IN ('shortlisted', 'selected')
       AND (SELECT COUNT(*) FROM interview_feedback f
            WHERE f.drive_id = d.id AND f.student_id = a2.student_id)
           < d.num_interviewers) AS feedback_pending`;

async function getDrive(id) {
  const [rows] = await pool.query(
    `SELECT d.*, c.name AS company_name,
            COUNT(a.id) AS applied,
            SUM(a.status = 'shortlisted') AS shortlisted,
            ${FEEDBACK_PENDING_SQL}
     FROM drives d
     JOIN companies c ON c.id = d.company_id
     LEFT JOIN applications a ON a.drive_id = d.id
     WHERE d.id = ?
     GROUP BY d.id`,
    [id]
  );
  return rows[0] || null;
}

function toDateOrNull(v) {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

// Recruiter who created the drive, or any admin, may manage its rounds,
// interview notes and offer letters. Other recruiters get a plain refusal.
function canManageDrive(drive, user) {
  return user && (user.role === 'admin' || drive.created_by === user.id);
}

function forbidUnlessManager(drive, user, res) {
  if (!canManageDrive(drive, user)) {
    res.status(403).json({ error: 'Only the recruiter who created this drive (or an admin) can do that.' });
    return false;
  }
  return true;
}

// GET /drives?status=open — scoped to the caller: admins see every drive,
// recruiters only the drives they created, students only open drives.
router.get('/', authenticateToken, async (req, res, next) => {
  try {
    const { status } = req.query;
    const where = [];
    const params = [];
    if (req.user.role === 'recruiter') {
      where.push('d.created_by = ?');
      params.push(req.user.id);
    } else if (req.user.role === 'student') {
      // Students only ever see open drives, whatever they ask for.
      where.push("d.status = 'open'");
    }
    if (status && req.user.role !== 'student') {
      where.push('d.status = ?');
      params.push(status);
    }
    const [rows] = await pool.query(
      `SELECT d.*, c.name AS company_name,
              COUNT(a.id) AS applied,
              SUM(a.status = 'shortlisted') AS shortlisted,
              ${FEEDBACK_PENDING_SQL}
       FROM drives d
       JOIN companies c ON c.id = d.company_id
       LEFT JOIN applications a ON a.drive_id = d.id
       ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
       GROUP BY d.id
       ORDER BY d.application_deadline`,
      params
    );
    res.json(rows.map(shapeDrive));
  } catch (err) {
    next(err);
  }
});

// POST /drives/preview-eligibility — wizard step 4: how many students qualify?
router.post(
  '/preview-eligibility',
  authenticateToken,
  requireRole('recruiter', 'admin'),
  async (req, res, next) => {
    try {
      const { min_cgpa, allowed_branches, max_backlogs, graduation_year } = req.body || {};
      const eligible = await eligibleStudents({
        min_cgpa: min_cgpa ?? 0,
        allowed_branches: Array.isArray(allowed_branches) ? allowed_branches : [],
        max_backlogs: max_backlogs ?? 0,
        graduation_year,
      });
      res.json({
        count: eligible.length,
        sample: eligible.slice(0, 5).map((e) => e.student.name),
      });
    } catch (err) {
      next(err);
    }
  }
);

// POST /drives — recruiter creates a drive (wizard step 1 + 3 fields)
router.post('/', authenticateToken, requireRole('recruiter', 'admin'), async (req, res, next) => {
  try {
    const {
      company_id,
      title,
      description,
      min_cgpa,
      allowed_branches,
      max_backlogs,
      graduation_year,
      application_deadline,
      test_date,
      interview_date,
      test_duration_min,
      interview_duration_min,
      num_interviewers,
      min_test_score,
      max_shortlist,
      package_lpa,
    } = req.body || {};
    if (
      !company_id ||
      !title ||
      min_cgpa == null ||
      !Array.isArray(allowed_branches) ||
      max_backlogs == null ||
      !graduation_year ||
      !application_deadline
    ) {
      return res.status(400).json({
        error:
          'company_id, title, min_cgpa, allowed_branches, max_backlogs, graduation_year and application_deadline are required.',
      });
    }
    // Optional advertised package (LPA): stored on the drive so offer
    // letters default to it (see POST /:id/offers/generate).
    const packageLpa = package_lpa == null || package_lpa === '' ? null : Number(package_lpa);
    if (packageLpa != null && (Number.isNaN(packageLpa) || packageLpa < 0)) {
      return res.status(400).json({ error: 'Package must be a positive number (in LPA).' });
    }
    const [companies] = await pool.query('SELECT id FROM companies WHERE id = ?', [company_id]);
    if (!companies.length) {
      return res.status(404).json({ error: 'Company not found.' });
    }
    const [result] = await pool.query(
      `INSERT INTO drives (company_id, title, description, min_cgpa, allowed_branches,
                           max_backlogs, graduation_year, application_deadline,
                           test_date, interview_date, test_duration_min,
                           interview_duration_min, num_interviewers, min_test_score,
                           max_shortlist, package_lpa, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        company_id,
        title,
        description || null,
        min_cgpa,
        JSON.stringify(allowed_branches),
        max_backlogs,
        graduation_year,
        application_deadline,
        toDateOrNull(test_date),
        toDateOrNull(interview_date),
        test_duration_min || 60,
        interview_duration_min || 20,
        num_interviewers || 2,
        min_test_score ?? 50,
        max_shortlist || 20,
        packageLpa,
        req.user.id,
      ]
    );
    const drive = await getDrive(result.insertId);
    res.status(201).json({ drive: shapeDrive(drive) });
  } catch (err) {
    next(err);
  }
});

// GET /drives/:id — detail; students also get eligibility + application + test state
router.get('/:id', optionalAuth, async (req, res, next) => {
  try {
    const drive = await getDrive(req.params.id);
    if (!drive) {
      return res.status(404).json({ error: 'Drive not found.' });
    }
    // A recruiter may only open their own drives (admins and students
    // are unaffected; students only ever see their own application data).
    if (req.user && req.user.role === 'recruiter' && drive.created_by !== req.user.id) {
      return res.status(403).json({ error: 'This drive belongs to another recruiter.' });
    }
    const body = {
      drive: shapeDrive(drive),
      criteria: {
        min_cgpa: Number(drive.min_cgpa),
        allowed_branches: parseBranches(drive.allowed_branches),
        max_backlogs: drive.max_backlogs,
        graduation_year: drive.graduation_year,
      },
      counts: {
        applied: Number(drive.applied || 0),
        shortlisted: Number(drive.shortlisted || 0),
      },
    };
    const [qRows] = await pool.query('SELECT COUNT(*) AS c FROM test_questions WHERE drive_id = ?', [drive.id]);
    body.questions_count = Number(qRows[0].c);

    if (req.user && req.user.role === 'student') {
      const [sRows] = await pool.query('SELECT * FROM students WHERE user_id = ?', [req.user.id]);
      if (sRows.length) {
        const { eligible, reasons, checks } = checkEligibility(sRows[0], drive);
        body.eligibility = { eligible, reasons, checks };
      }
      const [aRows] = await pool.query(
        'SELECT id, status, applied_at FROM applications WHERE drive_id = ? AND student_id = ?',
        [drive.id, req.user.id]
      );
      body.my_application = aRows[0] || null;
      const [rRows] = await pool.query(
        'SELECT score, total, percentage, submitted_at FROM test_results WHERE drive_id = ? AND student_id = ?',
        [drive.id, req.user.id]
      );
      body.my_result = rRows[0] || null;
      const [bRows] = await pool.query(
        `SELECT b.id, b.status, s.id AS slot_id, s.type, s.title, s.starts_at, s.ends_at, r.name AS venue,
                (SELECT COUNT(*) FROM bookings w
                  WHERE w.slot_id = b.slot_id AND w.status = 'waitlist'
                    AND (w.booked_at < b.booked_at OR (w.booked_at = b.booked_at AND w.id < b.id))) + 1
                  AS waitlist_position
         FROM bookings b
         JOIN slots s ON s.id = b.slot_id
         LEFT JOIN resources r ON r.id = s.resource_id
         WHERE b.student_id = ? AND s.drive_id = ? AND b.status IN ('confirmed', 'waitlist')`,
        [req.user.id, drive.id]
      );
      body.my_sessions = bRows;
      // The student's own offer for this drive, if one was generated.
      const [oRows] = await pool.query(
        `SELECT o.id, o.package_lpa, o.joining_date, o.status, o.responded_at,
                o.generated_at
         FROM offer_letters o
         WHERE o.drive_id = ? AND o.student_id = ?`,
        [drive.id, req.user.id]
      );
      body.my_offer = oRows.length
        ? {
            id: oRows[0].id,
            package_lpa: oRows[0].package_lpa != null ? Number(oRows[0].package_lpa) : null,
            joining_date: oRows[0].joining_date,
            status: oRows[0].status,
            responded_at: oRows[0].responded_at,
            generated_at: oRows[0].generated_at,
          }
        : null;
    }
    res.json(body);
  } catch (err) {
    next(err);
  }
});

// POST /drives/:id/apply — student applies after an eligibility check
router.post('/:id/apply', authenticateToken, requireRole('student'), async (req, res, next) => {
  try {
    const drive = await getDrive(req.params.id);
    if (!drive) {
      return res.status(404).json({ error: 'Drive not found.' });
    }
    if (drive.status !== 'open') {
      return res.status(400).json({ error: 'Applications are closed for this drive.' });
    }
    const [sRows] = await pool.query('SELECT * FROM students WHERE user_id = ?', [req.user.id]);
    const student = sRows[0];
    if (!student) {
      return res.status(404).json({ error: 'Student profile not found.' });
    }
    const { eligible, reasons } = checkEligibility(student, drive);
    if (!eligible) {
      return res.status(422).json({ error: 'Not eligible for this drive.', reasons });
    }
    try {
      // withActor: the INSERT fires the audit trigger on this connection,
      // so the applying student is recorded as the actor.
      const [result] = await withActor(req.user.id, (conn) =>
        conn.query(
          'INSERT INTO applications (drive_id, student_id, status) VALUES (?, ?, ?)',
          [drive.id, student.user_id, 'applied']
        )
      );
      const [aRows] = await pool.query('SELECT * FROM applications WHERE id = ?', [result.insertId]);
      res.status(201).json({ application: aRows[0] });
    } catch (err) {
      if (err.code === 'ER_DUP_ENTRY') {
        return res.status(409).json({ error: 'Already applied for this drive.' });
      }
      throw err;
    }
  } catch (err) {
    next(err);
  }
});

// GET /drives/:id/applications — recruiter views applicants with verdicts
router.get(
  '/:id/applications',
  authenticateToken,
  requireRole('recruiter', 'admin'),
  async (req, res, next) => {
    try {
      const drive = await getDrive(req.params.id);
      if (!drive) {
        return res.status(404).json({ error: 'Drive not found.' });
      }
      const [rows] = await pool.query(
        `SELECT a.id, a.status, a.applied_at,
                u.id AS user_id, u.name, u.email,
                s.roll_no, s.branch, s.cgpa, s.backlogs, s.graduation_year,
                tr.percentage AS test_percentage
         FROM applications a
         JOIN students s ON s.user_id = a.student_id
         JOIN users u ON u.id = s.user_id
         LEFT JOIN test_results tr ON tr.drive_id = a.drive_id AND tr.student_id = a.student_id
         WHERE a.drive_id = ?
         ORDER BY a.id`,
        [req.params.id]
      );
      res.json(
        rows.map((r) => {
          const student = {
            id: r.user_id, name: r.name, email: r.email, roll_no: r.roll_no,
            branch: r.branch, cgpa: Number(r.cgpa), backlogs: r.backlogs,
            graduation_year: r.graduation_year,
          };
          const { eligible, reasons } = checkEligibility(student, drive);
          return {
            id: r.id, student, status: r.status, eligible, fail_reasons: reasons,
            test_percentage: r.test_percentage != null ? Number(r.test_percentage) : null,
          };
        })
      );
    } catch (err) {
      next(err);
    }
  }
);

// GET /drives/:id/eligible-students — every student passing the criteria
router.get(
  '/:id/eligible-students',
  authenticateToken,
  requireRole('recruiter', 'admin'),
  async (req, res, next) => {
    try {
      const drive = await getDrive(req.params.id);
      if (!drive) {
        return res.status(404).json({ error: 'Drive not found.' });
      }
      const eligible = await eligibleStudents(drive);
      res.json({ count: eligible.length, students: eligible.map((e) => e.student) });
    } catch (err) {
      next(err);
    }
  }
);

// GET /drives/:id/pipeline — stage summary for the pipeline header
router.get(
  '/:id/pipeline',
  authenticateToken,
  requireRole('recruiter', 'admin'),
  async (req, res, next) => {
    try {
      const drive = await getDrive(req.params.id);
      if (!drive) {
        return res.status(404).json({ error: 'Drive not found.' });
      }
      const [[a]] = await pool.query(
        `SELECT COUNT(*) AS applied,
                SUM(status = 'test_taken') AS taken,
                SUM(status = 'shortlisted') AS shortlisted,
                SUM(status = 'selected') AS selected
         FROM applications WHERE drive_id = ?`,
        [drive.id]
      );
      const [[s]] = await pool.query(
        `SELECT COUNT(*) AS sessions, SUM(booked_count) AS seats
         FROM slots WHERE drive_id = ? AND type = 'test'`,
        [drive.id]
      );
      const [[r]] = await pool.query(
        `SELECT COUNT(*) AS n, ROUND(AVG(percentage), 1) AS avg_score
         FROM test_results WHERE drive_id = ?`,
        [drive.id]
      );
      const [[i]] = await pool.query(
        `SELECT COUNT(*) AS n FROM slots WHERE drive_id = ? AND type = 'interview'`,
        [drive.id]
      );
      const [[q]] = await pool.query('SELECT COUNT(*) AS n FROM test_questions WHERE drive_id = ?', [drive.id]);
      res.json({
        stage: drive.status,
        applied: Number(a.applied || 0),
        test_sessions: Number(s.sessions || 0),
        seats_assigned: Number(s.seats || 0),
        tests_taken: Number(r.n || 0),
        avg_score: r.avg_score != null ? Number(r.avg_score) : null,
        shortlisted: Number(a.shortlisted || 0),
        interviews: Number(i.n || 0),
        selected: Number(a.selected || 0),
        questions: Number(q.n || 0),
      });
    } catch (err) {
      next(err);
    }
  }
);

// POST /drives/:id/schedule-tests — system batches applicants into lab sessions
router.post(
  '/:id/schedule-tests',
  authenticateToken,
  requireRole('recruiter', 'admin'),
  async (req, res, next) => {
    try {
      const result = await scheduleTestSessions(req.params.id, req.user.id);
      res.json(result);
    } catch (err) {
      next(err);
    }
  }
);

// POST /drives/:id/publish-results — shortlist by score + auto-build interviews
router.post(
  '/:id/publish-results',
  authenticateToken,
  requireRole('recruiter', 'admin'),
  async (req, res, next) => {
    try {
      const result = await publishResults(req.params.id, req.user.id);
      res.json(result);
    } catch (err) {
      next(err);
    }
  }
);

// POST /drives/:id/select — mark a shortlisted student as finally selected
router.post(
  '/:id/select',
  authenticateToken,
  requireRole('recruiter', 'admin'),
  async (req, res, next) => {
    try {
      const { student_id } = req.body || {};
      if (!student_id) return res.status(400).json({ error: 'student_id is required.' });
      // withActor: the UPDATE fires the audit trigger on this connection,
      // so the recruiter/admin marking the selection is recorded as the actor.
      const [r] = await withActor(req.user.id, (conn) =>
        conn.query(
          "UPDATE applications SET status = 'selected' WHERE drive_id = ? AND student_id = ? AND status = 'shortlisted'",
          [req.params.id, student_id]
        )
      );
      if (!r.affectedRows) {
        return res.status(400).json({ error: 'Only a shortlisted student can be marked selected.' });
      }
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  }
);

// --- Interview notes (Phase 2, M2) ----------------------------------------
// One score per interviewer per student per drive: the UNIQUE key
// (drive_id, student_id, interviewer_id) enforces it, and the upsert below
// replaces a reviewer's earlier score instead of adding a second one.

// POST /drives/:id/feedback — save (or update) my score + remarks for a student
router.post(
  '/:id/feedback',
  authenticateToken,
  requireRole('recruiter', 'admin'),
  async (req, res, next) => {
    try {
      const drive = await getDrive(req.params.id);
      if (!drive) return res.status(404).json({ error: 'Drive not found.' });
      if (!forbidUnlessManager(drive, req.user, res)) return;
      const { studentId, score, remarks, roundId } = req.body || {};
      if (!studentId) return res.status(400).json({ error: 'Please pick a student to score.' });
      const numScore = Number(score);
      if (score == null || Number.isNaN(numScore) || numScore < 0 || numScore > 100) {
        return res.status(400).json({ error: 'Score must be a number between 0 and 100.' });
      }
      // Only a student who reached the interview stage can be scored.
      const [aRows] = await pool.query(
        "SELECT id FROM applications WHERE drive_id = ? AND student_id = ? AND status IN ('shortlisted', 'selected')",
        [drive.id, studentId]
      );
      if (!aRows.length) {
        return res.status(400).json({ error: 'This student has not reached the interview stage for this drive yet.' });
      }
      if (roundId != null) {
        const [rRows] = await pool.query('SELECT id FROM drive_rounds WHERE id = ? AND drive_id = ?', [roundId, drive.id]);
        if (!rRows.length) return res.status(400).json({ error: 'That round does not belong to this drive.' });
      }
      await pool.query(
        `INSERT INTO interview_feedback (drive_id, student_id, interviewer_id, round_id, score, remarks)
         VALUES (?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE score = VALUES(score), remarks = VALUES(remarks), round_id = VALUES(round_id)`,
        [drive.id, studentId, req.user.id, roundId || null, numScore, remarks ? String(remarks).trim() || null : null]
      );
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  }
);

// GET /drives/:id/feedback — consolidated scorecard, one row per student
router.get(
  '/:id/feedback',
  authenticateToken,
  requireRole('recruiter', 'admin'),
  async (req, res, next) => {
    try {
      const drive = await getDrive(req.params.id);
      if (!drive) return res.status(404).json({ error: 'Drive not found.' });
      if (!forbidUnlessManager(drive, req.user, res)) return;
      // One GROUP BY query: average score + how many reviewers per student.
      const [rows] = await pool.query(
        `SELECT f.student_id, u.name, u.email, s.roll_no, s.branch,
                ROUND(AVG(f.score), 1) AS average_score,
                COUNT(*) AS reviewers
         FROM interview_feedback f
         JOIN users u ON u.id = f.student_id
         JOIN students s ON s.user_id = f.student_id
         WHERE f.drive_id = ?
         GROUP BY f.student_id
         ORDER BY average_score DESC, u.name`,
        [drive.id]
      );
      // Remarks need the reviewer name each, so they come in a second query.
      const [remarkRows] = await pool.query(
        `SELECT f.student_id, f.score, f.remarks, u.name AS reviewer
         FROM interview_feedback f
         JOIN users u ON u.id = f.interviewer_id
         WHERE f.drive_id = ? AND f.remarks IS NOT NULL AND f.remarks <> ''
         ORDER BY f.created_at`,
        [drive.id]
      );
      const remarksByStudent = {};
      for (const r of remarkRows) {
        (remarksByStudent[r.student_id] ||= []).push({
          reviewer: r.reviewer, score: Number(r.score), remarks: r.remarks,
        });
      }
      res.json(
        rows.map((r) => ({
          student_id: r.student_id,
          name: r.name,
          email: r.email,
          roll_no: r.roll_no,
          branch: r.branch,
          average_score: Number(r.average_score),
          reviewers: Number(r.reviewers),
          remarks: remarksByStudent[r.student_id] || [],
        }))
      );
    } catch (err) {
      next(err);
    }
  }
);

// --- Interview-note reminders (Wave 5) -------------------------------------
// "Pending" means a shortlisted / selected student who has fewer interview
// notes than the drive expects (drive.num_interviewers). Only the drive's
// recruiter (or an admin) can save notes, so the nudge goes to the person
// who created the drive — they are the one who can act on it.

// Students still waiting on a full set of interview notes, with how many
// notes each one has so far. Read-only: safe to call on every page load.
async function pendingFeedback(drive) {
  const needed = Number(drive.num_interviewers) > 0 ? Number(drive.num_interviewers) : 2;
  const [rows] = await pool.query(
    `SELECT a.student_id, u.name,
            (SELECT COUNT(*) FROM interview_feedback f
             WHERE f.drive_id = a.drive_id AND f.student_id = a.student_id) AS reviewers
     FROM applications a
     JOIN users u ON u.id = a.student_id
     WHERE a.drive_id = ? AND a.status IN ('shortlisted', 'selected')
     HAVING reviewers < ?
     ORDER BY u.name`,
    [drive.id, needed]
  );
  return {
    needed,
    pending: rows.map((r) => ({
      student_id: r.student_id, name: r.name, reviewers: Number(r.reviewers),
    })),
  };
}

// GET /drives/:id/feedback/pending — who still needs interview notes
router.get(
  '/:id/feedback/pending',
  authenticateToken,
  requireRole('recruiter', 'admin'),
  async (req, res, next) => {
    try {
      const drive = await getDrive(req.params.id);
      if (!drive) return res.status(404).json({ error: 'Drive not found.' });
      if (!forbidUnlessManager(drive, req.user, res)) return;
      const { needed, pending } = await pendingFeedback(drive);
      res.json({ needed, pending_count: pending.length, pending });
    } catch (err) {
      next(err);
    }
  }
);

// POST /drives/:id/feedback/remind — send one nudge per pending scorecard.
// Explicit trigger only (a button on the drive page): nothing is sent on
// page load, and one click sends exactly one notification per student who
// is still missing notes. The notification lands in the recruiter's bell
// (notifyUser also tries email, best-effort, never load-bearing).
router.post(
  '/:id/feedback/remind',
  authenticateToken,
  requireRole('recruiter', 'admin'),
  async (req, res, next) => {
    try {
      const drive = await getDrive(req.params.id);
      if (!drive) return res.status(404).json({ error: 'Drive not found.' });
      if (!forbidUnlessManager(drive, req.user, res)) return;
      const { needed, pending } = await pendingFeedback(drive);
      if (!pending.length) {
        return res.json({ reminded: 0, message: 'Every interviewed student already has a full set of notes.' });
      }
      for (const p of pending) {
        // One nudge failing must not stop the rest.
        try {
          await notifyUser(pool, {
            userId: drive.created_by,
            title: `Interview note still needed — ${p.name}`,
            body: `${p.name} was interviewed for ${drive.title} but has ${p.reviewers} of ${needed} interview notes so far. Add the missing note to finish their scorecard.`,
            link: `/recruiter/drives/${drive.id}`,
          });
        } catch (err) {
          console.error(`[drives] could not remind about ${p.name}:`, err.message);
        }
      }
      res.json({ reminded: pending.length, pending_count: pending.length });
    } catch (err) {
      next(err);
    }
  }
);

// --- Rounds (Phase 2, M2) --------------------------------------------------
// A drive can run several rounds, each with its own cutoff. Drives with no
// rounds keep the old behaviour exactly: publishResults falls back to
// drives.min_test_score (see os/pipeline.js).

// GET /drives/:id/rounds — list rounds in order
router.get(
  '/:id/rounds',
  authenticateToken,
  requireRole('recruiter', 'admin'),
  async (req, res, next) => {
    try {
      const drive = await getDrive(req.params.id);
      if (!drive) return res.status(404).json({ error: 'Drive not found.' });
      if (!forbidUnlessManager(drive, req.user, res)) return;
      const [rows] = await pool.query(
        'SELECT id, drive_id, round_no, name, cutoff, status FROM drive_rounds WHERE drive_id = ? ORDER BY round_no',
        [drive.id]
      );
      res.json(rows.map((r) => ({ ...r, cutoff: Number(r.cutoff) })));
    } catch (err) {
      next(err);
    }
  }
);

// POST /drives/:id/rounds — add a round; round_no is max + 1
router.post(
  '/:id/rounds',
  authenticateToken,
  requireRole('recruiter', 'admin'),
  async (req, res, next) => {
    try {
      const drive = await getDrive(req.params.id);
      if (!drive) return res.status(404).json({ error: 'Drive not found.' });
      if (!forbidUnlessManager(drive, req.user, res)) return;
      const { name, cutoff } = req.body || {};
      if (!name || !String(name).trim()) return res.status(400).json({ error: 'Please give the round a name.' });
      const numCutoff = cutoff == null ? 50 : Number(cutoff);
      if (Number.isNaN(numCutoff) || numCutoff < 0 || numCutoff > 100) {
        return res.status(400).json({ error: 'Cutoff must be a number between 0 and 100.' });
      }
      const [[m]] = await pool.query('SELECT COALESCE(MAX(round_no), 0) AS max_no FROM drive_rounds WHERE drive_id = ?', [drive.id]);
      const [result] = await pool.query(
        'INSERT INTO drive_rounds (drive_id, round_no, name, cutoff) VALUES (?, ?, ?, ?)',
        [drive.id, m.max_no + 1, String(name).trim(), numCutoff]
      );
      const [rows] = await pool.query('SELECT id, drive_id, round_no, name, cutoff, status FROM drive_rounds WHERE id = ?', [result.insertId]);
      res.status(201).json({ ...rows[0], cutoff: Number(rows[0].cutoff) });
    } catch (err) {
      next(err);
    }
  }
);

// PATCH /drives/:id/rounds/:roundId — change a round's status.
// Only one round may be active at a time: activating one moves any other
// active round back to pending.
router.patch(
  '/:id/rounds/:roundId',
  authenticateToken,
  requireRole('recruiter', 'admin'),
  async (req, res, next) => {
    try {
      const drive = await getDrive(req.params.id);
      if (!drive) return res.status(404).json({ error: 'Drive not found.' });
      if (!forbidUnlessManager(drive, req.user, res)) return;
      const { status } = req.body || {};
      if (!['pending', 'active', 'done'].includes(status)) {
        return res.status(400).json({ error: 'Status must be pending, active or done.' });
      }
      const [rows] = await pool.query('SELECT id FROM drive_rounds WHERE id = ? AND drive_id = ?', [req.params.roundId, drive.id]);
      if (!rows.length) return res.status(404).json({ error: 'Round not found for this drive.' });
      if (status === 'active') {
        await pool.query("UPDATE drive_rounds SET status = 'pending' WHERE drive_id = ? AND status = 'active' AND id <> ?", [drive.id, req.params.roundId]);
      }
      await pool.query('UPDATE drive_rounds SET status = ? WHERE id = ?', [status, req.params.roundId]);
      const [updated] = await pool.query('SELECT id, drive_id, round_no, name, cutoff, status FROM drive_rounds WHERE id = ?', [req.params.roundId]);
      res.json({ ...updated[0], cutoff: Number(updated[0].cutoff) });
    } catch (err) {
      next(err);
    }
  }
);

// --- Offer letters (Phase 2, M2) ------------------------------------------
// One letter per selected student per drive (UNIQUE(drive_id, student_id)).
// Generating twice creates nothing new: students who already have a letter
// are skipped, so the endpoint is idempotent.

// POST /drives/:id/offers/generate — generate letters for every selected
// student who does not have one yet
router.post(
  '/:id/offers/generate',
  authenticateToken,
  requireRole('recruiter', 'admin'),
  async (req, res, next) => {
    try {
      const drive = await getDrive(req.params.id);
      if (!drive) return res.status(404).json({ error: 'Drive not found.' });
      if (!forbidUnlessManager(drive, req.user, res)) return;
      const { package_lpa, joining_date } = req.body || {};
      const packageLpa = package_lpa != null ? Number(package_lpa) : (drive.package_lpa != null ? Number(drive.package_lpa) : null);
      if (packageLpa != null && (Number.isNaN(packageLpa) || packageLpa < 0)) {
        return res.status(400).json({ error: 'Package must be a positive number (in LPA).' });
      }
      // Sensible default joining date: 30 days from today.
      let joiningDate = toDateOrNull(joining_date);
      if (!joiningDate) {
        const d = new Date();
        d.setDate(d.getDate() + 30);
        joiningDate = d.toISOString().slice(0, 10);
      }
      const [selected] = await pool.query(
        `SELECT a.student_id, u.name AS student_name
         FROM applications a
         JOIN users u ON u.id = a.student_id
         WHERE a.drive_id = ? AND a.status = 'selected'
           AND NOT EXISTS (
             SELECT 1 FROM offer_letters o
             WHERE o.drive_id = a.drive_id AND o.student_id = a.student_id
           )
         ORDER BY u.name`,
        [drive.id]
      );
      if (!selected.length) {
        return res.json({ created: 0, message: 'Everyone selected already has an offer letter.' });
      }
      const createdIds = [];
      for (const s of selected) {
        const letterText = buildOfferLetter({
          studentName: s.student_name,
          companyName: drive.company_name,
          driveTitle: drive.title,
          packageLpa,
          joiningDate,
        });
        // INSERT IGNORE is belt-and-braces for the UNIQUE key: a concurrent
        // second run can never create a duplicate letter.
        const [result] = await pool.query(
          'INSERT IGNORE INTO offer_letters (drive_id, student_id, package_lpa, joining_date, letter_text) VALUES (?, ?, ?, ?, ?)',
          [drive.id, s.student_id, packageLpa, joiningDate, letterText]
        );
        if (result.affectedRows) createdIds.push(result.insertId);
      }
      res.status(201).json({ created: createdIds.length, offer_ids: createdIds });
    } catch (err) {
      next(err);
    }
  }
);

// GET /drives/:id/offers — list letters for this drive
router.get(
  '/:id/offers',
  authenticateToken,
  requireRole('recruiter', 'admin'),
  async (req, res, next) => {
    try {
      const drive = await getDrive(req.params.id);
      if (!drive) return res.status(404).json({ error: 'Drive not found.' });
      if (!forbidUnlessManager(drive, req.user, res)) return;
      const [rows] = await pool.query(
        `SELECT o.id, o.student_id, o.package_lpa, o.joining_date, o.generated_at,
                o.status, o.responded_at,
                u.name AS student_name
         FROM offer_letters o
         JOIN users u ON u.id = o.student_id
         WHERE o.drive_id = ?
         ORDER BY o.generated_at DESC`,
        [drive.id]
      );
      res.json(rows.map((r) => ({
        id: r.id,
        student_id: r.student_id,
        student_name: r.student_name,
        package_lpa: r.package_lpa != null ? Number(r.package_lpa) : null,
        joining_date: r.joining_date,
        generated_at: r.generated_at,
        status: r.status,
        responded_at: r.responded_at,
      })));
    } catch (err) {
      next(err);
    }
  }
);

// --- Test questions -------------------------------------------------------

function validateQuestions(list) {
  if (!Array.isArray(list) || !list.length) return 'Provide at least one question.';
  for (let i = 0; i < list.length; i++) {
    const q = list[i] || {};
    if (!q.text || !String(q.text).trim()) return `Question ${i + 1}: text is required.`;
    if (!Array.isArray(q.options) || q.options.length < 2) return `Question ${i + 1}: at least 2 options are required.`;
    if (q.correct_index == null || q.correct_index < 0 || q.correct_index >= q.options.length) {
      return `Question ${i + 1}: pick the correct option.`;
    }
  }
  return null;
}

// POST /drives/:id/questions — recruiter replaces the question set (wizard step 2)
router.post(
  '/:id/questions',
  authenticateToken,
  requireRole('recruiter', 'admin'),
  async (req, res, next) => {
    try {
      const drive = await getDrive(req.params.id);
      if (!drive) return res.status(404).json({ error: 'Drive not found.' });
      if (!['open', 'draft'].includes(drive.status)) {
        return res.status(400).json({ error: 'Questions can only be edited before test sessions are scheduled.' });
      }
      const problem = validateQuestions(req.body?.questions);
      if (problem) return res.status(400).json({ error: problem });

      // One ACID transaction (dbms/transactions.js): the old set is replaced
      // atomically — a failed insert can never leave the drive with half a test.
      const saved = await replaceQuestionSet(drive.id, req.body.questions);
      res.json({ saved });
    } catch (err) {
      next(err);
    }
  }
);

// GET /drives/:id/questions — recruiter/admin view (with answers)
router.get(
  '/:id/questions',
  authenticateToken,
  requireRole('recruiter', 'admin'),
  async (req, res, next) => {
    try {
      const [rows] = await pool.query(
        'SELECT id, question_text, options, correct_index, marks FROM test_questions WHERE drive_id = ? ORDER BY id',
        [req.params.id]
      );
      res.json(rows.map((r) => ({
        id: r.id, text: r.question_text,
        options: typeof r.options === 'string' ? JSON.parse(r.options) : r.options,
        correct_index: r.correct_index, marks: r.marks,
      })));
    } catch (err) {
      next(err);
    }
  }
);

// --- Student test flow ----------------------------------------------------

// GET /drives/:id/test — student's test paper (answers stripped) + session + result
router.get(
  '/:id/test',
  authenticateToken,
  requireRole('student'),
  async (req, res, next) => {
    try {
      const drive = await getDrive(req.params.id);
      if (!drive) return res.status(404).json({ error: 'Drive not found.' });
      const [aRows] = await pool.query(
        'SELECT id FROM applications WHERE drive_id = ? AND student_id = ?',
        [drive.id, req.user.id]
      );
      if (!aRows.length) return res.status(403).json({ error: 'You have not applied for this drive.' });

      const [qRows] = await pool.query(
        'SELECT id, question_text, options, marks FROM test_questions WHERE drive_id = ? ORDER BY id',
        [drive.id]
      );
      const [rRows] = await pool.query(
        'SELECT score, total, percentage, submitted_at FROM test_results WHERE drive_id = ? AND student_id = ?',
        [drive.id, req.user.id]
      );
      const [sRows] = await pool.query(
        `SELECT s.title, s.starts_at, s.ends_at, r.name AS venue
         FROM bookings b
         JOIN slots s ON s.id = b.slot_id
         LEFT JOIN resources r ON r.id = s.resource_id
         WHERE b.student_id = ? AND s.drive_id = ? AND s.type = 'test' AND b.status = 'confirmed'
         LIMIT 1`,
        [req.user.id, drive.id]
      );
      res.json({
        drive: { id: drive.id, title: drive.title, test_duration_min: drive.test_duration_min },
        questions: qRows.map((r) => ({
          id: r.id, text: r.question_text,
          options: typeof r.options === 'string' ? JSON.parse(r.options) : r.options,
          marks: r.marks,
        })),
        session: sRows[0] || null,
        result: rRows[0] || null,
      });
    } catch (err) {
      next(err);
    }
  }
);

// POST /drives/:id/test/submit — one attempt, auto-graded
router.post(
  '/:id/test/submit',
  authenticateToken,
  requireRole('student'),
  async (req, res, next) => {
    try {
      const result = await submitTest(req.params.id, req.user.id, req.body?.answers);
      res.json(result);
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
