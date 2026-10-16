// Drive routes: list, create (wizard), detail, questions, pipeline actions,
// test taking, applications, apply.
//
// The pipeline is system-managed: recruiter configures (drive → questions →
// interview params), the engine schedules test sessions and interviews,
// students only show up. Stage flow: open → testing → interviews → closed.

const express = require('express');
const pool = require('../dbms/db');
const { authenticateToken, requireRole, optionalAuth } = require('../middleware/auth');
const { checkEligibility, parseBranches } = require('../dbms/eligibility');
const { replaceQuestionSet } = require('../dbms/transactions');
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
    status: row.status,
    counts: {
      applied: Number(row.applied || 0),
      shortlisted: Number(row.shortlisted || 0),
    },
  };
}

async function getDrive(id) {
  const [rows] = await pool.query(
    `SELECT d.*, c.name AS company_name,
            COUNT(a.id) AS applied,
            SUM(a.status = 'shortlisted') AS shortlisted
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

// GET /drives?status=open
router.get('/', async (req, res, next) => {
  try {
    const { status } = req.query;
    const where = status ? 'WHERE d.status = ?' : '';
    const params = status ? [status] : [];
    const [rows] = await pool.query(
      `SELECT d.*, c.name AS company_name,
              COUNT(a.id) AS applied,
              SUM(a.status = 'shortlisted') AS shortlisted
       FROM drives d
       JOIN companies c ON c.id = d.company_id
       LEFT JOIN applications a ON a.drive_id = d.id
       ${where}
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
    const [companies] = await pool.query('SELECT id FROM companies WHERE id = ?', [company_id]);
    if (!companies.length) {
      return res.status(404).json({ error: 'Company not found.' });
    }
    const [result] = await pool.query(
      `INSERT INTO drives (company_id, title, description, min_cgpa, allowed_branches,
                           max_backlogs, graduation_year, application_deadline,
                           test_date, interview_date, test_duration_min,
                           interview_duration_min, num_interviewers, min_test_score,
                           max_shortlist, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
        const { eligible, reasons } = checkEligibility(sRows[0], drive);
        body.eligibility = { eligible, reasons };
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
        `SELECT b.id, s.type, s.title, s.starts_at, s.ends_at, r.name AS venue
         FROM bookings b
         JOIN slots s ON s.id = b.slot_id
         LEFT JOIN resources r ON r.id = s.resource_id
         WHERE b.student_id = ? AND s.drive_id = ? AND b.status = 'confirmed'`,
        [req.user.id, drive.id]
      );
      body.my_sessions = bRows;
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
      const [result] = await pool.query(
        'INSERT INTO applications (drive_id, student_id, status) VALUES (?, ?, ?)',
        [drive.id, student.user_id, 'applied']
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
      const [r] = await pool.query(
        "UPDATE applications SET status = 'selected' WHERE drive_id = ? AND student_id = ? AND status = 'shortlisted'",
        [req.params.id, student_id]
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
