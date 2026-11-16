// Lock observability for the Kernel Monitor.
// Every critical-section entry/exit writes a row to `lock_events`.
// This module only *observes* — the actual mutual exclusion lives in
// MySQL (SELECT ... FOR UPDATE inside a transaction). Never throws.
//
// Why a separate pool: logLockEvent is called from INSIDE transactions
// that already hold a connection from the main pool (see
// os/critical-section.js bookSeat). If it used the same pool, a rush-hour
// test (100 concurrent bookings, pool limit 20) deadlocked itself — every
// pooled connection ended up held by a transaction waiting for one more
// pooled connection to log with, and only 5 of 10 seats got booked while
// the rest timed out on the 50 s InnoDB lock wait, again and again
// (250 s for a 100-way test). The logging pool is separate, so a log
// insert can never starve the transaction that triggered it.
require('dotenv').config();
const mysql = require('mysql2/promise');

const logPool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'campusflow',
  waitForConnections: true,
  // Log inserts are ~1 ms fire-and-forget rows; 3 connections are plenty
  // even when 100 bookings race, and the queue drains in milliseconds.
  connectionLimit: 3,
  queueLimit: 0,
});

async function logLockEvent(lockName, holder, action, waitMs = 0) {
  try {
    await logPool.query(
      'INSERT INTO lock_events (lock_name, holder, action, wait_ms) VALUES (?, ?, ?, ?)',
      [lockName, String(holder), action, Math.round(waitMs)]
    );
  } catch (err) {
    // A monitoring table must never break a booking.
    console.error('[locks] failed to record lock event:', err.message);
  }
}

module.exports = { logLockEvent };
