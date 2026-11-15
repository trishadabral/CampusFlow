// DBMS — transaction helper.
//
// Every multi-statement write in CampusFlow runs through withTransaction():
// one connection, BEGIN … COMMIT, automatic ROLLBACK on any failure, and the
// connection always returned to the pool. Callers write only the statements;
// this module owns the ACID guarantees.
//
// Usage:
//   const { withTransaction } = require('../dbms/transactions');
//   const saved = await withTransaction(async (conn) => {
//     await conn.query('DELETE FROM test_questions WHERE drive_id = ?', [id]);
//     for (const q of questions) await conn.query('INSERT INTO test_questions ...', [...]};
//     return questions.length;
//   });

const pool = require('./db');
const { setActor, clearActor } = require('./db');

// withTransaction(work, actorId) — one connection, BEGIN … COMMIT, automatic
// ROLLBACK on any failure, and the connection always returned to the pool.
// actorId (optional) is the user the writes are attributed to: it is set as
// the @actor_id session variable on this same connection, so the audit
// triggers on bookings/applications/allocations record who acted, and
// cleared before the connection goes back to the pool.
async function withTransaction(work, actorId) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    if (actorId != null) await setActor(conn, actorId);
    const result = await work(conn);
    await conn.commit();
    return result;
  } catch (err) {
    try {
      await conn.rollback();
    } catch (_) {
      // already rolled back or never began — safe to ignore
    }
    throw err;
  } finally {
    if (actorId != null) await clearActor(conn);
    conn.release(); // always return the connection to the pool
  }
}

// ---------------------------------------------------------------------------
// Transactional operations owned by this module. Each one is multiple SQL
// statements that must succeed or fail together — the reason withTransaction
// exists. Routes validate input; this module owns the writes.
// ---------------------------------------------------------------------------

// replaceQuestionSet(driveId, questions) — the recruiter's question builder
// saves by REPLACING the whole set: DELETE the old rows, INSERT the new ones.
// One transaction means a failed insert can never leave the drive with half
// a test (or zero questions after the delete).
async function replaceQuestionSet(driveId, questions) {
  return withTransaction(async (conn) => {
    await conn.query('DELETE FROM test_questions WHERE drive_id = ?', [driveId]);
    for (const q of questions || []) {
      await conn.query(
        `INSERT INTO test_questions (drive_id, question_text, options, correct_index, marks)
         VALUES (?, ?, ?, ?, ?)`,
        [
          driveId,
          String(q.text).trim(),
          JSON.stringify((q.options || []).map((o) => String(o))),
          q.correct_index,
          q.marks > 0 ? Math.floor(q.marks) : 1,
        ]
      );
    }
    return (questions || []).length;
  });
}

// recordTestResult(driveId, studentId, result) — stores the graded result AND
// flips the application to 'test_taken' atomically. Without the transaction,
// a crash between the two statements would record a result the pipeline never
// sees (application stuck on 'applied'), or flip the status with no result row.
async function recordTestResult(driveId, studentId, { score, total, percentage, answers }) {
  return withTransaction(async (conn) => {
    await conn.query(
      `INSERT INTO test_results (drive_id, student_id, score, total, percentage, answers)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [driveId, studentId, score, total, percentage, JSON.stringify(answers || {})]
    );
    await conn.query(
      `UPDATE applications SET status = 'test_taken'
       WHERE drive_id = ? AND student_id = ? AND status = 'applied'`,
      [driveId, studentId]
    );
    // submitted_at defaults to NOW() in the DB — read it back so the
    // submit response matches the already-submitted read path, which
    // returns the same field (both shown by TestTaker).
    const [[row]] = await conn.query(
      'SELECT submitted_at FROM test_results WHERE drive_id = ? AND student_id = ?',
      [driveId, studentId]
    );
    return { score, total, percentage, submitted_at: row.submitted_at };
  }, studentId); // the student submitting the test is the actor for the status flip
}

module.exports = { withTransaction, replaceQuestionSet, recordTestResult };
