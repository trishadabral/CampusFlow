// CampusFlow OS API — entry point.
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const pool = require('./dbms/db');
const { sseHandler } = require('./realtime');

const app = express();

app.use(cors());
// 10 MB so a base64 profile photo (~2 MB) or resume PDF (~5 MB) fits in
// one JSON request; the default 100 KB would reject them outright.
app.use(express.json({ limit: '10mb' }));

app.get('/api/health', (req, res) => res.json({ ok: true, service: 'campusflow-api' }));

// Live updates (Phase 2): Server-Sent Events. EventSource cannot send an
// Authorization header, so the token comes as ?token= instead — verified
// exactly like middleware/auth.js (same secret, same users lookup).
// Bearer-header auth everywhere else is untouched.
app.get('/api/events', async (req, res, next) => {
  const token = req.query.token;
  if (!token) {
    return res.status(401).json({ error: 'Authentication required. Please log in.' });
  }
  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET || 'change-me');
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token. Please log in again.' });
  }
  try {
    const [rows] = await pool.query('SELECT id, name, email, role FROM users WHERE id = ?', [
      payload.id,
    ]);
    if (!rows.length) {
      return res.status(401).json({ error: 'This account no longer exists.' });
    }
    req.user = rows[0];
    sseHandler(req, res);
  } catch (err) {
    next(err);
  }
});

app.use('/api/auth', require('./routes/auth'));
app.use('/api/companies', require('./routes/companies'));
app.use('/api/drives', require('./routes/drives'));
app.use('/api/offers', require('./routes/offers'));
app.use('/api/slots', require('./routes/slots'));
app.use('/api/bookings', require('./routes/bookings'));
// resources.js defines /resources and /allocations paths, so it mounts at /api.
app.use('/api', require('./routes/resources'));
app.use('/api/schedule', require('./routes/schedule'));
app.use('/api/monitor', require('./routes/monitor'));
app.use('/api/lab-agent', require('./routes/lab-agent'));
app.use('/api/reports', require('./routes/reports'));
app.use('/api/users', require('./routes/users'));
app.use('/api/student', require('./routes/student'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/admin/audit', require('./routes/audit'));

// 404 for unknown API routes
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Route not found.' });
});

// Central error handler — always human sentences, never stack traces.
app.use((err, req, res, _next) => {
  console.error('[api-error]', err.message);
  const status = err.status && Number.isInteger(err.status) ? err.status : 500;
  const body = {
    error: status === 500 ? 'Something went wrong on the server.' : err.message || 'Something went wrong.',
  };
  if (err.explanation) body.explanation = err.explanation;
  res.status(status).json(body);
});

const PORT = Number(process.env.PORT) || 5000;
app.listen(PORT, () => {
  console.log(`CampusFlow API listening on http://localhost:${PORT}/api`);
});

module.exports = app;
