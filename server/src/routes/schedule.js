// Interview Scheduler: turn a drive's shortlist into a real interview timetable.
//
// The old Scheduling Lab asked the user to type candidates by hand. This endpoint
// does what the product actually needs:
//   1. take the drive's SHORTLISTED students (no manual entry),
//   2. compute each candidate's priority from their marks (highest CGPA first),
//   3. run a CPU scheduling algorithm (priority | fcfs) over the interviews,
//   4. reserve a lab big enough for the whole interview window (Banker's check),
//   5. write real interview slots into the database so students see their time.
//
// OS concepts demonstrated: CPU scheduling (priority / FCFS), resource allocation
// with a safety check. DBMS: set-based reads, one transaction for the slot writes.
const express = require('express');
const pool = require('../dbms/db');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { simulate } = require('../os/cpu-scheduler');
const { checkAllocation } = require('../os/banker');

const router = express.Router();

// POST /schedule/simulate — ad-hoc simulation (FCFS / Priority only).
router.post('/simulate', (req, res, next) => {
  try {
    const { algorithm, interviews } = req.body || {};
    if (!['fcfs', 'priority'].includes(algorithm)) {
      return res.status(400).json({ error: 'Algorithm must be one of: fcfs, priority.' });
    }
    if (!Array.isArray(interviews) || !interviews.length) {
      return res.status(400).json({ error: 'Provide a non-empty interviews array.' });
    }
    for (const p of interviews) {
      if (p.id == null || p.burst == null || Number(p.burst) <= 0) {
        return res
          .status(400)
          .json({ error: 'Every interview needs an id and a positive burst time.' });
      }
    }
    res.json(simulate(algorithm, interviews));
  } catch (err) {
    next(err);
  }
});

function toMySQL(d) {
  const p = (n) => String(n).padStart(2, '0');
  return (
    `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ` +
    `${p(d.getHours())}:${p(d.getMinutes())}:00`
  );
}

function parseStart(value, fallbackDate) {
  if (value) {
    const d = new Date(value);
    if (!isNaN(d.getTime())) return d;
  }
  const d = fallbackDate ? new Date(fallbackDate) : new Date();
  if (isNaN(d.getTime())) d.setTime(Date.now());
  d.setHours(10, 0, 0, 0);
  return d;
}

const AUTO_PURPOSE = (driveId) => `Auto interview venue: drive #${driveId}`;

