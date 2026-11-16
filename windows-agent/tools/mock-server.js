#!/usr/bin/env node
// windows-agent/tools/mock-server.js
// Lightweight standalone Node.js mock backend for CampusFlow Windows Agent verification.
// Zero external dependencies. Implements registration, heartbeats, events, and session control.

const http = require('http');
const crypto = require('crypto');
const readline = require('readline');

const PORT = process.env.PORT || 5000;

let mockSession = {
  is_active: false,
  session_id: 101,
  student_name: 'Mock Student (Aarav Sharma)',
  exam_window_keyword: 'Notepad',
  ends_at: new Date(Date.now() + 3600000).toISOString(),
};

let mockProhibited = ['calc.exe', 'calculatorapp.exe', 'discord.exe', 'anydesk.exe', 'teamviewer.exe'];
let registeredToken = null;
let receivedEvents = [];

function jsonResponse(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

const server = http.createServer((req, res) => {
  const url = req.url;
  const method = req.method;

  let body = '';
  req.on('data', (chunk) => {
    body += chunk;
  });

  req.on('end', () => {
    let parsedBody = {};
    if (body) {
      try {
        parsedBody = JSON.parse(body);
      } catch (e) {
        return jsonResponse(res, 400, { error: 'Invalid JSON payload' });
      }
    }

    // 1. POST /api/agent/register
    if (method === 'POST' && url === '/api/agent/register') {
      const { enrollment_code, hostname, agent_version } = parsedBody;
      if (!enrollment_code) {
        return jsonResponse(res, 400, { error: 'enrollment_code required' });
      }

      registeredToken = 'mock-token-' + crypto.randomBytes(16).toString('hex');
      console.log(`\n[MOCK SERVER] Registered machine "${hostname || 'unknown'}" (code: ${enrollment_code})`);
      console.log(`[MOCK SERVER] Issued Agent Token: ${registeredToken}`);

      return jsonResponse(res, 200, {
        agent_token: registeredToken,
        computer: { id: 99, pc_code: 'MOCK-LAB-PC99' },
      });
    }

    // 2. POST /api/agent/heartbeat
    if (method === 'POST' && url === '/api/agent/heartbeat') {
      const authHeader = req.headers['authorization'] || '';
      if (!authHeader.startsWith('Bearer ')) {
        return jsonResponse(res, 401, { error: 'Unauthorized: missing Bearer token' });
      }

      const { foreground_title, foreground_process } = parsedBody;
      process.stdout.write(`\r[MOCK HB] Title: "${foreground_title || ''}" | Proc: "${foreground_process || ''}" | Session: ${mockSession.is_active ? 'ACTIVE (' + mockSession.exam_window_keyword + ')' : 'IDLE'}   `);

      return jsonResponse(res, 200, {
        server_time: new Date().toISOString(),
        session: mockSession.is_active
          ? {
              session_id: mockSession.session_id,
              student_name: mockSession.student_name,
              exam_window_keyword: mockSession.exam_window_keyword,
              ends_at: mockSession.ends_at,
            }
          : null,
        prohibited_processes: mockProhibited,
      });
    }

    // 3. POST /api/agent/events
    if (method === 'POST' && url === '/api/agent/events') {
      const authHeader = req.headers['authorization'] || '';
      if (!authHeader.startsWith('Bearer ')) {
        return jsonResponse(res, 401, { error: 'Unauthorized' });
      }

      const events = parsedBody.events || [];
      console.log(`\n\n[MOCK EVENT INCOMING] Received batch of ${events.length} telemetry events:`);
      for (const ev of events) {
        receivedEvents.push(ev);
        console.log(`  -> TYPE: [${ev.event_type}] | PROC: [${ev.process_name}] | TITLE: "${ev.window_title}" | AT: ${ev.occurred_at}`);
      }

      return jsonResponse(res, 200, { accepted: events.length });
    }

    // 4. GET /mock/status (for automated test scripts)
    if (method === 'GET' && url === '/mock/status') {
      return jsonResponse(res, 200, {
        session: mockSession,
        prohibited: mockProhibited,
        events: receivedEvents,
      });
    }

    // 5. POST /mock/toggle-session
    if (method === 'POST' && url === '/mock/toggle-session') {
      mockSession.is_active = !mockSession.is_active;
      if (parsedBody.keyword) mockSession.exam_window_keyword = parsedBody.keyword;
      console.log(`\n[MOCK SERVER] Session toggled to: ${mockSession.is_active ? 'ACTIVE (keyword: ' + mockSession.exam_window_keyword + ')' : 'IDLE'}`);
      return jsonResponse(res, 200, mockSession);
    }

    // Fallback 404
    jsonResponse(res, 404, { error: 'Route not found' });
  });
});

server.listen(PORT, () => {
  console.log(`================================================================`);
  console.log(`CampusFlow Windows Agent Mock Server listening on http://localhost:${PORT}`);
  console.log(`Commands:`);
  console.log(`  [s] Toggle exam session active/idle`);
  console.log(`  [k <keyword>] Set exam window keyword (current: "${mockSession.exam_window_keyword}")`);
  console.log(`  [p <proc>] Add prohibited process (e.g. p calc.exe)`);
  console.log(`  [c] Clear received events list`);
  console.log(`  [q] Quit server`);
  console.log(`================================================================\n`);
});

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
rl.on('line', (line) => {
  const input = line.trim();
  if (input === 's') {
    mockSession.is_active = !mockSession.is_active;
    console.log(`\n>>> Exam session is now: ${mockSession.is_active ? 'ACTIVE (keyword: ' + mockSession.exam_window_keyword + ')' : 'IDLE'}`);
  } else if (input.startsWith('k ')) {
    mockSession.exam_window_keyword = input.slice(2).trim();
    console.log(`\n>>> Exam window keyword set to: "${mockSession.exam_window_keyword}"`);
  } else if (input.startsWith('p ')) {
    const proc = input.slice(2).trim().toLowerCase();
    mockProhibited.push(proc);
    console.log(`\n>>> Added "${proc}" to prohibited processes list.`);
  } else if (input === 'c') {
    receivedEvents = [];
    console.log('\n>>> Cleared events cache.');
  } else if (input === 'q') {
    process.exit(0);
  }
});

