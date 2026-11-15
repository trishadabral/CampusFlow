// Live updates — browser side (Phase 2).
//
// Opens a Server-Sent Events stream to GET /api/events. EventSource can't
// send an Authorization header, so the login token goes in the URL instead
// (?token=...); the server verifies it the same way as a Bearer token.
// The token lives in localStorage under 'campusflow_token' (see
// client/src/api.js and client/src/auth.jsx).
//
// Usage (later waves wire this into App.jsx):
//   const live = connectLive(({ type, data }) => { ... });
//   // ... and when the page unmounts / the user logs out:
//   live?.close();
//
// If the connection drops, EventSource reconnects by itself — nothing to
// do here. If there is no token (not logged in), returns null.

export function connectLive(onEvent) {
  const token = localStorage.getItem('campusflow_token');
  if (!token) return null;

  const source = new EventSource(`/api/events?token=${encodeURIComponent(token)}`);

  source.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);
      if (msg && msg.type) onEvent({ type: msg.type, data: msg.data ?? null });
    } catch (err) {
      // A malformed frame is skipped, not fatal — the stream stays open.
      console.error('[live] could not read an update:', err.message);
    }
  };

  source.onerror = () => {
    // EventSource reconnects automatically; log once so a dead server
    // is visible in the console instead of failing silently.
    if (source.readyState === EventSource.CLOSED) {
      console.error('[live] updates connection closed.');
    }
  };

  return source;
}

export default connectLive;
