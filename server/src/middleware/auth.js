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
    .query('SELECT id, name, email, role, is_active FROM users WHERE id = ?', [payload.id])
    .then(([rows]) => {
      if (!rows.length) {
        return res.status(401).json({ error: 'This account no longer exists.' });
      }
      const user = rows[0];
      if (!user.is_active) {
        return res.status(401).json({ error: 'Your account is deactivated.' });
      }
      req.user = { id: user.id, name: user.name, email: user.email, role: user.role };
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
    .query('SELECT id, name, email, role, is_active FROM users WHERE id = ?', [payload.id])
    .then(([rows]) => {
      if (rows.length) {
        const user = rows[0];
        // A deactivated account stays anonymous on public routes.
        if (user.is_active) {
          req.user = { id: user.id, name: user.name, email: user.email, role: user.role };
        }
      }
      next();
    })
    .catch(next);
}

module.exports = { authenticateToken, requireRole, optionalAuth };
