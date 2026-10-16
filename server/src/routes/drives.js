// Drive routes: list, create, detail, shortlist, applications, apply.
const express = require('express');
const pool = require('../db');
const { authenticateToken, requireRole, optionalAuth } = require('../middleware/auth');
const { checkEligibility, parseBranches } = require('../lib/eligibility');

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

// POST /drives — recruiter creates a drive
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
                           max_backlogs, graduation_year, application_deadline, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        company_id,
        title,
        description || null,
        min_cgpa,
        JSON.stringify(allowed_branches),
        max_backlogs,
        graduation_year,
        application_deadline,
        req.user.id,
      ]
    );
    const drive = await getDrive(result.insertId);
    res.status(201).json({ drive: shapeDrive(drive) });
  } catch (err) {
    next(err);
  }
});

// GET /drives/:id — includes my_eligibility + my_application when a student is logged in
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
    }
    res.json(body);
  } catch (err) {
    next(err);
  }
});

// POST /drives/:id/shortlist — recruiter runs the eligibility stored procedure
router.post(
  '/:id/shortlist',
  authenticateToken,
  requireRole('recruiter', 'admin'),
  async (req, res, next) => {
    const conn = await pool.getConnection();
    try {
      const [dRows] = await conn.query('SELECT id FROM drives WHERE id = ?', [req.params.id]);
      if (!dRows.length) {
        return res.status(404).json({ error: 'Drive not found.' });
      }
      // CALL + SELECT must run on the SAME connection: @n is session-scoped.
      await conn.query('CALL sp_generate_shortlist(?, @n)', [req.params.id]);
      const [[row]] = await conn.query('SELECT @n AS n');
      res.json({ shortlisted: Number(row.n) || 0 });
    } catch (err) {
      next(err);
    } finally {
      conn.release();
    }
  }
);

// GET /drives/:id/applications — recruiter views applicants with eligibility verdicts
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
                s.roll_no, s.branch, s.cgpa, s.backlogs, s.graduation_year
         FROM applications a
         JOIN students s ON s.user_id = a.student_id
         JOIN users u ON u.id = s.user_id
         WHERE a.drive_id = ?
         ORDER BY a.id`,
        [req.params.id]
      );
      res.json(
        rows.map((r) => {
          const student = {
            id: r.user_id,
            name: r.name,
            email: r.email,
            roll_no: r.roll_no,
            branch: r.branch,
            cgpa: Number(r.cgpa),
            backlogs: r.backlogs,
            graduation_year: r.graduation_year,
          };
          const { eligible, reasons } = checkEligibility(student, drive);
          return {
            id: r.id,
            student,
            status: r.status,
            eligible,
            fail_reasons: reasons,
          };
        })
      );
    } catch (err) {
      next(err);
    }
  }
);

// POST /drives/:id/apply — student applies after an eligibility check
router.post('/:id/apply', authenticateToken, requireRole('student'), async (req, res, next) => {
  try {
    const drive = await getDrive(req.params.id);
    if (!drive) {
      return res.status(404).json({ error: 'Drive not found.' });
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
      const [aRows] = await pool.query('SELECT * FROM applications WHERE id = ?', [
        result.insertId,
      ]);
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

module.exports = router;
