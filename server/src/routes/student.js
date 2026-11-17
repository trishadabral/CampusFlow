// Student journey: one endpoint powering the "My journey" dashboard.
// For every application, returns the full pipeline state the student cares
// about: application → test session (venue/time) → result → interview.

const express = require('express');
const pool = require('../dbms/db');
const { withTransaction } = require('../dbms/transactions');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { fmtWhen } = require('../os/pipeline');

const router = express.Router();

function step(key, label, state, detail) {
  return { key, label, state, detail: detail || null };
}

// Interview date is a calendar date (no time) — "15 Feb 2027".
function fmtDay(value) {
  const d = value instanceof Date ? value : new Date(value);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

// Limits for profile uploads (checked server-side; the client checks too,
// but the server is the one that must enforce them).
const MAX_PHOTO_BYTES = 2 * 1024 * 1024; // ~2 MB
const MAX_RESUME_BYTES = 5 * 1024 * 1024; // ~5 MB

// A base64 data URL ("data:<mime>;base64,<payload>") → { mime, bytes }.
// Returns null when the value is not a data URL at all.
function parseDataUrl(value) {
  if (typeof value !== 'string') return null;
  const m = /^data:([^;,]+);base64,([A-Za-z0-9+/=]+)$/.exec(value.trim());
  if (!m) return null;
  return { mime: m[1].toLowerCase(), base64: m[2], bytes: Buffer.from(m[2], 'base64').length };
}

// GET /student/profile — name/email from users, the rest from students.
// resume_data is never sent here — only the file name (the file itself
// downloads from GET /student/profile/resume).
router.get('/profile', authenticateToken, requireRole('student'), async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT u.name, u.email,
              s.roll_no, s.branch, s.cgpa, s.backlogs, s.graduation_year,
              s.skills, s.photo_data, s.resume_filename,
              s.phone, s.projects, s.certifications
       FROM users u
       JOIN students s ON s.user_id = u.id
       WHERE u.id = ?`,
      [req.user.id]
    );
    if (!rows.length) {
      return res.status(404).json({ error: 'Student profile not found.' });
    }
    const r = rows[0];
    res.json({
      name: r.name,
      email: r.email,
      roll_no: r.roll_no,
      branch: r.branch,
      cgpa: r.cgpa != null ? Number(r.cgpa) : null,
      backlogs: r.backlogs,
      graduation_year: r.graduation_year,
      skills: r.skills || '',
      photo_data: r.photo_data || null,
      resume_filename: r.resume_filename || null,
      phone: r.phone || '',
      projects: parseJsonArray(r.projects),
      certifications: parseJsonArray(r.certifications),
    });
  } catch (err) {
    next(err);
  }
});

// A JSON column (projects / certifications) → array, or [] when empty/invalid.
function parseJsonArray(value) {
  if (!value) return [];
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

// Validate the projects array from the profile form (merged from Ishika's
// repo 2026-11-16): at most 10, each with a title (max 100 chars), an
// optional description (max 500) and link (max 255). Returns the JSON
// string to store, or null when the field was not sent.
function validateProjects(projects) {
  if (projects === undefined || projects === null) return null;
  if (!Array.isArray(projects)) {
    const e = new Error('Projects must be a list.');
    e.status = 400;
    throw e;
  }
  if (projects.length > 10) {
    const e = new Error('Projects cannot exceed 10 items.');
    e.status = 400;
    throw e;
  }
  for (const p of projects) {
    if (!p || typeof p !== 'object' || !p.title || typeof p.title !== 'string') {
      const e = new Error('Each project must include a title.');
      e.status = 400;
      throw e;
    }
    if (p.title.length > 100) {
      const e = new Error('Project title cannot exceed 100 characters.');
      e.status = 400;
      throw e;
    }
    if (p.desc && (typeof p.desc !== 'string' || p.desc.length > 500)) {
      const e = new Error('Project description cannot exceed 500 characters.');
      e.status = 400;
      throw e;
    }
    if (p.link && (typeof p.link !== 'string' || p.link.length > 255)) {
      const e = new Error('Project link cannot exceed 255 characters.');
      e.status = 400;
      throw e;
    }
  }
  return JSON.stringify(projects);
}

// Validate the certifications array (merged from Ishika's repo 2026-11-16):
// at most 10, each with a name (max 100 chars), optional issuer (max 100)
// and year. Returns the JSON string to store, or null when not sent.
function validateCertifications(certifications) {
  if (certifications === undefined || certifications === null) return null;
  if (!Array.isArray(certifications)) {
    const e = new Error('Certifications must be a list.');
    e.status = 400;
    throw e;
  }
  if (certifications.length > 10) {
    const e = new Error('Certifications cannot exceed 10 items.');
    e.status = 400;
    throw e;
  }
  for (const c of certifications) {
    if (!c || typeof c !== 'object' || !c.name || typeof c.name !== 'string') {
      const e = new Error('Each certification must include a name.');
      e.status = 400;
      throw e;
    }
    if (c.name.length > 100) {
      const e = new Error('Certification name cannot exceed 100 characters.');
      e.status = 400;
      throw e;
    }
    if (c.issuer && (typeof c.issuer !== 'string' || c.issuer.length > 100)) {
      const e = new Error('Certification issuer cannot exceed 100 characters.');
      e.status = 400;
      throw e;
    }
  }
  return JSON.stringify(certifications);
}

// PUT /student/profile — edit name, skills, photo and resume.
// Only the fields sent are changed. Photo: image data URL, max ~2 MB.
// Resume: PDF data URL, max ~5 MB; the file name is stored with it.
// Phone, projects and certifications are also editable here (merged from
// Ishika's repo 2026-11-16). Skills stays a plain comma-separated string
// in this repo (Ishika stored it as JSON); projects/certifications are JSON.
router.put('/profile', authenticateToken, requireRole('student'), async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    const { name, skills, photo_data, resume_data, resume_filename, phone, projects, certifications } = req.body || {};

    let photoToStore;
    let photoTouched = false;
    if (photo_data !== undefined) {
      photoTouched = true;
      if (photo_data === null || photo_data === '') {
        photoToStore = null; // remove the photo
      } else {
        const parsed = parseDataUrl(photo_data);
        if (!parsed || !parsed.mime.startsWith('image/')) {
          return res.status(400).json({ error: 'Your photo must be an image file (JPG or PNG).' });
        }
        if (parsed.bytes > MAX_PHOTO_BYTES) {
          return res.status(400).json({ error: 'Your photo must be smaller than 2 MB.' });
        }
        photoToStore = photo_data;
      }
    }

    let resumeToStore;
    let resumeTouched = false;
    if (resume_data !== undefined) {
      resumeTouched = true;
      if (resume_data === null || resume_data === '') {
        resumeToStore = null; // remove the resume
      } else {
        const parsed = parseDataUrl(resume_data);
        if (!parsed || parsed.mime !== 'application/pdf') {
          return res.status(400).json({ error: 'Your resume must be a PDF file.' });
        }
        if (parsed.bytes > MAX_RESUME_BYTES) {
          return res.status(400).json({ error: 'Your resume must be smaller than 5 MB.' });
        }
        // Store raw base64 (no data: prefix); the download endpoint re-adds the type.
        resumeToStore = parsed.base64;
      }
    }

    let filenameToStore = null;
    if (resumeTouched && resumeToStore) {
      filenameToStore = String(resume_filename || 'resume.pdf')
        .split(/[\\/]/)
        .pop()
        .slice(0, 255);
      if (!filenameToStore.toLowerCase().endsWith('.pdf')) filenameToStore += '.pdf';
    }

    // Phone / projects / certifications (merged from Ishika's repo): validated
    // up front so a bad value fails before any write happens.
    let phoneToStore = null;
    let phoneTouched = false;
    if (phone !== undefined) {
      phoneTouched = true;
      if (phone === null || String(phone).trim() === '') {
        phoneToStore = null; // clear the phone number
      } else {
        const p = String(phone).trim();
        if (!/^[+0-9\s\-()]{7,20}$/.test(p)) {
          return res.status(400).json({ error: 'Invalid phone number format.' });
        }
        phoneToStore = p;
      }
    }
    const projectsToStore = validateProjects(projects);
    const certificationsToStore = validateCertifications(certifications);

    await conn.beginTransaction();
    if (name !== undefined) {
      const cleanName = String(name).trim();
      if (!cleanName) {
        const err = new Error('Your name cannot be empty.');
        err.status = 400;
        throw err;
      }
      await conn.query('UPDATE users SET name = ? WHERE id = ?', [cleanName, req.user.id]);
    }
    if (skills !== undefined) {
      await conn.query('UPDATE students SET skills = ? WHERE user_id = ?', [
        String(skills).trim() || null,
        req.user.id,
      ]);
    }
    if (photoTouched) {
      await conn.query('UPDATE students SET photo_data = ? WHERE user_id = ?', [
        photoToStore,
        req.user.id,
      ]);
    }
    if (resumeTouched) {
      await conn.query(
        'UPDATE students SET resume_data = ?, resume_filename = ? WHERE user_id = ?',
        [resumeToStore, filenameToStore, req.user.id]
      );
    }
    if (phoneTouched) {
      await conn.query('UPDATE students SET phone = ? WHERE user_id = ?', [
        phoneToStore,
        req.user.id,
      ]);
    }
    if (projectsToStore !== null) {
      await conn.query('UPDATE students SET projects = ? WHERE user_id = ?', [
        projectsToStore,
        req.user.id,
      ]);
    }
    if (certificationsToStore !== null) {
      await conn.query('UPDATE students SET certifications = ? WHERE user_id = ?', [
        certificationsToStore,
        req.user.id,
      ]);
    }
    await conn.commit();

    const [rows] = await pool.query(
      `SELECT u.name, u.email,
              s.roll_no, s.branch, s.cgpa, s.backlogs, s.graduation_year,
              s.skills, s.photo_data, s.resume_filename,
              s.phone, s.projects, s.certifications
       FROM users u
       JOIN students s ON s.user_id = u.id
       WHERE u.id = ?`,
      [req.user.id]
    );
    const r = rows[0];
    res.json({
      name: r.name,
      email: r.email,
      roll_no: r.roll_no,
      branch: r.branch,
      cgpa: r.cgpa != null ? Number(r.cgpa) : null,
      backlogs: r.backlogs,
      graduation_year: r.graduation_year,
      skills: r.skills || '',
      photo_data: r.photo_data || null,
      resume_filename: r.resume_filename || null,
      phone: r.phone || '',
      projects: parseJsonArray(r.projects),
      certifications: parseJsonArray(r.certifications),
    });
  } catch (err) {
    try {
      await conn.rollback();
    } catch (_) {}
    next(err);
  } finally {
    conn.release();
  }
});

// GET /student/profile/resume — download the stored PDF.
router.get('/profile/resume', authenticateToken, requireRole('student'), async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      'SELECT resume_data, resume_filename FROM students WHERE user_id = ?',
      [req.user.id]
    );
    const row = rows[0];
    if (!row || !row.resume_data) {
      return res.status(404).json({ error: 'No resume saved yet. Upload a PDF from your profile.' });
    }
    const filename = row.resume_filename || 'resume.pdf';
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename.replace(/"/g, '')}"`);
    res.send(Buffer.from(row.resume_data, 'base64'));
  } catch (err) {
    next(err);
  }
});

