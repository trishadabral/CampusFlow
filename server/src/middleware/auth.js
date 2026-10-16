// JWT authentication + role-based authorization.
const jwt = require('jsonwebtoken');
const pool = require('../dbms/db');

function authenticateToken(req, res, next) {
  const header = req.headers['authorization'] || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: 'Authentication required. Please log in.' });
  }
  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET || 'change-me');
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token. Please log in again.' });
  }
  pool
    .query('SELECT id, name, email, role FROM users WHERE id = ?', [payload.id])
    .then(([rows]) => {
      if (!rows.length) {
        return res.status(401).json({ error: 'This account no longer exists.' });
      }
      req.user = rows[0]; // {id, name, email, role}
      next();
    })
    .catch(next);
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res
        .status(403)
        .json({ error: 'You do not have permission to perform this action.' });
    }
    next();
  };
}

// Attaches req.user when a valid token is present, but never rejects.
// Used by public endpoints that personalize for logged-in users.
function optionalAuth(req, res, next) {
  const header = req.headers['authorization'] || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return next();
  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET || 'change-me');
  } catch (err) {
    return next(); // bad token on a public route: treat as anonymous
  }
  pool
    .query('SELECT id, name, email, role FROM users WHERE id = ?', [payload.id])
    .then(([rows]) => {
      if (rows.length) req.user = rows[0];
      next();
    })
    .catch(next);
}

module.exports = { authenticateToken, requireRole, optionalAuth };
