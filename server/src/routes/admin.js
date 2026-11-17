// Admin control center: the full pipeline at a glance — per-drive stats,
// the master schedule of every test & interview session, and who is where.
// All SQL lives in dbms/reports.js; this route only shapes the JSON.

const express = require('express');
const crypto = require('crypto');
const pool = require('../dbms/db');
const { driveOverview, masterSchedule, driveRoster } = require('../dbms/reports');
const { authenticateToken, requireRole } = require('../middleware/auth');
const pcAllocator = require('../os/pc-allocator');
const { emitAgentStatus, emitAgentEvent, emitSessionUpdate } = require('../socket');
const { publish } = require('../realtime');

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

// ===========================================================================
// Exam PC Monitoring & Telemetry
// Physical exam PCs, the Windows agent fleet, and proctoring events.
// ===========================================================================

// GET /api/admin/monitoring/pcs — full status of every PC, agent, and active session
router.get('/monitoring/pcs', async (req, res, next) => {
  try {
    const [pcs] = await pool.query(
      `SELECT
         c.id, c.pc_code, c.resource_id AS lab_id, r.name AS lab_name, c.enrollment_code, c.status AS computer_status,
         ad.id AS agent_device_id, ad.status AS agent_status, ad.hostname, ad.agent_version, ad.last_heartbeat_at,
         ad.last_foreground_title, ad.last_foreground_process,
         es.id AS session_id, es.status AS session_status, es.exam_window_keyword, es.starts_at, es.ends_at,
         u.name AS student_name, s.roll_no, s.user_id AS student_id,
         (SELECT COUNT(*) FROM monitoring_events me WHERE me.exam_session_id = es.id AND me.review_status = 'new') AS unreviewed_events_count
       FROM computers c
       JOIN resources r ON r.id = c.resource_id
       LEFT JOIN agent_devices ad ON ad.computer_id = c.id
       LEFT JOIN exam_sessions es ON es.computer_id = c.id AND es.status IN ('scheduled', 'active')
       LEFT JOIN users u ON u.id = es.student_id
       LEFT JOIN students s ON s.user_id = u.id
       ORDER BY r.name ASC, c.pc_code ASC`
    );
    res.json(pcs);
  } catch (err) {
    next(err);
  }
});

// GET /api/admin/monitoring/events — telemetry events with filters and pagination
router.get('/monitoring/events', async (req, res, next) => {
  try {
    const { sessionId, computerId, reviewStatus, eventType, limit } = req.query;
    let sql = `
      SELECT
        me.id, me.exam_session_id, me.computer_id, me.event_type, me.window_title, me.process_name,
        me.occurred_at, me.received_at, me.review_status, me.reviewed_by, me.review_note,
        c.pc_code, r.name AS lab_name, u.name AS reviewer_name,
        es.student_id, stu_u.name AS student_name
      FROM monitoring_events me
      JOIN computers c ON c.id = me.computer_id
      JOIN resources r ON r.id = c.resource_id
      LEFT JOIN users u ON u.id = me.reviewed_by
      LEFT JOIN exam_sessions es ON es.id = me.exam_session_id
      LEFT JOIN users stu_u ON stu_u.id = es.student_id
      WHERE 1=1
    `;
    const params = [];

    if (sessionId) {
      sql += ' AND me.exam_session_id = ?';
      params.push(Number(sessionId));
    }
    if (computerId) {
      sql += ' AND me.computer_id = ?';
      params.push(Number(computerId));
    }
    if (reviewStatus) {
      sql += ' AND me.review_status = ?';
      params.push(reviewStatus);
    }
    if (eventType) {
      sql += ' AND me.event_type = ?';
      params.push(eventType);
    }

    const maxLimit = Math.min(Math.max(Number(limit) || 50, 1), 200);
    sql += ' ORDER BY me.occurred_at DESC, me.id DESC LIMIT ?';
    params.push(maxLimit);

    const [events] = await pool.query(sql, params);
    res.json(events);
  } catch (err) {
    next(err);
  }
});

