// Pipeline engine — the system manages test & interview sessions end-to-end.
// Recruiters only configure (drive → questions → interview params); students
// only show up. Every seat assignment goes through the same critical-section
// primitive as manual booking (os/critical-section.js: SELECT ... FOR UPDATE), so the
// M3 concurrency story — row locks, lock_events, Kernel Monitor, stress test —
// is unchanged. Only the *caller* changed: the scheduler instead of the student.

const pool = require('../dbms/db');
const { setActor, clearActor } = require('../dbms/db');
const { bookSeat } = require('./critical-section');
const { findEligibleStudents } = require('../dbms/eligibility');
const { recordTestResult } = require('../dbms/transactions');
const { gradeCoding } = require('./code-runner');
const { notifyUser } = require('../mailer');
const { publish } = require('../realtime');

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

// Save the in-app notification AND try to email the same message
// (mailer.js notifyUser). The bell item is always saved first; email is
// best-effort — if SMTP is not set up, or sending fails, the student still
// gets the notification in-app and this call never throws. `db` is a pool
// or a pooled connection — either has the .query() notifyUser expects.
async function notify(db, userId, title, body, link) {
  const appUrl = (process.env.APP_URL || 'http://localhost:5173').replace(/\/$/, '');
  await notifyUser(db, {
    userId,
    title,
    body,
    link,
    emailSubject: title,
    emailText: link ? `${body}\n\nSee more: ${appUrl}${link}` : body,
  });
}

// Send notifications queued during scheduling, AFTER the DB work is done
// and the pooled connection released. Same pattern as routes/bookings.js:
// notify after commit, wrapped in try/catch. One student's failure (mail
// down, bad row) is logged and skipped — it never fails the scheduling
// that already happened, and never holds the connection while sending.
async function sendPending(pending, where) {
  for (const n of pending) {
    try {
      await notify(pool, n.userId, n.title, n.body, n.link);
    } catch (err) {
      console.error(`[pipeline:${where}] notification to user ${n.userId} failed:`, err.message);
    }
  }
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

const { freeMachineCounts } = require('./lab-status');

// ---------------------------------------------------------------------------
// scheduleTestSessions(driveId, actorId)
// Batches every applicant into lab sessions (biggest lab first, back-to-back
// from 10:00 with a 15-minute changeover), books each seat through the
// serialized bookSeat() critical section, and notifies every student where
// and when their test is. Drive moves open → testing.
// ---------------------------------------------------------------------------
async function scheduleTestSessions(driveId, actorId) {
  const conn = await pool.getConnection();
  // Notifications are only QUEUED while the connection is held (below)
  // and sent after it is released — a throwing notify used to abort
  // mid-loop, leaving slots created but the drive never flipped.
  const pending = [];
  let result;
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

    // Lab-agent preference (Phase 2, M3): when the C++ lab agent has
    // reported recently, labs with more free machines go first — a lab
    // whose machines are actually up beats a bigger lab whose machines
    // are busy or silent. Capacity stays the tiebreak. When the agent
    // has never run, or its data cannot be read, the order above
    // (capacity only) is untouched, so scheduling behaves exactly as before.
    try {
      const freeCounts = await freeMachineCounts(conn);
      const hasAgentData = Object.values(freeCounts).some((n) => n > 0);
      if (hasAgentData) {
        labs.sort(
          (a, b) =>
            (freeCounts[b.id] || 0) - (freeCounts[a.id] || 0) || b.capacity - a.capacity
        );
      }
    } catch (_) {
      // Lab status is a preference, never a requirement — schedule anyway.
    }

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

    // --- create slots + serialized seat assignments (notifications queued) ---
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
        await bookSeat(slotId, st.student_id, holder, { actorId });
        assigned += 1;
        pending.push({
          userId: st.student_id,
          title: `Test scheduled: ${drive.title}`,
          body: `${s.title}${venue ? ` · ${venue}` : ''} · ${fmtWhen(s.startsAt)}. Reach 15 minutes early with your ID card.`,
          link: `/student/drives/${driveId}`,
        });
      }
    }

    await conn.query("UPDATE drives SET status = 'testing' WHERE id = ?", [driveId]);
    // Live update: browsers refresh the moment sessions exist (the emails
    // and bell items above are the durable copy; this is just the fast path).
    publish('test-scheduled', {
      driveId,
      driveTitle: drive.title,
      message: `Test sessions scheduled for ${drive.title}`,
      sessions: sessions.length,
      assigned,
    });
    result = { sessions: sessions.length, assigned };
  } finally {
    conn.release();
  }
  // DB work done, connection released — now notify. A failure here
  // cannot roll anything back (and never throws: see sendPending).
  await sendPending(pending, 'scheduleTestSessions');
  return result;
}

