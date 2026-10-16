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

async function withTransaction(work) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
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
    conn.release(); // always return the connection to the pool
  }
}

module.exports = { withTransaction };
