// OS — PC Allocator & Critical Section Manager for Exam Terminals.
//
// Operating System Concepts Implemented:
// 1. MUTUAL EXCLUSION & CRITICAL SECTIONS:
//    Allocating an exam PC or modifying session state is a critical section.
//    The computer row in MySQL serves as the binary semaphore / mutex.
//    Using `SELECT ... FROM computers WHERE id = ? FOR UPDATE` within a transaction
//    serializes concurrent allocation attempts at the database engine level (InnoDB).
//    Even under massive request bursts, exactly ONE allocation succeeds; all races
//    detect either the modified status or hit the unique generated column constraint
//    `uq_active_computer_session` and rollback with HTTP 409 Conflict.
//
// 2. MEMORY / RESOURCE PLACEMENT ALGORITHMS:
//    - FIRST FIT: Scans available resources sequentially from the beginning and
//      selects the first available PC that satisfies the request. Fast (O(1) with index).
//    - BEST FIT: Evaluates all candidate partitions (computer labs) with sufficient
//      available seats and selects the lab with the *minimum excess capacity*
//      (i.e. fewest free PCs that still >= requested count). This minimizes external
//      fragmentation, keeping large contiguous blocks of PCs available for large batches.

const pool = require('../dbms/db');
const { logLockEvent } = require('./locks');

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

/**
 * Allocates a specific PC to a student under strict mutual exclusion.
 * Prevents double allocation under concurrent requests.
 */
async function allocatePcToStudent({
  computerId,
  studentId,
  driveId = null,
  examWindowKeyword = 'CampusFlow',
  endsAt = null,
  createdBy = null,
  holderLabel = 'admin',
}) {
  const lockName = `computer:${computerId}`;
  const conn = await pool.getConnection();
  let lockLogged = false;
  let lockReleased = false;

  const releaseLock = () => {
    if (lockLogged && !lockReleased) {
      lockReleased = true;
      logLockEvent(lockName, holderLabel, 'release', 0);
    }
  };

  try {
    await conn.beginTransaction();

    // 1. Acquire mutex on the computer row
    const t0 = Date.now();
    const [pcRows] = await conn.query(
      'SELECT id, resource_id, pc_code, enrollment_code, status FROM computers WHERE id = ? FOR UPDATE',
      [computerId]
    );
    const waitMs = Date.now() - t0;
    logLockEvent(lockName, holderLabel, waitMs > 30 ? 'wait' : 'acquire', waitMs);
    lockLogged = true;

    const pc = pcRows[0];
    if (!pc) {
      await conn.rollback();
      throw httpError(404, `Computer #${computerId} not found.`);
    }

    if (pc.status !== 'available') {
      await conn.rollback();
      throw httpError(409, `Computer ${pc.pc_code} is not available (current status: ${pc.status}).`);
    }

    // 2. Verify no active/scheduled session already exists on this computer
    const [existingSessions] = await conn.query(
      "SELECT id, status FROM exam_sessions WHERE computer_id = ? AND status IN ('scheduled', 'active') FOR UPDATE",
      [computerId]
    );
    if (existingSessions.length > 0) {
      await conn.rollback();
      throw httpError(409, `Computer ${pc.pc_code} already has an ongoing or scheduled exam session.`);
    }

    // 3. Verify student does not already have an active/scheduled session
    const [studentSessions] = await conn.query(
      "SELECT id, computer_id FROM exam_sessions WHERE student_id = ? AND status IN ('scheduled', 'active')",
      [studentId]
    );
    if (studentSessions.length > 0) {
      await conn.rollback();
      throw httpError(409, `Student #${studentId} already has an active or scheduled exam session on PC #${studentSessions[0].computer_id}.`);
    }

    // 4. Critical Section: Insert session and set computer status = 'allocated'
    let sessionId;
    try {
      const [res] = await conn.query(
        `INSERT INTO exam_sessions
         (computer_id, student_id, drive_id, status, exam_window_keyword, starts_at, ends_at, created_by)
         VALUES (?, ?, ?, 'scheduled', ?, NOW(), ?, ?)`,
        [computerId, studentId, driveId, examWindowKeyword || 'CampusFlow', endsAt, createdBy]
      );
      sessionId = res.insertId;
    } catch (dbErr) {
      await conn.rollback();
      if (dbErr.code === 'ER_DUP_ENTRY') {
        throw httpError(409, `Computer ${pc.pc_code} was concurrently allocated to another session.`);
      }
      throw dbErr;
    }

    await conn.query("UPDATE computers SET status = 'allocated' WHERE id = ?", [computerId]);

    await conn.commit();

    // Fetch the enriched session record
    const [createdRows] = await conn.query(
      `SELECT es.*, c.pc_code, u.name AS student_name, s.roll_no, r.name AS lab_name
       FROM exam_sessions es
       JOIN computers c ON c.id = es.computer_id
       JOIN resources r ON r.id = c.resource_id
       JOIN users u ON u.id = es.student_id
       JOIN students s ON s.user_id = u.id
       WHERE es.id = ?`,
      [sessionId]
    );

    return createdRows[0];
  } catch (err) {
    try {
      await conn.rollback();
    } catch (_) {}
    throw err;
  } finally {
    conn.release();
    releaseLock();
  }
}