// DELETE /student/profile/resume — remove the stored resume.
router.delete('/profile/resume', authenticateToken, requireRole('student'), async (req, res, next) => {
  try {
    await pool.query(
      'UPDATE students SET resume_data = NULL, resume_filename = NULL WHERE user_id = ?',
      [req.user.id]
    );
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// PATCH /student/applications/:id/withdraw — take back an application while
// it is still 'applied' or 'test_taken'. Merged from Ishika's repo
// 2026-11-16; needs the 'withdrawn' value on applications.status
// (database/schema.sql, migrate_v7.sql).
router.patch('/applications/:id/withdraw', authenticateToken, requireRole('student'), async (req, res, next) => {
  try {
    const appId = parseInt(req.params.id, 10);
    if (!appId || isNaN(appId)) {
      return res.status(400).json({ error: 'Invalid application ID.' });
    }

    const [rows] = await pool.query(
      `SELECT a.id, a.status, a.student_id, a.drive_id,
              d.title AS drive_title, d.created_by AS recruiter_id,
              u.name AS student_name
       FROM applications a
       JOIN drives d ON d.id = a.drive_id
       JOIN users u ON u.id = a.student_id
       WHERE a.id = ?`,
      [appId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Application not found.' });
    }

    const app = rows[0];
    if (app.student_id !== req.user.id) {
      return res.status(403).json({ error: 'You do not own this application.' });
    }

    if (app.status !== 'applied' && app.status !== 'test_taken') {
      return res.status(400).json({
        error: `Application cannot be withdrawn once ${app.status}. Only 'applied' or 'test_taken' applications can be withdrawn.`,
      });
    }

    await withTransaction(async (conn) => {
      await conn.query("UPDATE applications SET status = 'withdrawn' WHERE id = ?", [app.id]);
      await conn.query(
        'INSERT INTO audit_log (action, entity, entity_id, details) VALUES (?, ?, ?, ?)',
        ['UPDATE', 'application', app.id, JSON.stringify({ old_status: app.status, new_status: 'withdrawn', student_id: req.user.id })]
      );
      await conn.query(
        'INSERT INTO notifications (user_id, title, body, link) VALUES (?, ?, ?, ?)',
        [
          app.recruiter_id,
          'Application Withdrawn',
          `${app.student_name} withdrew their application for "${app.drive_title}".`,
          `/recruiter/drives/${app.drive_id}`,
        ]
      );
    });

    res.json({ ok: true, message: 'Application withdrawn successfully.' });
  } catch (err) {
    next(err);
  }
});

// GET /student/journey
router.get('/journey', authenticateToken, requireRole('student'), async (req, res, next) => {
  try {
    const [apps] = await pool.query(
      `SELECT a.id, a.status, a.applied_at,
              d.id AS drive_id, d.title AS drive_title, d.status AS drive_status,
              d.interview_date AS drive_interview_date,
              c.name AS company_name,
              o.id AS offer_id, o.package_lpa AS offer_package_lpa,
              o.joining_date AS offer_joining_date, o.status AS offer_status,
              o.responded_at AS offer_responded_at
       FROM applications a
       JOIN drives d ON d.id = a.drive_id
       JOIN companies c ON c.id = d.company_id
       LEFT JOIN offer_letters o ON o.drive_id = a.drive_id AND o.student_id = a.student_id
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
        'SELECT score, total, percentage, submitted_at, tab_switches FROM test_results WHERE drive_id = ? AND student_id = ?',
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
      } else if (result) {
        // A score exists, so the test was taken even if no booked session
        // is on record (seeded/legacy results) — never show "not
        // scheduled yet" next to a score.
        steps.push(step('test', 'Test session', 'done', 'Test taken'));
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
        // No interview slot yet: the drive's interview date is the real
        // next step. Without a date, say nothing rather than promising.
        steps.push(step(
          'interview', 'Interview', 'current',
          a.drive_interview_date
            ? `Interviews on ${fmtDay(a.drive_interview_date)} — your exact time will be shown here once interviews are scheduled`
            : null
        ));
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
          ? { score: Number(result.score), total: Number(result.total), percentage: Number(result.percentage), submitted_at: result.submitted_at, tab_switches: Number(result.tab_switches || 0) }
          : null,
        interview,
        offer: a.offer_id
          ? {
              id: a.offer_id,
              package_lpa: a.offer_package_lpa != null ? Number(a.offer_package_lpa) : null,
              joining_date: a.offer_joining_date,
              status: a.offer_status,
              responded_at: a.offer_responded_at,
            }
          : null,
        steps,
      });
    }
    res.json(journey);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
