// Shared MySQL connection pool (mysql2/promise).
// Reads connection settings from the environment (see .env.example).
require('dotenv').config();
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'campusflow',
  waitForConnections: true,
  // A generous limit: the stress test fires up to 200 concurrent
  // booking attempts, and every attempt holds a connection while it
  // waits on the row lock. Serialization happens in the DB, not here.
  connectionLimit: 20,
  queueLimit: 0,
});

module.exports = pool;

// ---------------------------------------------------------------------------
// Executable SQL owned by this module (the pool is infrastructure; these
// queries are the DBMS work: "how big is the database, and is it alive?").
// ---------------------------------------------------------------------------

// healthCheck() — the cheapest possible query: is the database reachable?
async function healthCheck() {
  const [[row]] = await pool.query('SELECT 1 AS ok');
  return row.ok === 1;
}

// tableCounts() — one row-count per key table in a single round-trip.
// Sub-selects keep it to one query no matter how many tables we add.
async function tableCounts() {
  const [[counts]] = await pool.query(
    `SELECT (SELECT COUNT(*) FROM users) AS users,
            (SELECT COUNT(*) FROM students) AS students,
            (SELECT COUNT(*) FROM companies) AS companies,
            (SELECT COUNT(*) FROM drives) AS drives,
            (SELECT COUNT(*) FROM applications) AS applications,
            (SELECT COUNT(*) FROM slots) AS slots,
            (SELECT COUNT(*) FROM bookings) AS bookings,
            (SELECT COUNT(*) FROM resources) AS resources,
            (SELECT COUNT(*) FROM test_questions) AS test_questions,
            (SELECT COUNT(*) FROM test_results) AS test_results,
            (SELECT COUNT(*) FROM notifications) AS notifications,
            (SELECT COUNT(*) FROM audit_log) AS audit_log,
            (SELECT COUNT(*) FROM lock_events) AS lock_events`
  );
  const out = {};
  for (const [k, v] of Object.entries(counts)) out[k] = Number(v);
  return out;
}

module.exports.healthCheck = healthCheck;
module.exports.tableCounts = tableCounts;
