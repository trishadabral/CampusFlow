// Live updates (Phase 2) — Server-Sent Events, no new dependencies.
//
// Why SSE and not websockets or polling: updates here are one-way
// (server → browser: "your result is out", "a new drive opened"), the
// browser already speaks HTTP, and EventSource reconnects by itself.
// Polling would hammer the server every few seconds for mostly silence;
// websockets would add a library and a second protocol for traffic that
// only ever flows one way.
//
// Two ways to use the hub:
//   * publish(event, data) — notify in-process subscribers AND every
//     connected browser (later waves call this after saving something).
//   * broadcast(event, data) — push to every connected browser only.
// Payloads must be JSON-serializable. Nothing is persisted here: if a
// browser is offline it misses the push and catches up from the API.

const { EventEmitter } = require('events');

const hub = new EventEmitter();
const clients = new Set();

// One SSE frame: `data: {"type": "...", "data": {...}}\n\n`
// (no `event:` line, so the browser's default onmessage handler fires and
// client/src/realtime.js just parses the JSON).
function sendFrame(res, type, data) {
  res.write(`data: ${JSON.stringify({ type, data: data ?? null })}\n\n`);
}

function publish(event, data) {
  hub.emit(event, data);
  broadcast(event, data);
}

function broadcast(event, data) {
  for (const res of clients) {
    try {
      sendFrame(res, event, data);
    } catch (err) {
      // A dead client is cleaned up by its 'close' handler; never let a
      // broken socket break the publish for everyone else.
      console.error('[live] failed to send to a client:', err.message);
    }
  }
}

// Express handler for GET /api/events (mounted in src/index.js).
// Sends a `connected` frame straight away, then a heartbeat comment every
// 25s so proxies don't close the idle connection. Removes the client when
// the browser disconnects.
function sseHandler(req, res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write(': connected\n\n');
  sendFrame(res, 'connected', { user: req.user ? req.user.email : null });
  clients.add(res);

  const heartbeat = setInterval(() => {
    try {
      res.write(': heartbeat\n\n');
    } catch (err) {
      clearInterval(heartbeat);
    }
  }, 25000);

  req.on('close', () => {
    clearInterval(heartbeat);
    clients.delete(res);
  });
}

module.exports = { hub, publish, broadcast, sseHandler };