/**
 * Transitions a scheduled session to 'active'.
 */
async function startSession(sessionId, holderLabel = 'admin') {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [rows] = await conn.query(
      `SELECT es.*, c.pc_code, c.status AS pc_status
       FROM exam_sessions es
       JOIN computers c ON c.id = es.computer_id
       WHERE es.id = ? FOR UPDATE`,
      [sessionId]
    );

    const session = rows[0];
    if (!session) {
      await conn.rollback();
      throw httpError(404, `Exam session #${sessionId} not found.`);
    }

    if (session.status === 'active') {
      await conn.commit();
      return session; // already active
    }

    if (session.status === 'ended') {
      await conn.rollback();
      throw httpError(400, `Exam session #${sessionId} has already ended.`);
    }

    await conn.query(
      "UPDATE exam_sessions SET status = 'active', starts_at = NOW() WHERE id = ?",
      [sessionId]
    );
    await conn.query("UPDATE computers SET status = 'allocated' WHERE id = ?", [session.computer_id]);

    await conn.commit();

    const [updated] = await conn.query(
      `SELECT es.*, c.pc_code, u.name AS student_name
       FROM exam_sessions es
       JOIN computers c ON c.id = es.computer_id
       JOIN users u ON u.id = es.student_id
       WHERE es.id = ?`,
      [sessionId]
    );
    return updated[0];
  } catch (err) {
    try {
      await conn.rollback();
    } catch (_) {}
    throw err;
  } finally {
    conn.release();
  }
}

/**
 * Ends an exam session and frees the PC (releasing the resource back to 'available').
 */
async function endSession(sessionId, holderLabel = 'admin') {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [rows] = await conn.query(
      `SELECT es.*, c.pc_code, c.status AS pc_status
       FROM exam_sessions es
       JOIN computers c ON c.id = es.computer_id
       WHERE es.id = ? FOR UPDATE`,
      [sessionId]
    );

    const session = rows[0];
    if (!session) {
      await conn.rollback();
      throw httpError(404, `Exam session #${sessionId} not found.`);
    }

    if (session.status === 'ended') {
      await conn.commit();
      return session; // already ended
    }

    await conn.query(
      "UPDATE exam_sessions SET status = 'ended', ended_at = NOW() WHERE id = ?",
      [sessionId]
    );

    // Free the PC: status becomes available
    await conn.query("UPDATE computers SET status = 'available' WHERE id = ?", [session.computer_id]);

    await conn.commit();

    const [updated] = await conn.query(
      `SELECT es.*, c.pc_code, u.name AS student_name
       FROM exam_sessions es
       JOIN computers c ON c.id = es.computer_id
       JOIN users u ON u.id = es.student_id
       WHERE es.id = ?`,
      [sessionId]
    );
    return updated[0];
  } catch (err) {
    try {
      await conn.rollback();
    } catch (_) {}
    throw err;
  } finally {
    conn.release();
  }
}

/**
 * OS Placement Algorithm: FIRST FIT
 * Concept: Scans computers in a lab (or all labs) and picks the first available PC.
 */
async function firstFitAvailablePc(labId = null) {
  let sql = `
    SELECT c.id, c.resource_id, c.pc_code, c.enrollment_code, c.status, r.name AS lab_name
    FROM computers c
    JOIN resources r ON r.id = c.resource_id
    WHERE c.status = 'available'
  `;
  const params = [];
  if (labId) {
    sql += ' AND c.resource_id = ?';
    params.push(labId);
  }
  sql += ' ORDER BY c.resource_id ASC, c.pc_code ASC LIMIT 1';

  const [rows] = await pool.query(sql, params);
  return rows[0] || null;
}

/**
 * OS Placement Algorithm: BEST FIT
 * Concept: Finds the lab that has at least `requiredCount` available PCs,
 * but with the minimum excess capacity (smallest surplus).
 * This minimizes wasted fragmentation and leaves larger contiguous blocks
 * of available PCs intact in other labs.
 */
async function bestFitLab(requiredCount = 1) {
  const [rows] = await pool.query(
    `SELECT r.id AS lab_id, r.name AS lab_name, r.capacity,
            COUNT(c.id) AS total_pcs,
            SUM(CASE WHEN c.status = 'available' THEN 1 ELSE 0 END) AS available_pcs
     FROM resources r
     JOIN computers c ON c.resource_id = r.id
     WHERE r.type = 'lab' AND r.status = 'available'
     GROUP BY r.id, r.name, r.capacity
     HAVING available_pcs >= ?
     ORDER BY available_pcs ASC, r.capacity ASC
     LIMIT 1`,
    [requiredCount]
  );
  return rows[0] || null;
}

module.exports = {
  allocatePcToStudent,
  startSession,
  endSession,
  firstFitAvailablePc,
  bestFitLab,
  httpError,
};

