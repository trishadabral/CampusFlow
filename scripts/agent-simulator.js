#!/usr/bin/env node
// scripts/agent-simulator.js
// Node.js simulation of the Windows C++ Exam Monitoring Agent.
// Uses native Node.js APIs (Node >= 18 native fetch), zero external npm dependencies.
//
// Usage:
//   node scripts/agent-simulator.js <enrollment_code> [options]
//
// Options:
//   --api <url>       Base API URL (default: http://localhost:5000/api)
//   --events          Emit test violation events when an active session is detected
//   --title <title>   Initial foreground window title
//   --process <proc>  Initial foreground process name
//   --exitAfter <sec> Exit automatically after N seconds (useful for testing sweeper timeout)

const args = process.argv.slice(2);
let enrollmentCode = null;
let apiUrl = process.env.API_URL || 'http://localhost:5000/api';
let emitEventsFlag = false;
let foregroundTitle = 'CampusFlow Exam Browser';
let foregroundProcess = 'campusflow.exe';
let exitAfterSec = 0;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--api' && args[i + 1]) {
    apiUrl = args[++i];
  } else if (args[i] === '--events') {
    emitEventsFlag = true;
  } else if (args[i] === '--title' && args[i + 1]) {
    foregroundTitle = args[++i];
  } else if (args[i] === '--process' && args[i + 1]) {
    foregroundProcess = args[++i];
  } else if (args[i] === '--exitAfter' && args[i + 1]) {
    exitAfterSec = Number(args[++i]);
  } else if (!enrollmentCode && !args[i].startsWith('--')) {
    enrollmentCode = args[i];
  }
}

if (!enrollmentCode) {
  console.error('Error: enrollment_code is required.');
  console.error('Usage: node scripts/agent-simulator.js <ENROLLMENT_CODE> [--api <url>] [--events] [--exitAfter <seconds>]');
  process.exit(1);
}

let agentToken = null;
let computerInfo = null;
let heartbeatTimer = null;
let eventsEmitted = false;

async function register() {
  console.log(`[Simulator] Registering with enrollment code: ${enrollmentCode} at ${apiUrl}/agent/register ...`);
  const res = await fetch(`${apiUrl}/agent/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      enrollment_code: enrollmentCode,
      hostname: `WIN11-SIM-${Math.floor(Math.random() * 9000 + 1000)}`,
      agent_version: '1.0.0-sim',
    }),
  });

  const body = await res.json();
  if (!res.ok) {
    throw new Error(`Registration failed (${res.status}): ${body.error || JSON.stringify(body)}`);
  }

  agentToken = body.agent_token;
  computerInfo = body.computer;
  console.log(`[Simulator] Enrolled successfully! Computer: ${computerInfo.pc_code} (ID: ${computerInfo.id})`);
  console.log(`[Simulator] Agent Bearer Token issued (length: ${agentToken.length})`);
}

async function sendHeartbeat() {
  try {
    const res = await fetch(`${apiUrl}/agent/heartbeat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${agentToken}`,
      },
      body: JSON.stringify({
        foreground_title: foregroundTitle,
        foreground_process: foregroundProcess,
      }),
    });

    const body = await res.json();
    if (!res.ok) {
      console.error(`[Simulator] Heartbeat error (${res.status}):`, body.error);
      return;
    }

    const sessionText = body.session
      ? `ACTIVE [Session #${body.session.session_id}, Student: ${body.session.student_name}, Keyword: "${body.session.exam_window_keyword}"]`
      : 'IDLE (No active session)';

    console.log(`[Simulator Heartbeat] Server time: ${body.server_time} | Status: ${sessionText}`);

    // If active session is detected and --events requested, emit sample telemetry events once
    if (body.session && emitEventsFlag && !eventsEmitted) {
      eventsEmitted = true;
      console.log('[Simulator] Emitting sample telemetry violation events for active session...');
      await emitSampleEvents();
    }
  } catch (err) {
    console.error('[Simulator] Heartbeat network error:', err.message);
  }
}

async function emitSampleEvents() {
  try {
    const samplePayload = {
      events: [
        {
          event_type: 'FOCUS_LOST',
          window_title: 'Discord - #general',
          process_name: 'discord.exe',
          occurred_at: new Date(Date.now() - 2000).toISOString(),
        },
        {
          event_type: 'PROHIBITED_PROCESS',
          window_title: 'Discord',
          process_name: 'discord.exe',
          occurred_at: new Date(Date.now() - 1000).toISOString(),
        },
        {
          event_type: 'WINDOW_SWITCH',
          window_title: 'Google Chrome - Stack Overflow',
          process_name: 'chrome.exe',
          occurred_at: new Date().toISOString(),
        },
      ],
    };

    const res = await fetch(`${apiUrl}/agent/events`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${agentToken}`,
      },
      body: JSON.stringify(samplePayload),
    });

    const body = await res.json();
    if (!res.ok) {
      console.error(`[Simulator] Failed to emit events (${res.status}):`, body.error);
    } else {
      console.log(`[Simulator] Successfully reported ${body.accepted} telemetry events to server.`);
    }
  } catch (err) {
    console.error('[Simulator] Events network error:', err.message);
  }
}

async function main() {
  try {
    await register();

    // Initial heartbeat
    await sendHeartbeat();

    // 5-second interval heartbeat
    heartbeatTimer = setInterval(sendHeartbeat, 5000);

    if (exitAfterSec > 0) {
      console.log(`[Simulator] Scheduled to terminate after ${exitAfterSec} seconds.`);
      setTimeout(() => {
        console.log('[Simulator] Exiting as scheduled.');
        clearInterval(heartbeatTimer);
        process.exit(0);
      }, exitAfterSec * 1000);
    }
  } catch (err) {
    console.error('[Simulator Fatal]:', err.message);
    process.exit(1);
  }
}

process.on('SIGINT', () => {
  console.log('\n[Simulator] Stopping heartbeat simulation...');
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  process.exit(0);
});

main();

