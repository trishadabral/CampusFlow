// CampusFlow OS API — entry point.
require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();

app.use(cors());
app.use(express.json());

app.get('/api/health', (req, res) => res.json({ ok: true, service: 'campusflow-api' }));

app.use('/api/auth', require('./routes/auth'));
app.use('/api/companies', require('./routes/companies'));
app.use('/api/drives', require('./routes/drives'));
app.use('/api/slots', require('./routes/slots'));
app.use('/api/bookings', require('./routes/bookings'));
// resources.js defines /resources and /allocations paths, so it mounts at /api.
app.use('/api', require('./routes/resources'));
app.use('/api/schedule', require('./routes/schedule'));
app.use('/api/monitor', require('./routes/monitor'));
app.use('/api/reports', require('./routes/reports'));
app.use('/api/users', require('./routes/users'));
app.use('/api/student', require('./routes/student'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/admin', require('./routes/admin'));

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
