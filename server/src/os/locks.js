// Lock observability for the Kernel Monitor.
// Every critical-section entry/exit writes a row to `lock_events`.
// This module only *observes* — the actual mutual exclusion lives in
// MySQL (SELECT ... FOR UPDATE inside a transaction). Never throws.
const pool = require('../dbms/db');

async function logLockEvent(lockName, holder, action, waitMs = 0) {
  try {
    await pool.query(
      'INSERT INTO lock_events (lock_name, holder, action, wait_ms) VALUES (?, ?, ?, ?)',
      [lockName, String(holder), action, Math.round(waitMs)]
    );
  } catch (err) {
    // A monitoring table must never break a booking.
    console.error('[locks] failed to record lock event:', err.message);
  }
}

module.exports = { logLockEvent };
