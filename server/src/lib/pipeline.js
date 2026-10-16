// Pipeline engine — the system manages test & interview sessions end-to-end.
// Recruiters only configure (drive → questions → interview params); students
// only show up. Every seat assignment goes through the same critical-section
// primitive as manual booking (lib/booking.js: SELECT ... FOR UPDATE), so the
// M3 concurrency story — row locks, lock_events, Kernel Monitor, stress test —
// is unchanged. Only the *caller* changed: the scheduler instead of the student.

const pool = require('../db');
const { bookSeat } = require('./booking');
const { checkEligibility } = require('./eligibility');

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function pad(n) {
  return String(n).padStart(2, '0');
}

// Any Date/string → 'YYYY-MM-DD'
function toDay(value) {
  const d = value instanceof Date ? value : new Date(value);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// 'YYYY-MM-DD' + minutes since midnight → 'YYYY-MM-DD HH:MM:SS'
function dayTime(day, minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${day} ${pad(h)}:${pad(m)}:00`;
}

function addDays(day, n) {
  const [y, m, d] = day.split('-').map(Number);
  const dt = new Date(y, m - 1, d + n);
  return toDay(dt);
}

// Human sentence for notifications: "12 Nov, 10:00 AM".
function fmtWhen(startsAt) {
  const d = startsAt instanceof Date ? startsAt : new Date(startsAt);
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  let h = d.getHours();
  const ap = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${d.getDate()} ${months[d.getMonth()]}, ${h}:${pad(d.getMinutes())} ${ap}`;
}

async function notify(conn, userId, title, body, link) {
  await conn.query(
    'INSERT INTO notifications (user_id, title, body, link) VALUES (?, ?, ?, ?)',
    [userId, title, body, link || null]
  );
}

async function getDrive(conn, driveId) {
  const [rows] = await conn.query('SELECT * FROM drives WHERE id = ?', [driveId]);
  return rows[0] || null;
}

async function getApplicants(conn, driveId) {
  const [rows] = await conn.query(
    `SELECT a.student_id, u.name, u.email
     FROM applications a
     JOIN users u ON u.id = a.student_id
     WHERE a.drive_id = ? AND a.status = 'applied'
     ORDER BY a.applied_at`,
    [driveId]
  );
  return rows;
}

// ---------------------------------------------------------------------------
// scheduleTestSessions(driveId, actorId)
// Batches every applicant into lab sessions (biggest lab first, back-to-back
// from 10:00 with a 15-minute changeover), books each seat through the
// serialized bookSeat() critical section, and notifies every student where
// and when their test is. Drive moves open → testing.
// ---------------------------------------------------------------------------
async function scheduleTestSessions(driveId, actorId) {
  const conn = await pool.getConnection();
  try {
    const drive = await getDrive(conn, driveId);
    if (!drive) throw httpError(404, 'Drive not found.');
    if (drive.status !== 'open') {
      throw httpError(400, 'Test sessions can only be scheduled while a drive is accepting applications.');
    }
    if (!drive.test_date) {
      throw httpError(400, 'Set a test date for this drive first.');
    }
    const applicants = await getApplicants(conn, driveId);
    if (!applicants.length) {
      throw httpError(400, 'There are no applications to schedule yet.');
    }
    const [qRows] = await conn.query('SELECT COUNT(*) AS c FROM test_questions WHERE drive_id = ?', [driveId]);
    if (!qRows[0].c) {
      throw httpError(400, 'Upload the test questions before scheduling test sessions.');
    }

    const [labs] = await conn.query(
      "SELECT * FROM resources WHERE type = 'lab' AND status = 'available' ORDER BY capacity DESC"
    );

    const day = toDay(drive.test_date);
    const durMin = drive.test_duration_min || 60;
    const GAP_MIN = 15;
    const DAY_END = 18 * 60; // labs close at 18:00
    const holder = `system:drive:${driveId}`;

    // --- batch applicants into sessions ---
    const sessions = []; // { lab, students:[{student_id,name}], startsAt, endsAt, title }
    const queue = [...applicants];
    let batchNo = 0;
    if (!labs.length) {
      // No labs registered: one big session, venue TBA.
      sessions.push({
        lab: null,
        students: queue.splice(0, queue.length),
        startsAt: dayTime(day, 600),
        endsAt: dayTime(day, 600 + durMin),
        title: `Aptitude Test · Batch ${String.fromCharCode(65 + batchNo)}`,
      });
    } else {
      for (const lab of labs) {
        let cursor = 600; // 10:00
        while (queue.length && cursor + durMin <= DAY_END) {
          const take = queue.splice(0, lab.capacity);
          sessions.push({
            lab,
            students: take,
            startsAt: dayTime(day, cursor),
            endsAt: dayTime(day, cursor + durMin),
            title: `Aptitude Test · Batch ${String.fromCharCode(65 + batchNo)}`,
          });
          batchNo += 1;
          cursor += durMin + GAP_MIN;
          if (!take.length) break;
        }
        if (!queue.length) break;
      }
      // More applicants than lab capacity: overflow sessions, venue TBA.
      while (queue.length) {
        const take = queue.splice(0, 50);
        sessions.push({
          lab: null,
          students: take,
          startsAt: dayTime(day, 600),
          endsAt: dayTime(day, 600 + durMin),
          title: `Aptitude Test · Batch ${String.fromCharCode(65 + batchNo)} (overflow)`,
        });
        batchNo += 1;
      }
    }

    // --- create slots + serialized seat assignments + notifications ---
    let assigned = 0;
    for (const s of sessions) {
      const venue = s.lab ? s.lab.name : null;
      const [res] = await conn.query(
        `INSERT INTO slots (drive_id, resource_id, type, title, starts_at, ends_at, capacity)
         VALUES (?, ?, 'test', ?, ?, ?, ?)`,
        [driveId, s.lab ? s.lab.id : null, venue ? `${s.title} · ${venue}` : s.title,
         s.startsAt, s.endsAt, Math.max(s.students.length, 1)]
      );
      const slotId = res.insertId;
      for (const st of s.students) {
        await bookSeat(slotId, st.student_id, holder);
        assigned += 1;
        await notify(
          conn,
          st.student_id,
          `Test scheduled: ${drive.title}`,
          `${s.title}${venue ? ` · ${venue}` : ''} · ${fmtWhen(s.startsAt)}. Reach 15 minutes early with your ID card.`,
          `/student/drives/${driveId}`
        );
      }
    }

    await conn.query("UPDATE drives SET status = 'testing' WHERE id = ?", [driveId]);
    return { sessions: sessions.length, assigned };
  } finally {
    conn.release();
  }
}

// ---------------------------------------------------------------------------
// publishResults(driveId, actorId)
// Grades are already in test_results (written at submit time). This step:
//   1. marks everyone who took the test,
//   2. shortlists score >= min_test_score, top max_shortlist by percentage,
//   3. auto-builds the interview timetable (round-robin panels × rooms),
//   4. notifies every candidate of their result + interview slot.
// Drive moves testing → interviews.
// ---------------------------------------------------------------------------
async function publishResults(driveId, actorId) {
  const conn = await pool.getConnection();
  try {
    const drive = await getDrive(conn, driveId);
    if (!drive) throw httpError(404, 'Drive not found.');
    if (drive.status !== 'testing') {
      throw httpError(400, 'Results can only be published after test sessions are scheduled.');
    }

    // Everyone with a submitted test counts as having taken it.
    await conn.query(
      `UPDATE applications SET status = 'test_taken'
       WHERE drive_id = ? AND status = 'applied'
         AND student_id IN (SELECT student_id FROM test_results WHERE drive_id = ?)`,
      [driveId, driveId]
    );

    const [top] = await conn.query(
      `SELECT student_id, percentage FROM test_results
       WHERE drive_id = ? AND percentage >= ?
       ORDER BY percentage DESC, submitted_at ASC
       LIMIT ?`,
      [driveId, drive.min_test_score, drive.max_shortlist]
    );
    const shortIds = top.map((r) => r.student_id);

    if (shortIds.length) {
      await conn.query(
        'UPDATE applications SET status = ? WHERE drive_id = ? AND student_id IN (?)',
        ['shortlisted', driveId, shortIds]
      );
    }
    // No-shows and below-cutoff candidates are rejected in one sweep.
    await conn.query(
      "UPDATE applications SET status = 'rejected' WHERE drive_id = ? AND status IN ('applied','test_taken')",
      [driveId]
    );

    // --- interview timetable ---
    const baseDay = drive.interview_date ? toDay(drive.interview_date) : addDays(toDay(drive.test_date), 3);
    const durMin = drive.interview_duration_min || 20;
    const panels = Math.max(1, drive.num_interviewers || 1);
    const [rooms] = await conn.query(
      "SELECT * FROM resources WHERE type = 'room' AND status = 'available' ORDER BY id"
    );

    const holder = `system:drive:${driveId}`;
    let day = baseDay;
    let cursor = 600; // 10:00
    let roomIdx = 0;
    const interviews = [];

    for (let i = 0; i < shortIds.length; i++) {
      if (cursor >= 13 * 60 && cursor < 14 * 60) cursor = 14 * 60; // lunch break
      if (cursor + durMin > 17 * 60) {                            // next day
        day = addDays(day, 1);
        cursor = 600;
      }
      const panel = (i % panels) + 1;
      const room = rooms.length ? rooms[roomIdx % rooms.length] : null;
      roomIdx += 1;
      const startsAt = dayTime(day, cursor);
      const endsAt = dayTime(day, cursor + durMin);
      const [res] = await conn.query(
        `INSERT INTO slots (drive_id, resource_id, type, title, starts_at, ends_at, capacity)
         VALUES (?, ?, 'interview', ?, ?, ?, 1)`,
        [driveId, room ? room.id : null, `Interview · Panel ${panel}`, startsAt, endsAt]
      );
      await bookSeat(res.insertId, shortIds[i], holder);
      interviews.push({ student_id: shortIds[i], panel, room: room ? room.name : null, startsAt, endsAt });
      cursor += durMin;
    }

    // --- notifications: results to everyone, schedule to the shortlisted ---
    const [results] = await conn.query(
      `SELECT r.student_id, r.percentage, u.name
       FROM test_results r JOIN users u ON u.id = r.student_id
       WHERE r.drive_id = ?`,
      [driveId]
    );
    const shortSet = new Set(shortIds);
    const interviewByStudent = new Map(interviews.map((iv) => [iv.student_id, iv]));
    for (const r of results) {
      if (shortSet.has(r.student_id)) {
        const iv = interviewByStudent.get(r.student_id);
        await notify(
          conn, r.student_id,
          `Shortlisted: ${drive.title} 🎉`,
          `You scored ${Number(r.percentage).toFixed(1)}%. Interview: ${fmtWhen(iv.startsAt)} · Panel ${iv.panel}${iv.room ? ` · ${iv.room}` : ''}.`,
          `/student/drives/${driveId}`
        );
      } else {
        await notify(
          conn, r.student_id,
          `Result: ${drive.title}`,
          `You scored ${Number(r.percentage).toFixed(1)}% (cutoff ${Number(drive.min_test_score).toFixed(0)}%). You were not shortlisted this time — more drives are coming.`,
          `/student/drives/${driveId}`
        );
      }
    }
    // Applicants who never took the test.
    const [noShows] = await conn.query(
      `SELECT a.student_id FROM applications a
       WHERE a.drive_id = ? AND a.status = 'rejected'
         AND a.student_id NOT IN (SELECT student_id FROM test_results WHERE drive_id = ?)`,
      [driveId, driveId]
    );
    for (const n of noShows) {
      await notify(
        conn, n.student_id,
        `Result: ${drive.title}`,
        `You did not take the test, so your application was not considered. Watch the deadlines on upcoming drives.`,
        `/student/drives/${driveId}`
      );
    }

    await conn.query("UPDATE drives SET status = 'interviews' WHERE id = ?", [driveId]);
    return { shortlisted: shortIds.length, interviews: interviews.length };
  } finally {
    conn.release();
  }
}

// ---------------------------------------------------------------------------
// submitTest(driveId, studentId, answers) — one attempt, auto-graded.
// answers: { questionId: chosenIndex }
// ---------------------------------------------------------------------------
async function submitTest(driveId, studentId, answers) {
  const [qs] = await pool.query(
    'SELECT id, correct_index, marks FROM test_questions WHERE drive_id = ?',
    [driveId]
  );
  if (!qs.length) throw httpError(400, 'This drive has no test questions yet.');
  const [apps] = await pool.query(
    'SELECT id, status FROM applications WHERE drive_id = ? AND student_id = ?',
    [driveId, studentId]
  );
  if (!apps.length) throw httpError(403, 'You have not applied for this drive.');
  const [existing] = await pool.query(
    'SELECT id FROM test_results WHERE drive_id = ? AND student_id = ?',
    [driveId, studentId]
  );
  if (existing.length) throw httpError(409, 'You have already submitted this test.');

  let score = 0;
  let total = 0;
  for (const q of qs) {
    total += q.marks;
    if (Number((answers || {})[q.id]) === q.correct_index) score += q.marks;
  }
  const percentage = total ? Math.round((score / total) * 1000) / 100 : 0;

  await pool.query(
    `INSERT INTO test_results (drive_id, student_id, score, total, percentage, answers)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [driveId, studentId, score, total, percentage, JSON.stringify(answers || {})]
  );
  await pool.query(
    "UPDATE applications SET status = 'test_taken' WHERE drive_id = ? AND student_id = ? AND status = 'applied'",
    [driveId, studentId]
  );
  return { score, total, percentage };
}

// ---------------------------------------------------------------------------
// eligibleStudents(criteria) — every student passing the given criteria.
// Used for the wizard's live preview and the recruiter's eligible-students view.
// ---------------------------------------------------------------------------
async function eligibleStudents(criteria) {
  const [rows] = await pool.query(
    `SELECT u.id, u.name, u.email, s.roll_no, s.branch, s.cgpa, s.backlogs, s.graduation_year
     FROM students s JOIN users u ON u.id = s.user_id
     ORDER BY s.cgpa DESC`
  );
  return rows
    .map((r) => {
      const student = {
        id: r.id, name: r.name, email: r.email, roll_no: r.roll_no,
        branch: r.branch, cgpa: Number(r.cgpa), backlogs: r.backlogs,
        graduation_year: r.graduation_year,
      };
      const { eligible, reasons } = checkEligibility(student, criteria);
      return { student, eligible, fail_reasons: reasons };
    })
    .filter((r) => r.eligible);
}

module.exports = {
  scheduleTestSessions,
  publishResults,
  submitTest,
  eligibleStudents,
  notify,
  httpError,
  fmtWhen,
  toDay,
};