// PATCH /api/admin/monitoring/events/:id — human review of telemetry flags.
// Flags need human review; they are not proof of cheating.
router.patch('/monitoring/events/:id', async (req, res, next) => {
  try {
    const { review_status, review_note } = req.body;
    const eventId = Number(req.params.id);

    if (!['new', 'reviewed', 'dismissed'].includes(review_status)) {
      return res.status(400).json({ error: "review_status must be 'new', 'reviewed', or 'dismissed'." });
    }

    const [result] = await pool.query(
      `UPDATE monitoring_events
       SET review_status = ?, review_note = ?, reviewed_by = ?
       WHERE id = ?`,
      [review_status, review_note ? String(review_note).trim() : null, req.user.id, eventId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: `Event #${eventId} not found.` });
    }

    const [updated] = await pool.query(
      `SELECT me.*, c.pc_code, u.name AS reviewer_name
       FROM monitoring_events me
       JOIN computers c ON c.id = me.computer_id
       LEFT JOIN users u ON u.id = me.reviewed_by
       WHERE me.id = ?`,
      [eventId]
    );

    emitAgentEvent(updated[0]);
    res.json(updated[0]);
  } catch (err) {
    next(err);
  }
});

// ===========================================================================
// Exam Sessions Management
// ===========================================================================

// POST /api/admin/exam-sessions — allocate PC to a student under row lock
router.post('/exam-sessions', async (req, res, next) => {
  try {
    const { computer_id, student_id, drive_id, exam_window_keyword, ends_at } = req.body;
    if (!computer_id || !student_id) {
      return res.status(400).json({ error: 'computer_id and student_id are required.' });
    }

    const session = await pcAllocator.allocatePcToStudent({
      computerId: Number(computer_id),
      studentId: Number(student_id),
      driveId: drive_id ? Number(drive_id) : null,
      examWindowKeyword: exam_window_keyword,
      endsAt: ends_at || null,
      createdBy: req.user.id,
      holderLabel: req.user.email,
    });

    emitSessionUpdate(session);
    emitAgentStatus({
      computer_id: session.computer_id,
      pc_code: session.pc_code,
      status: 'allocated',
    });
    publish('session-update', session);

    res.status(201).json(session);
  } catch (err) {
    next(err);
  }
});

// POST /api/admin/exam-sessions/:id/start — transitions session to active
router.post('/exam-sessions/:id/start', async (req, res, next) => {
  try {
    const session = await pcAllocator.startSession(Number(req.params.id), req.user.email);
    emitSessionUpdate(session);
    publish('session-update', session);
    res.json(session);
  } catch (err) {
    next(err);
  }
});

// POST /api/admin/exam-sessions/:id/end — ends session and frees the PC
router.post('/exam-sessions/:id/end', async (req, res, next) => {
  try {
    const session = await pcAllocator.endSession(Number(req.params.id), req.user.email);
    emitSessionUpdate(session);
    emitAgentStatus({
      computer_id: session.computer_id,
      pc_code: session.pc_code,
      status: 'available',
    });
    publish('session-update', session);
    res.json(session);
  } catch (err) {
    next(err);
  }
});

// ===========================================================================
// Computers Management
// ===========================================================================

// GET /api/admin/computers — list all computers
router.get('/computers', async (req, res, next) => {
  try {
    const [pcs] = await pool.query(
      `SELECT c.id, c.resource_id AS lab_id, r.name AS lab_name, c.pc_code, c.enrollment_code, c.status,
              ad.status AS agent_status, ad.hostname, ad.last_heartbeat_at
       FROM computers c
       JOIN resources r ON r.id = c.resource_id
       LEFT JOIN agent_devices ad ON ad.computer_id = c.id
       ORDER BY r.name ASC, c.pc_code ASC`
    );
    res.json(pcs);
  } catch (err) {
    next(err);
  }
});

