// Recruiter API: company profile, applicants management (search/filter/sort/pagination/bulk),
// and drive offers subsystem (extend/withdraw).
//
// Merged from Ishika's repo 2026-11-16. Adapted to Trisha's tree:
// - Offers live in `offer_letters` (not a separate `offers` table), so the
//   extend/list/withdraw endpoints below read and write offer_letters and
//   build the letter text with os/offer-letter.js. A per-student offer is
//   new here: drives.js only generates letters in bulk for selected
//   students. `note` is accepted in the request body but not stored —
//   offer_letters has no note column.
// - Applicants list reports `has_resume` from the base64 resume column
//   (students.resume_data); resumes are served from the database by
//   routes/resumes.js, never from disk.

const express = require('express');
const pool = require('../dbms/db');
const { withTransaction } = require('../dbms/transactions');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { assertDriveOwnership } = require('./drives');
const { buildOfferLetter } = require('../os/offer-letter');

const router = express.Router();

// ---------------------------------------------------------------------------
// GET /api/recruiter/company
// Returns the company profile for the authenticated recruiter's company.
// The recruiter's company is their first drive's company (users has no
// company link in this repo; drives.created_by is the link).
// ---------------------------------------------------------------------------
router.get('/company', authenticateToken, requireRole('recruiter', 'admin'), async (req, res, next) => {
  try {
    let companyId = req.user.company_id;

    if (!companyId) {
      // Fallback: check first drive created by this recruiter
      const [driveRows] = await pool.query(
        'SELECT company_id FROM drives WHERE created_by = ? ORDER BY id ASC LIMIT 1',
        [req.user.id]
      );
      if (driveRows.length > 0) {
        companyId = driveRows[0].company_id;
      }
    }

    if (!companyId) {
      return res.status(404).json({ error: 'Company profile not found for this account.' });
    }

    const [rows] = await pool.query(
      `SELECT id, name, website, sector, description, location, industry, hr_contact_email
       FROM companies
       WHERE id = ?`,
      [companyId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Company profile not found in database.' });
    }

    res.json({ ok: true, company: rows[0] });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// PUT /api/recruiter/company
// Updates editable fields: description, website, location, industry, hr_contact_email
// ---------------------------------------------------------------------------
router.put('/company', authenticateToken, requireRole('recruiter', 'admin'), async (req, res, next) => {
  try {
    let companyId = req.user.company_id;

    if (!companyId) {
      const [driveRows] = await pool.query(
        'SELECT company_id FROM drives WHERE created_by = ? ORDER BY id ASC LIMIT 1',
        [req.user.id]
      );
      if (driveRows.length > 0) {
        companyId = driveRows[0].company_id;
      }
    }

    if (!companyId) {
      return res.status(404).json({ error: 'Company profile not found for this account.' });
    }

    const { description, website, location, industry, hr_contact_email } = req.body || {};

    if (hr_contact_email && String(hr_contact_email).trim() !== '') {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(String(hr_contact_email).trim())) {
        return res.status(400).json({ error: 'Invalid HR contact email address.' });
      }
    }

    await pool.query(
      `UPDATE companies
       SET description = COALESCE(?, description),
           website = COALESCE(?, website),
           location = COALESCE(?, location),
           industry = COALESCE(?, industry),
           hr_contact_email = COALESCE(?, hr_contact_email)
       WHERE id = ?`,
      [
        description !== undefined ? description : null,
        website !== undefined ? website : null,
        location !== undefined ? location : null,
        industry !== undefined ? industry : null,
        hr_contact_email !== undefined ? hr_contact_email : null,
        companyId,
      ]
    );

    const [updatedRows] = await pool.query(
      `SELECT id, name, website, sector, description, location, industry, hr_contact_email
       FROM companies
       WHERE id = ?`,
      [companyId]
    );

    res.json({
      ok: true,
      message: 'Company profile updated successfully.',
      company: updatedRows[0],
    });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /api/recruiter/drives/:id/applicants
// Paginated, searchable, filterable by status, sortable by CGPA or test score
// ---------------------------------------------------------------------------
router.get('/drives/:id/applicants', authenticateToken, requireRole('recruiter', 'admin'), async (req, res, next) => {
  try {
    await assertDriveOwnership(req, req.params.id);

    const driveId = parseInt(req.params.id, 10);
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const offset = (page - 1) * limit;

    const { search, status, sort } = req.query;

    let whereClause = 'WHERE a.drive_id = ?';
    const params = [driveId];

    if (status && status !== 'all') {
      whereClause += ' AND a.status = ?';
      params.push(status);
    }

    if (search && String(search).trim() !== '') {
      whereClause += ' AND (u.name LIKE ? OR s.roll_no LIKE ? OR u.email LIKE ?)';
      const term = `%${String(search).trim()}%`;
      params.push(term, term, term);
    }

    // Determine sorting
    let orderBy = 'ORDER BY a.applied_at DESC';
    if (sort === 'cgpa_desc') {
      orderBy = 'ORDER BY s.cgpa DESC, a.id ASC';
    } else if (sort === 'cgpa_asc') {
      orderBy = 'ORDER BY s.cgpa ASC, a.id ASC';
    } else if (sort === 'test_score_desc') {
      orderBy = 'ORDER BY tr.percentage DESC, s.cgpa DESC';
    } else if (sort === 'test_score_asc') {
      orderBy = 'ORDER BY tr.percentage ASC, s.cgpa ASC';
    } else if (sort === 'applied_asc') {
      orderBy = 'ORDER BY a.applied_at ASC';
    }

    // Total count for pagination
    const countQuery = `
      SELECT COUNT(*) AS total
      FROM applications a
      JOIN students s ON s.user_id = a.student_id
      JOIN users u ON u.id = s.user_id
      LEFT JOIN test_results tr ON tr.drive_id = a.drive_id AND tr.student_id = a.student_id
      ${whereClause}
    `;
    const [[countRes]] = await pool.query(countQuery, params);
    const total = Number(countRes.total || 0);

    // Paginated rows
    const dataQuery = `
      SELECT a.id, a.drive_id, a.student_id, a.status, a.applied_at,
             u.name, u.email,
             s.roll_no, s.branch, s.cgpa, s.backlogs, s.graduation_year,
             (s.resume_data IS NOT NULL) AS has_resume,
             tr.percentage AS test_score, tr.score AS raw_score, tr.total AS total_score
      FROM applications a
      JOIN students s ON s.user_id = a.student_id
      JOIN users u ON u.id = s.user_id
      LEFT JOIN test_results tr ON tr.drive_id = a.drive_id AND tr.student_id = a.student_id
      ${whereClause}
      ${orderBy}
      LIMIT ? OFFSET ?
    `;
    const [rows] = await pool.query(dataQuery, [...params, limit, offset]);

    const applicants = rows.map((r) => ({
      id: r.id,
      student_id: r.student_id,
      name: r.name,
      email: r.email,
      roll_no: r.roll_no,
      branch: r.branch,
      cgpa: Number(r.cgpa),
      backlogs: r.backlogs,
      graduation_year: r.graduation_year,
      status: r.status,
      applied_at: r.applied_at,
      test_score: r.test_score != null ? Number(r.test_score) : null,
      raw_score: r.raw_score != null ? Number(r.raw_score) : null,
      total_score: r.total_score != null ? Number(r.total_score) : null,
      resume_url: `/api/resumes/${r.student_id}`,
      has_resume: !!r.has_resume,
    }));

    res.json({
      ok: true,
      applicants,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// POST /api/recruiter/drives/:id/applicants/bulk
// Body: { application_ids: [...], action: 'shortlist' | 'reject' }
// Transactional; validates all belong to this drive, audits, and notifies students
// ---------------------------------------------------------------------------
router.post('/drives/:id/applicants/bulk', authenticateToken, requireRole('recruiter', 'admin'), async (req, res, next) => {
  try {
    const drive = await assertDriveOwnership(req, req.params.id);
    const driveId = parseInt(req.params.id, 10);
    const { application_ids, action } = req.body || {};

    if (!Array.isArray(application_ids) || application_ids.length === 0) {
      return res.status(400).json({ error: 'application_ids must be a non-empty array of IDs.' });
    }

    if (action !== 'shortlist' && action !== 'reject') {
      return res.status(400).json({ error: "action must be either 'shortlist' or 'reject'." });
    }

    const targetStatus = action === 'shortlist' ? 'shortlisted' : 'rejected';

    const result = await withTransaction(async (conn) => {
      // 1. Verify every application exists and belongs to this drive
      const [appRows] = await conn.query(
        `SELECT a.id, a.student_id, a.status, u.name AS student_name
         FROM applications a
         JOIN users u ON u.id = a.student_id
         WHERE a.id IN (?) AND a.drive_id = ?`,
        [application_ids, driveId]
      );

      if (appRows.length !== application_ids.length) {
        const err = new Error('One or more application IDs do not belong to this drive or do not exist.');
        err.status = 400;
        throw err;
      }

      // 2. Update status for all
      await conn.query(
        'UPDATE applications SET status = ? WHERE id IN (?) AND drive_id = ?',
        [targetStatus, application_ids, driveId]
      );

      // 3. Audit log
      await conn.query(
        'INSERT INTO audit_log (action, entity, entity_id, details) VALUES (?, ?, ?, ?)',
        [
          'UPDATE',
          'application_bulk',
          driveId,
          JSON.stringify({
            action,
            target_status: targetStatus,
            application_ids,
            recruiter_id: req.user.id,
          }),
        ]
      );

      // 4. Create notifications for each affected student
      for (const app of appRows) {
        await conn.query(
          'INSERT INTO notifications (user_id, title, body, link) VALUES (?, ?, ?, ?)',
          [
            app.student_id,
            action === 'shortlist' ? 'Application Shortlisted!' : 'Application Status Update',
            action === 'shortlist'
              ? `Congratulations! You have been shortlisted for "${drive.title}". Interview details will appear in your Journey.`
              : `Your application status for "${drive.title}" has been updated.`,
            '/student/journey',
          ]
        );
      }

      return { count: appRows.length };
    });

    res.json({
      ok: true,
      message: `Successfully ${action === 'shortlist' ? 'shortlisted' : 'rejected'} ${result.count} applicant(s).`,
      count: result.count,
    });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// POST /api/recruiter/drives/:id/offers
// Body: { application_id, package_lpa, joining_date?, note? }
// Extends an offer letter to ONE shortlisted/selected applicant (the bulk
// generator in drives.js only covers already-selected students, with the
// drive's package). Validates package_lpa > 0; application must be for this
// drive and in status 'shortlisted' or 'selected'. Re-extending replaces
// the pending letter (same UNIQUE key on drive + student).
// ---------------------------------------------------------------------------
router.post('/drives/:id/offers', authenticateToken, requireRole('recruiter', 'admin'), async (req, res, next) => {
  try {
    const drive = await assertDriveOwnership(req, req.params.id);
    const driveId = parseInt(req.params.id, 10);
    const { application_id, package_lpa, joining_date } = req.body || {};

    const appId = parseInt(application_id, 10);
    if (!appId || isNaN(appId)) {
      return res.status(400).json({ error: 'Valid application_id is required.' });
    }

    const pkg = parseFloat(package_lpa);
    if (isNaN(pkg) || pkg <= 0) {
      return res.status(400).json({ error: 'package_lpa must be a positive number greater than 0.' });
    }

    const result = await withTransaction(async (conn) => {
      // 1. Check application eligibility
      const [apps] = await conn.query(
        `SELECT a.id, a.student_id, a.status, u.name AS student_name, c.name AS company_name
         FROM applications a
         JOIN users u ON u.id = a.student_id
         JOIN drives d ON d.id = a.drive_id
         JOIN companies c ON c.id = d.company_id
         WHERE a.id = ? AND a.drive_id = ?`,
        [appId, driveId]
      );

      if (apps.length === 0) {
        const err = new Error('Application not found for this drive.');
        err.status = 404;
        throw err;
      }

      const app = apps[0];
      if (app.status !== 'shortlisted' && app.status !== 'selected') {
        const err = new Error('Offers can only be extended to shortlisted or selected applicants.');
        err.status = 400;
        throw err;
      }

      const formattedJoiningDate = joining_date ? new Date(joining_date).toISOString().slice(0, 10) : null;

      // 2. Upsert the offer letter (UNIQUE on drive + student)
      const letterText = buildOfferLetter({
        studentName: app.student_name,
        companyName: app.company_name,
        driveTitle: drive.title,
        packageLpa: pkg,
        joiningDate: formattedJoiningDate,
      });
      const [insertRes] = await conn.query(
        `INSERT INTO offer_letters (drive_id, student_id, package_lpa, joining_date, letter_text)
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           package_lpa = VALUES(package_lpa),
           joining_date = VALUES(joining_date),
           letter_text = VALUES(letter_text),
           status = 'pending',
           responded_at = NULL`,
        [driveId, app.student_id, pkg, formattedJoiningDate, letterText]
      );

      // 3. Mark application as selected if not already
      if (app.status !== 'selected') {
        await conn.query("UPDATE applications SET status = 'selected' WHERE id = ?", [app.id]);
      }

      // 4. Audit log
      await conn.query(
        'INSERT INTO audit_log (action, entity, entity_id, details) VALUES (?, ?, ?, ?)',
        [
          'INSERT',
          'offer',
          insertRes.insertId || app.id,
          JSON.stringify({
            application_id: app.id,
            student_id: app.student_id,
            drive_id: driveId,
            package_lpa: pkg,
          }),
        ]
      );

      // 5. Notify student (in-app bell item; email is best-effort elsewhere)
      await conn.query(
        'INSERT INTO notifications (user_id, title, body, link) VALUES (?, ?, ?, ?)',
        [
          app.student_id,
          'Placement Offer Extended!',
          `You have received a placement offer from ${app.company_name} (${pkg} LPA) for "${drive.title}"! Review and respond in My Journey.`,
          '/student/journey',
        ]
      );

      return { student_name: app.student_name };
    });

    res.status(201).json({
      ok: true,
      message: `Placement offer extended to ${result.student_name} successfully.`,
    });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /api/recruiter/drives/:id/offers
// Returns all offer letters for this drive with student details
// ---------------------------------------------------------------------------
router.get('/drives/:id/offers', authenticateToken, requireRole('recruiter', 'admin'), async (req, res, next) => {
  try {
    await assertDriveOwnership(req, req.params.id);
    const driveId = parseInt(req.params.id, 10);

    const [rows] = await pool.query(
      `SELECT o.id, o.drive_id, o.student_id,
              o.package_lpa, o.joining_date, o.status,
              o.generated_at AS created_at, o.responded_at,
              a.id AS application_id,
              u.name, u.email,
              s.roll_no, s.branch, s.cgpa
       FROM offer_letters o
       JOIN students s ON s.user_id = o.student_id
       JOIN users u ON u.id = s.user_id
       LEFT JOIN applications a ON a.drive_id = o.drive_id AND a.student_id = o.student_id
       WHERE o.drive_id = ?
       ORDER BY o.generated_at DESC`,
      [driveId]
    );

    res.json({
      ok: true,
      offers: rows.map((r) => ({
        id: r.id,
        application_id: r.application_id,
        student_id: r.student_id,
        name: r.name,
        email: r.email,
        roll_no: r.roll_no,
        branch: r.branch,
        cgpa: Number(r.cgpa),
        package_lpa: Number(r.package_lpa),
        joining_date: r.joining_date,
        note: null,
        status: r.status,
        created_at: r.created_at,
        responded_at: r.responded_at,
      })),
    });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// POST /api/recruiter/offers/:id/withdraw
// Sets status = 'withdrawn'. Allowed only while the letter is still 'pending'
// (a student who already answered cannot have it taken back this way).
// ---------------------------------------------------------------------------
router.post('/offers/:id/withdraw', authenticateToken, requireRole('recruiter', 'admin'), async (req, res, next) => {
  try {
    const offerId = parseInt(req.params.id, 10);
    if (!offerId || isNaN(offerId)) {
      return res.status(400).json({ error: 'Invalid offer ID.' });
    }

    await withTransaction(async (conn) => {
      const [rows] = await conn.query(
        `SELECT o.*, d.created_by, d.company_id, d.title AS drive_title, u.name AS student_name
         FROM offer_letters o
         JOIN drives d ON d.id = o.drive_id
         JOIN users u ON u.id = o.student_id
         WHERE o.id = ? FOR UPDATE`,
        [offerId]
      );

      if (rows.length === 0) {
        const err = new Error('Offer not found.');
        err.status = 404;
        throw err;
      }

      const offer = rows[0];

      // Ownership check: the recruiter who created the drive, or an admin
      const isAdmin = req.user.role === 'admin';
      const isOwner = req.user.id === offer.created_by;
      if (!isAdmin && !isOwner) {
        const err = new Error('You are not authorized to manage this offer.');
        err.status = 403;
        throw err;
      }

      if (offer.status !== 'pending') {
        const err = new Error(`Cannot withdraw an offer that is already ${offer.status}.`);
        err.status = 400;
        throw err;
      }

      await conn.query("UPDATE offer_letters SET status = 'withdrawn' WHERE id = ?", [offerId]);

      await conn.query(
        'INSERT INTO audit_log (action, entity, entity_id, details) VALUES (?, ?, ?, ?)',
        ['UPDATE', 'offer', offerId, JSON.stringify({ action: 'withdraw', recruiter_id: req.user.id })]
      );

      await conn.query(
        'INSERT INTO notifications (user_id, title, body, link) VALUES (?, ?, ?, ?)',
        [
          offer.student_id,
          'Offer Withdrawn',
          `The placement offer for "${offer.drive_title}" has been withdrawn.`,
          '/student/journey',
        ]
      );
    });

    res.json({ ok: true, message: 'Offer withdrawn successfully.' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
