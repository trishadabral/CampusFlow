// Agent API — /api/agent
// Dedicated protocol endpoints for Windows monitoring agents.
// Uses high-entropy SHA-256 token authentication (NEVER user JWTs).
// Only stores window titles and process names (no keystrokes, screenshots, clipboard).

const express = require('express');
const crypto = require('crypto');
const pool = require('../dbms/db');
const { emitAgentStatus, emitAgentEvent } = require('../socket');

const router = express.Router();

// Simple in-memory rate limiter for enrollment endpoint
const registerAttempts = new Map();
function rateLimitRegister(req, res, next) {
  const ip = req.ip || req.connection.remoteAddress || 'unknown';
  const now = Date.now();
  const windowMs = 60 * 1000;
  const maxAttempts = 15;

  const history = registerAttempts.get(ip) || [];
  const validHistory = history.filter((t) => now - t < windowMs);

  if (validHistory.length >= maxAttempts) {
    return res.status(429).json({ error: 'Too many registration attempts. Please try again later.' });
  }

  validHistory.push(now);
  registerAttempts.set(ip, validHistory);
  next();
}

/**
 * Agent Token Authentication Middleware.
 * Rejects non-agent tokens and regular user JWTs.
 */
async function authenticateAgentToken(req, res, next) {
  const header = req.headers['authorization'] || '';
  if (!header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Agent authentication required (Bearer token).' });
  }

  const rawToken = header.slice(7).trim();
  if (!rawToken) {
    return res.status(401).json({ error: 'Agent token missing.' });
  }

  // Lookup by SHA-256 hash
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

  try {
    const [rows] = await pool.query(
      `SELECT ad.id, ad.computer_id, ad.status, ad.hostname, ad.agent_version,
              c.pc_code, c.resource_id, c.status AS pc_status
       FROM agent_devices ad
       JOIN computers c ON c.id = ad.computer_id
       WHERE ad.token_hash = ?`,
      [tokenHash]
    );

    if (!rows.length) {
      return res.status(401).json({ error: 'Invalid or revoked agent token.' });
    }

    req.agentDevice = rows[0];
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/agent/register
 * Enrolls a new Windows machine using an administrator-issued enrollment code.
 * Issues a persistent random agent token (hashed with SHA-256 before storage).
 */
router.post('/register', rateLimitRegister, async (req, res, next) => {
  try {
    const { enrollment_code, hostname, agent_version } = req.body;
    if (!enrollment_code || typeof enrollment_code !== 'string') {
      return res.status(400).json({ error: 'Enrollment code is required.' });
    }

    const [pcs] = await pool.query(
      'SELECT id, pc_code, status FROM computers WHERE enrollment_code = ?',
      [enrollment_code.trim()]
    );

    if (!pcs.length) {
      return res.status(404).json({ error: 'Invalid enrollment code. Computer not found.' });
    }

    const computer = pcs[0];

    // Generate high-entropy bearer token
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

    // Upsert into agent_devices
    await pool.query(
      `INSERT INTO agent_devices
         (computer_id, token_hash, hostname, agent_version, status, last_heartbeat_at)
       VALUES (?, ?, ?, ?, 'online', NOW())
       ON DUPLICATE KEY UPDATE
         token_hash = VALUES(token_hash),
         hostname = VALUES(hostname),
         agent_version = VALUES(agent_version),
         status = 'online',
         last_heartbeat_at = NOW()`,
      [computer.id, tokenHash, hostname ? String(hostname).slice(0, 150) : null, agent_version ? String(agent_version).slice(0, 50) : '1.0.0']
    );

    emitAgentStatus({
      computer_id: computer.id,
      pc_code: computer.pc_code,
      status: 'online',
      hostname: hostname || null,
      agent_version: agent_version || '1.0.0',
    });

    res.json({
      agent_token: rawToken,
      computer: {
        id: computer.id,
        pc_code: computer.pc_code,
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/agent/heartbeat
 * Periodic health ping (every 5 s) sent by the agent.
 * Server is the authoritative source for session state & prohibited processes.
 */
router.post('/heartbeat', authenticateAgentToken, async (req, res, next) => {
  try {
    const { foreground_title, foreground_process } = req.body;
    const device = req.agentDevice;
    const wasOffline = device.status === 'offline';

    const safeTitle = foreground_title ? String(foreground_title).slice(0, 255) : null;
    const safeProc = foreground_process ? String(foreground_process).slice(0, 255) : null;

    // Update agent state
    await pool.query(
      `UPDATE agent_devices
       SET status = 'online',
           last_heartbeat_at = NOW(),
           last_foreground_title = ?,
           last_foreground_process = ?
       WHERE id = ?`,
      [safeTitle, safeProc, device.id]
    );

    // Look for active exam session on this PC
    const [sessions] = await pool.query(
      `SELECT es.id AS session_id, es.exam_window_keyword, es.ends_at, es.status,
              u.name AS student_name
       FROM exam_sessions es
       JOIN users u ON u.id = es.student_id
       WHERE es.computer_id = ? AND es.status = 'active'
       LIMIT 1`,
      [device.computer_id]
    );

    const activeSession = sessions[0] || null;

    // If agent was offline and has now reconnected during an active session, log AGENT_RECONNECTED
    if (wasOffline) {
      if (activeSession) {
        const [evRes] = await pool.query(
          `INSERT INTO monitoring_events
           (exam_session_id, computer_id, event_type, window_title, process_name, occurred_at)
           VALUES (?, ?, 'AGENT_RECONNECTED', ?, ?, NOW(3))`,
          [activeSession.session_id, device.computer_id, safeTitle, safeProc]
        );
        emitAgentEvent({
          id: evRes.insertId,
          exam_session_id: activeSession.session_id,
          computer_id: device.computer_id,
          pc_code: device.pc_code,
          event_type: 'AGENT_RECONNECTED',
          window_title: safeTitle,
          process_name: safeProc,
          occurred_at: new Date().toISOString(),
          review_status: 'new',
        });
      }

      emitAgentStatus({
        computer_id: device.computer_id,
        pc_code: device.pc_code,
        status: 'online',
        last_foreground_title: safeTitle,
        last_foreground_process: safeProc,
      });
    }

    // Prohibited processes
    const [procs] = await pool.query(
      'SELECT process_name FROM prohibited_processes ORDER BY process_name ASC'
    );

    res.json({
      server_time: new Date().toISOString(),
      session: activeSession
        ? {
            session_id: activeSession.session_id,
            student_name: activeSession.student_name,
            exam_window_keyword: activeSession.exam_window_keyword,
            ends_at: activeSession.ends_at,
          }
        : null,
      prohibited_processes: procs.map((p) => p.process_name),
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/agent/events
 * Batched telemetry events from the agent.
 * Accepted ONLY while the computer has an ACTIVE exam session.
 */
router.post('/events', authenticateAgentToken, async (req, res, next) => {
  try {
    const device = req.agentDevice;
    const { events } = req.body;

    if (!Array.isArray(events) || events.length === 0) {
      return res.status(400).json({ error: 'Body must include a non-empty array of events.' });
    }

    if (events.length > 50) {
      return res.status(400).json({ error: 'Exceeded maximum batch limit of 50 events.' });
    }

    // Verify active session on this computer
    const [sessions] = await pool.query(
      "SELECT id FROM exam_sessions WHERE computer_id = ? AND status = 'active' LIMIT 1",
      [device.computer_id]
    );

    if (!sessions.length) {
      return res.status(400).json({
        error: 'Events rejected: this computer does not have an active exam session.',
      });
    }

    const sessionId = sessions[0].id;
    const ALLOWED_AGENT_EVENTS = [
      'FOCUS_LOST',
      'WINDOW_SWITCH',
      'WINDOW_MINIMIZED',
      'WINDOW_CLOSED',
      'PROHIBITED_PROCESS',
    ];

    let insertedCount = 0;
    for (const ev of events) {
      if (!ev || typeof ev !== 'object') continue;

      if (ev.event_type === 'AGENT_DISCONNECTED' || ev.event_type === 'AGENT_RECONNECTED') {
        return res.status(400).json({
          error: `Agents are not permitted to submit system event type: ${ev.event_type}.`,
        });
      }

      if (!ALLOWED_AGENT_EVENTS.includes(ev.event_type)) {
        return res.status(400).json({
          error: `Invalid event_type: ${ev.event_type}. Allowed: ${ALLOWED_AGENT_EVENTS.join(', ')}.`,
        });
      }

      const safeTitle = ev.window_title ? String(ev.window_title).slice(0, 255) : null;
      const safeProc = ev.process_name ? String(ev.process_name).slice(0, 255) : null;
      let occurredAt = ev.occurred_at ? new Date(ev.occurred_at) : new Date();
      if (isNaN(occurredAt.getTime())) occurredAt = new Date();

      const [insertRes] = await pool.query(
        `INSERT INTO monitoring_events
           (exam_session_id, computer_id, event_type, window_title, process_name, occurred_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [sessionId, device.computer_id, ev.event_type, safeTitle, safeProc, occurredAt]
      );

      insertedCount++;

      // Real-time broadcast to connected admins
      emitAgentEvent({
        id: insertRes.insertId,
        exam_session_id: sessionId,
        computer_id: device.computer_id,
        pc_code: device.pc_code,
        event_type: ev.event_type,
        window_title: safeTitle,
        process_name: safeProc,
        occurred_at: occurredAt.toISOString(),
        review_status: 'new',
      });
    }

    res.json({ accepted: insertedCount });
  } catch (err) {
    next(err);
  }
});

// ============================================================================
// Server-Side Sweeper
// Runs every 5 s: detects silent agent death (> 15 s missing heartbeat).
// Marks status = 'offline' and logs an AGENT_DISCONNECTED event if active session.
// ============================================================================
let sweeperInterval = null;

async function runSweeper() {
  try {
    const [offlineDevices] = await pool.query(
      `SELECT ad.id, ad.computer_id, c.pc_code, es.id AS active_session_id
       FROM agent_devices ad
       JOIN computers c ON c.id = ad.computer_id
       LEFT JOIN exam_sessions es ON es.computer_id = c.id AND es.status = 'active'
       WHERE ad.status = 'online'
         AND (ad.last_heartbeat_at IS NULL OR ad.last_heartbeat_at < NOW() - INTERVAL 15 SECOND)`
    );

    for (const d of offlineDevices) {
      await pool.query("UPDATE agent_devices SET status = 'offline' WHERE id = ?", [d.id]);

      if (d.active_session_id) {
        const [evRes] = await pool.query(
          `INSERT INTO monitoring_events
             (exam_session_id, computer_id, event_type, window_title, process_name, occurred_at)
           VALUES (?, ?, 'AGENT_DISCONNECTED', 'Heartbeat timeout (>15s)', 'agent_sweeper', NOW(3))`,
          [d.active_session_id, d.computer_id]
        );

        emitAgentEvent({
          id: evRes.insertId,
          exam_session_id: d.active_session_id,
          computer_id: d.computer_id,
          pc_code: d.pc_code,
          event_type: 'AGENT_DISCONNECTED',
          window_title: 'Heartbeat timeout (>15s)',
          process_name: 'agent_sweeper',
          occurred_at: new Date().toISOString(),
          review_status: 'new',
        });
      }

      emitAgentStatus({
        computer_id: d.computer_id,
        pc_code: d.pc_code,
        status: 'offline',
      });
    }
  } catch (err) {
    console.error('[agent-sweeper] error checking heartbeat timeouts:', err.message);
  }
}

function startSweeper() {
  if (!sweeperInterval) {
    sweeperInterval = setInterval(runSweeper, 5000);
    // Don't prevent process from exiting in test scripts
    if (sweeperInterval.unref) sweeperInterval.unref();
  }
}

function stopSweeper() {
  if (sweeperInterval) {
    clearInterval(sweeperInterval);
    sweeperInterval = null;
  }
}

module.exports = {
  router,
  startSweeper,
  stopSweeper,
  runSweeper,
  authenticateAgentToken,
};