// POST /api/admin/computers — add a new computer to a lab
router.post('/computers', async (req, res, next) => {
  try {
    const { resource_id, pc_code } = req.body;
    if (!resource_id || !pc_code) {
      return res.status(400).json({ error: 'resource_id and pc_code are required.' });
    }

    const [labs] = await pool.query(
      "SELECT id, name FROM resources WHERE id = ? AND type = 'lab'",
      [Number(resource_id)]
    );
    if (!labs.length) {
      return res.status(400).json({ error: 'Valid computer lab resource_id is required.' });
    }

    const lab = labs[0];
    const prefix = lab.name.toUpperCase().replace(/\s+/g, '-');
    const enrollmentCode = `ENROLL-${prefix}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;

    try {
      const [result] = await pool.query(
        'INSERT INTO computers (resource_id, pc_code, enrollment_code, status) VALUES (?, ?, ?, ?)',
        [lab.id, String(pc_code).trim().toUpperCase(), enrollmentCode, 'available']
      );

      res.status(201).json({
        id: result.insertId,
        resource_id: lab.id,
        lab_name: lab.name,
        pc_code: String(pc_code).trim().toUpperCase(),
        enrollment_code: enrollmentCode,
        status: 'available',
      });
    } catch (err) {
      if (err.code === 'ER_DUP_ENTRY') {
        return res.status(409).json({ error: `Computer code '${pc_code}' is already registered.` });
      }
      throw err;
    }
  } catch (err) {
    next(err);
  }
});

// POST /api/admin/computers/:id/regenerate-enrollment
router.post('/computers/:id/regenerate-enrollment', async (req, res, next) => {
  try {
    const computerId = Number(req.params.id);
    const [pcs] = await pool.query(
      `SELECT c.id, c.pc_code, r.name AS lab_name
       FROM computers c
       JOIN resources r ON r.id = c.resource_id
       WHERE c.id = ?`,
      [computerId]
    );

    if (!pcs.length) {
      return res.status(404).json({ error: `Computer #${computerId} not found.` });
    }

    const pc = pcs[0];
    const prefix = pc.lab_name.toUpperCase().replace(/\s+/g, '-');
    const newEnrollmentCode = `ENROLL-${prefix}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;

    await pool.query('UPDATE computers SET enrollment_code = ? WHERE id = ?', [
      newEnrollmentCode,
      computerId,
    ]);

    res.json({
      id: computerId,
      pc_code: pc.pc_code,
      enrollment_code: newEnrollmentCode,
    });
  } catch (err) {
    next(err);
  }
});

// ===========================================================================
// Prohibited Processes Management
// ===========================================================================

// GET /api/admin/prohibited-processes
router.get('/prohibited-processes', async (req, res, next) => {
  try {
    const [procs] = await pool.query(
      `SELECT pp.id, pp.process_name, pp.created_at, u.name AS added_by_name
       FROM prohibited_processes pp
       LEFT JOIN users u ON u.id = pp.added_by
       ORDER BY pp.process_name ASC`
    );
    res.json(procs);
  } catch (err) {
    next(err);
  }
});

// POST /api/admin/prohibited-processes
router.post('/prohibited-processes', async (req, res, next) => {
  try {
    const { process_name } = req.body;
    if (!process_name || typeof process_name !== 'string') {
      return res.status(400).json({ error: 'process_name is required.' });
    }

    const cleanName = process_name.trim().toLowerCase();
    if (!cleanName) {
      return res.status(400).json({ error: 'process_name cannot be blank.' });
    }

    try {
      const [resInsert] = await pool.query(
        'INSERT INTO prohibited_processes (process_name, added_by) VALUES (?, ?)',
        [cleanName, req.user.id]
      );
      res.status(201).json({
        id: resInsert.insertId,
        process_name: cleanName,
        added_by_name: req.user.name,
      });
    } catch (err) {
      if (err.code === 'ER_DUP_ENTRY') {
        return res.status(409).json({ error: `Process '${cleanName}' is already in the prohibited list.` });
      }
      throw err;
    }
  } catch (err) {
    next(err);
  }
});

// DELETE /api/admin/prohibited-processes/:id
router.delete('/prohibited-processes/:id', async (req, res, next) => {
  try {
    const [delRes] = await pool.query('DELETE FROM prohibited_processes WHERE id = ?', [
      Number(req.params.id),
    ]);
    if (delRes.affectedRows === 0) {
      return res.status(404).json({ error: 'Prohibited process not found.' });
    }
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// ===========================================================================
// Admin Drive Management
// ===========================================================================

// GET /api/admin/drives?status= — list drives, optional status filter, include company name
router.get('/drives', async (req, res, next) => {
  try {
    const { status } = req.query;
    let sql = `SELECT d.*, c.name AS company_name FROM drives d JOIN companies c ON c.id = d.company_id`;
    const params = [];
    if (status) {
      sql += ' WHERE d.status = ?';
      params.push(status);
    }
    const [rows] = await pool.query(sql, params);
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