// POST /schedule/auto — generate the interview timetable for a drive.
router.post(
  '/auto',
  authenticateToken,
  requireRole('admin', 'recruiter'),
  async (req, res, next) => {
    const { drive_id, algorithm = 'priority', interview_minutes, starts_at } = req.body || {};
    try {
      if (!drive_id) {
        return res.status(400).json({ error: 'drive_id is required.' });
      }
      if (!['priority', 'fcfs'].includes(algorithm)) {
        return res
          .status(400)
          .json({ error: "Algorithm must be 'priority' (highest marks first) or 'fcfs' (application order)." });
      }

      const [[drive]] = await pool.query('SELECT * FROM drives WHERE id = ?', [drive_id]);
      if (!drive) {
        return res.status(404).json({ error: 'Drive not found.' });
      }

      const [[existing]] = await pool.query(
        "SELECT COUNT(*) AS c FROM slots WHERE drive_id = ? AND type = 'interview'",
        [drive_id]
      );
      if (Number(existing.c) > 0) {
        return res.status(409).json({
          error: 'This drive already has interview slots.',
          hint: 'Delete the generated timetable first (Start over) to build a new one.',
        });
      }

      // 1. The shortlist — ordered by application time (matters for FCFS).
      const [students] = await pool.query(
        `SELECT u.id, u.name, u.email, s.cgpa, s.branch, a.applied_at
         FROM applications a
         JOIN students s ON s.user_id = a.student_id
         JOIN users u ON u.id = s.user_id
         WHERE a.drive_id = ? AND a.status = 'shortlisted'
         ORDER BY a.applied_at ASC`,
        [drive_id]
      );
      if (!students.length) {
        return res.status(422).json({
          error: 'No shortlisted students yet.',
          hint: 'Run the eligibility shortlist for this drive first, then schedule interviews.',
        });
      }

      const minutes = Math.min(120, Math.max(5, Number(interview_minutes) || Number(drive.interview_duration_min) || 15));
      const startDate = parseStart(starts_at, drive.interview_date);

      // 2. Priority from marks: highest CGPA → smallest scheduler number → interviewed first.
      const interviews = students.map((s, i) => ({
        id: i + 1,
        student_id: s.id,
        label: s.name,
        burst: minutes,
        priority: algorithm === 'priority' ? Math.round((10 - Number(s.cgpa)) * 100) : 0,
        arrival: algorithm === 'fcfs' ? i : 0,
        cgpa: Number(s.cgpa),
        branch: s.branch,
      }));

      // 3. Run the CPU scheduler.
      const sim = simulate(algorithm, interviews);
      const timeline = sim.gantt.map((g) => {
        const iv = interviews.find((x) => x.id === g.id);
        return {
          student_id: iv.student_id,
          name: iv.label,
          cgpa: iv.cgpa,
          branch: iv.branch,
          start: toMySQL(new Date(startDate.getTime() + g.start * 60000)),
          end: toMySQL(new Date(startDate.getTime() + g.end * 60000)),
          wait_min: Math.round(g.start - iv.arrival),
        };
      });
      const windowStart = timeline[0].start;
      const windowEnd = timeline[timeline.length - 1].end;

      // 4. Reserve a lab big enough for the whole interview window (safety-checked).
      let lab = { status: 'skipped', resource_name: null, explanation: null };
      const [labs] = await pool.query(
        `SELECT * FROM resources WHERE type = 'lab' AND status = 'available' AND capacity >= ?
         ORDER BY capacity ASC LIMIT 1`,
        [students.length]
      );
      if (!labs.length) {
        lab = {
          status: 'skipped',
          resource_name: null,
          explanation: `No available lab fits ${students.length} candidates. Add a bigger lab under Resources and regenerate.`,
        };
      } else {
        const resource = labs[0];
        try {
          await checkAllocation(pool, {
            resource_id: resource.id,
            seats_needed: students.length,
            starts_at: windowStart,
            ends_at: windowEnd,
          });
          const [aRes] = await pool.query(
            `INSERT INTO allocations (resource_id, purpose, seats_needed, starts_at, ends_at, allocated_by)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [resource.id, AUTO_PURPOSE(drive_id), students.length, windowStart, windowEnd, req.user.id]
          );
          lab = {
            status: 'reserved',
            resource_name: resource.name,
            allocation_id: aRes.insertId,
            seats: students.length,
            explanation: null,
          };
        } catch (err) {
          lab = {
            status: 'refused',
            resource_name: resource.name,
            explanation: err.explanation || err.message || 'The lab could not be reserved safely.',
          };
        }
      }
      const venueId = lab.status === 'reserved' ? labs[0].id : null;

      // 5. Write the real interview slots (one transaction — all or nothing).
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        for (const t of timeline) {
          await conn.query(
            `INSERT INTO slots (drive_id, resource_id, type, title, starts_at, ends_at, capacity, auto_scheduled)
             VALUES (?, ?, 'interview', ?, ?, ?, 1, 1)`,
            [drive_id, venueId, `Interview — ${t.name}`, t.start, t.end]
          );
        }
        await conn.commit();
      } catch (err) {
        await conn.rollback();
        throw err;
      } finally {
        conn.release();
      }

      res.status(201).json({
        drive: { id: drive.id, title: drive.title },
        algorithm,
        interview_minutes: minutes,
        students: interviews.map((iv, i) => ({
          order: i + 1,
          student_id: iv.student_id,
          name: iv.label,
          cgpa: iv.cgpa,
          branch: iv.branch,
        })),
        timeline,
        avg_waiting_time: sim.avg_waiting_time,
        avg_turnaround_time: sim.avg_turnaround_time,
        lab,
      });
    } catch (err) {
      next(err);
    }
  }
);

// GET /schedule/auto/:drive_id — the generated timetable, if one exists.
router.get('/auto/:drive_id', authenticateToken, async (req, res, next) => {
  try {
    const [slots] = await pool.query(
      `SELECT s.id, s.title, s.starts_at, s.ends_at, r.name AS venue
       FROM slots s
       LEFT JOIN resources r ON r.id = s.resource_id
       WHERE s.drive_id = ? AND s.auto_scheduled = 1
       ORDER BY s.starts_at`,
      [req.params.drive_id]
    );
    res.json({ slots });
  } catch (err) {
    next(err);
  }
});

// DELETE /schedule/auto/:drive_id — remove the generated timetable (slots + venue).
router.delete(
  '/auto/:drive_id',
  authenticateToken,
  requireRole('admin', 'recruiter'),
  async (req, res, next) => {
    try {
      const driveId = req.params.drive_id;
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        await conn.query('DELETE FROM allocations WHERE purpose = ?', [AUTO_PURPOSE(driveId)]);
        const [r] = await conn.query(
          'DELETE FROM slots WHERE drive_id = ? AND auto_scheduled = 1',
          [driveId]
        );
        await conn.commit();
        res.json({ ok: true, removed_slots: r.affectedRows });
      } catch (err) {
        await conn.rollback();
        throw err;
      } finally {
        conn.release();
      }
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
