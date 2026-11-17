// M1 — admin user directory.
const express = require('express');
const bcrypt = require('bcryptjs');
const pool = require('../dbms/db');
const { withTransaction } = require('../dbms/transactions');
const { authenticateToken, requireRole } = require('../middleware/auth');

const router = express.Router();

// GET /users — admin only
router.get('/', authenticateToken, requireRole('admin'), async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT u.id, u.name, u.email, u.role, u.is_active, u.created_at,
              s.roll_no, s.branch, s.cgpa
       FROM users u
       LEFT JOIN students s ON s.user_id = u.id
       ORDER BY u.created_at DESC`
    );
    res.json(
      rows.map((r) => ({
        id: r.id,
        name: r.name,
        email: r.email,
        role: r.role,
        is_active: !!r.is_active,
        roll_no: r.roll_no,
        branch: r.branch,
        cgpa: r.cgpa == null ? null : Number(r.cgpa),
        created_at: r.created_at,
      }))
    );
  } catch (err) {
    next(err);
  }
});

// POST /users — admin creates a recruiter or admin account. Students sign
// up themselves (POST /auth/register is student-only), so this is the only
// way to create staff accounts.
router.post('/', authenticateToken, requireRole('admin'), async (req, res, next) => {
  try {
    const { name, email, password, role } = req.body || {};
    if (!name || !email || !password || !role) {
      return res.status(400).json({ error: 'Name, email, password and role are required.' });
    }
    if (!['recruiter', 'admin'].includes(role)) {
      return res.status(400).json({ error: 'Role must be recruiter or admin.' });
    }

    const [dup] = await pool.query('SELECT id FROM users WHERE email = ?', [email]);
    if (dup.length) {
      return res.status(409).json({ error: 'This email is already registered.' });
    }

    const hash = await bcrypt.hash(password, 10);
    const [result] = await pool.query(
      'INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)',
      [name, email, hash, role]
    );

    res.status(201).json({
      user: { id: result.insertId, name, email, role },
    });
  } catch (err) {
    next(err);
  }
});

// PATCH /users/:id/active — deactivate or reactivate an account.
// Deactivated accounts cannot log in (see middleware/auth.js).
// withTransaction takes (work, actorId); answer only after the
// transaction callback returns, never from inside it.
router.patch('/:id/active', authenticateToken, requireRole('admin'), async (req, res, next) => {
  try {
    const targetId = Number(req.params.id);
    const { is_active } = req.body || {};
    if (typeof is_active !== 'boolean') {
      return res.status(400).json({ error: '`is_active` must be a boolean.' });
    }
    if (req.user.id === targetId && is_active === false) {
      return res.status(409).json({ error: 'You cannot deactivate your own account.' });
    }

    await withTransaction(async (conn) => {
      const [target] = await conn.query('SELECT role FROM users WHERE id = ?', [targetId]);
      if (!target.length) {
        const e = new Error('User not found.');
        e.status = 404;
        throw e;
      }
      if (target[0].role === 'admin' && is_active === false) {
        const [admins] = await conn.query(
          'SELECT COUNT(*) AS cnt FROM users WHERE role = "admin" AND is_active = 1 AND id <> ?',
          [targetId]
        );
        if (admins[0].cnt === 0) {
          const e = new Error('Cannot deactivate the last active admin.');
          e.status = 409;
          throw e;
        }
      }
      const [upd] = await conn.query('UPDATE users SET is_active = ? WHERE id = ?', [
        is_active ? 1 : 0,
        targetId,
      ]);
      if (upd.affectedRows === 0) {
        const e = new Error('User not found.');
        e.status = 404;
        throw e;
      }
      await conn.query(
        'INSERT INTO audit_log (action, entity, entity_id, details) VALUES (?, ?, ?, ?)',
        [
          is_active ? 'user.activate' : 'user.deactivate',
          'user',
          targetId,
          JSON.stringify({ by: req.user.id }),
        ]
      );
    });

    res.json({ success: true, id: targetId, is_active });
  } catch (err) {
    next(err);
  }
});

// POST /users/:id/reset-password — admin sets a fresh temporary password
// for a user and gets it back once, to pass on out-of-band.
router.post('/:id/reset-password', authenticateToken, requireRole('admin'), async (req, res, next) => {
  try {
    const targetId = Number(req.params.id);
    const tempPassword = Math.random().toString(36).slice(-10) + 'A1!';
    const hash = await bcrypt.hash(tempPassword, 10);

    await withTransaction(async (conn) => {
      const [upd] = await conn.query('UPDATE users SET password_hash = ? WHERE id = ?', [hash, targetId]);
      if (upd.affectedRows === 0) {
        const e = new Error('User not found.');
        e.status = 404;
        throw e;
      }
      await conn.query(
        'INSERT INTO audit_log (action, entity, entity_id, details) VALUES (?, ?, ?, ?)',
        ['user.reset_password', 'user', targetId, JSON.stringify({ by: req.user.id })]
      );
    });

    res.json({ success: true, id: targetId, temporary_password: tempPassword });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