// ---------------------------------------------------------------------------
// publishResults(driveId, actorId)
// Grades are already in test_results (written at submit time). This step:
//   1. marks everyone who took the test,
//   2. shortlists score >= min_test_score, top max_shortlist by percentage,
//   3. auto-builds the interview timetable (rotating panels × rooms),
//   4. notifies every candidate of their result + interview slot.
// Drive moves testing → interviews.
// ---------------------------------------------------------------------------
async function publishResults(driveId, actorId) {
  const conn = await pool.getConnection();
  // Notifications are only QUEUED while the connection is held (below)
  // and sent after it is released — a throwing notify used to abort
  // mid-loop, leaving results half-sent and the drive never flipped.
  const pending = [];
  let result;
  try {
    // Audit attribution: the application status flips below fire the audit
    // triggers on THIS connection, so the recruiter publishing the results
    // is recorded as the actor.
    await setActor(conn, actorId);
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

    // Cutoff for this publish: the active round's cutoff when the drive has
    // rounds (and one is active); otherwise the drive's own qualifying score.
    // Drives with no rounds never reach the round query's rows, so their
    // behaviour is exactly as before.
    let cutoff = Number(drive.min_test_score);
    const [activeRounds] = await conn.query(
      "SELECT cutoff FROM drive_rounds WHERE drive_id = ? AND status = 'active' ORDER BY round_no LIMIT 1",
      [driveId]
    );
    if (activeRounds.length) cutoff = Number(activeRounds[0].cutoff);

    const [top] = await conn.query(
      `SELECT student_id, percentage FROM test_results
       WHERE drive_id = ? AND percentage >= ?
       ORDER BY percentage DESC, submitted_at ASC
       LIMIT ?`,
      [driveId, cutoff, drive.max_shortlist]
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
      await bookSeat(res.insertId, shortIds[i], holder, { actorId });
      interviews.push({ student_id: shortIds[i], panel, room: room ? room.name : null, startsAt, endsAt });
      cursor += durMin;
    }

    // --- notifications queued: results to everyone, schedule to the shortlisted ---
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
        pending.push({
          userId: r.student_id,
          title: `Shortlisted: ${drive.title} 🎉`,
          body: `You scored ${Number(r.percentage).toFixed(1)}%. Interview: ${fmtWhen(iv.startsAt)} · Panel ${iv.panel}${iv.room ? ` · ${iv.room}` : ''}.`,
          link: `/student/drives/${driveId}`,
        });
      } else {
        pending.push({
          userId: r.student_id,
          title: `Result: ${drive.title}`,
          body: `You scored ${Number(r.percentage).toFixed(1)}% (cutoff ${Number(cutoff).toFixed(0)}%). You were not shortlisted this time — more drives are coming.`,
          link: `/student/drives/${driveId}`,
        });
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
      pending.push({
        userId: n.student_id,
        title: `Result: ${drive.title}`,
        body: `You did not take the test, so your application was not considered. Watch the deadlines on upcoming drives.`,
        link: `/student/drives/${driveId}`,
      });
    }

    await conn.query("UPDATE drives SET status = 'interviews' WHERE id = ?", [driveId]);
    // Live updates: results first, then the interview timetable (if any).
    publish('results-published', {
      driveId,
      driveTitle: drive.title,
      message: `Results are out for ${drive.title}`,
      shortlisted: shortIds.length,
    });
    if (interviews.length) {
      publish('interview-scheduled', {
        driveId,
        driveTitle: drive.title,
        message: `${interviews.length} interview${interviews.length !== 1 ? 's' : ''} scheduled for ${drive.title}`,
        interviews: interviews.length,
      });
    }
    result = { shortlisted: shortIds.length, interviews: interviews.length };
  } finally {
    await clearActor(conn);
    conn.release();
  }
  // DB work done, connection released — now notify. A failure here
  // cannot roll anything back (and never throws: see sendPending).
  await sendPending(pending, 'publishResults');
  return result;
}

// ---------------------------------------------------------------------------
// submitTest(driveId, studentId, answers, tabSwitches) — one attempt,
// auto-graded. answers: { questionId: chosenIndex | code } — a chosen
// option number for aptitude questions, the student's code string for coding
// questions. tabSwitches: how many times the student left the test tab
// (counted client-side, stored on the result for the recruiter).
// ---------------------------------------------------------------------------
async function submitTest(driveId, studentId, answers, tabSwitches) {
  const [qs] = await pool.query(
    'SELECT id, type, language, expected_output, correct_index, marks FROM test_questions WHERE drive_id = ?',
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
    if (q.type === 'coding') {
      // Coding: run the submitted code, compare its output with the expected
      // one. A match earns full marks; anything else (wrong output, runtime
      // error, timeout, no runner) earns 0 for this question.
      const code = (answers || {})[q.id];
      if (typeof code === 'string' && code.trim()) {
        const earned = await gradeCoding({ language: q.language, code, expectedOutput: q.expected_output });
        if (earned) score += q.marks;
      }
    } else if (Number((answers || {})[q.id]) === q.correct_index) {
      score += q.marks;
    }
  }
  // Percentage is score/total as a 0–100 number, rounded to 2 decimals.
  // (Was *1000/100, which is 10x too small: a perfect paper scored 10%,
  // so no student could ever clear a 50/60 cutoff.)
  const percentage = total ? Math.round((score / total) * 10000) / 100 : 0;

  // One transaction (dbms/transactions.js): the result row and the
  // 'test_taken' status flip succeed or fail together.
  const switches = Math.max(0, Math.floor(Number(tabSwitches) || 0));
  return recordTestResult(driveId, studentId, { score, total, percentage, answers, tabSwitches: switches });
}

// ---------------------------------------------------------------------------
// eligibleStudents(criteria) — every student passing the given criteria.
// Used for the wizard's live preview and the recruiter's eligible-students view.
// The filtering is a single indexed SQL query (dbms/eligibility.js), not a
// fetch-all-and-filter in Node.
// ---------------------------------------------------------------------------
async function eligibleStudents(criteria) {
  const students = await findEligibleStudents(criteria);
  return students.map((student) => ({ student, eligible: true, fail_reasons: [] }));
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
