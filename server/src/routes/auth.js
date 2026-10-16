// Auth routes: register, login, me.
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../dbms/db');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();
const VALID_ROLES = ['student', 'recruiter', 'admin'];

function signToken(user) {
  return jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET || 'change-me', {
    expiresIn: '8h',
  });
}

function publicUser(row) {
  return { id: row.id, name: row.name, email: row.email, role: row.role };
}

// POST /auth/register
router.post('/register', async (req, res, next) => {
  try {
    const { name, email, password, role, roll_no, branch, cgpa, backlogs, graduation_year } =
      req.body || {};
    if (!name || !email || !password || !role) {
      return res.status(400).json({ error: 'Name, email, password and role are required.' });
    }
    if (!VALID_ROLES.includes(role)) {
      return res.status(400).json({ error: 'Role must be one of: student, recruiter, admin.' });
    }
    if (role === 'student' && (!roll_no || !branch || cgpa == null || !graduation_year)) {
      return res
        .status(400)
        .json({ error: 'Students must also provide roll_no, branch, cgpa and graduation_year.' });
    }

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [dup] = await conn.query('SELECT id FROM users WHERE email = ?', [email]);
      if (dup.length) {
        const err = new Error('This email is already registered.');
        err.status = 409;
        throw err;
      }
      const hash = await bcrypt.hash(password, 10);
      const [uRes] = await conn.query(
        'INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)',
        [name, email, hash, role]
      );
      if (role === 'student') {
        await conn.query(
          'INSERT INTO students (user_id, roll_no, branch, cgpa, backlogs, graduation_year) VALUES (?, ?, ?, ?, ?, ?)',
          [uRes.insertId, roll_no, branch, cgpa, backlogs || 0, graduation_year]
        );
      }
      await conn.commit();
      const user = { id: uRes.insertId, name, email, role };
      res.status(201).json({ token: signToken(user), user });
    } catch (err) {
      try {
        await conn.rollback();
      } catch (_) {}
      if (err.code === 'ER_DUP_ENTRY') {
        err.status = 409;
        err.message = 'This email or roll number is already registered.';
      }
      throw err;
    } finally {
      conn.release();
    }
  } catch (err) {
    next(err);
  }
});

// POST /auth/login
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }
    const [rows] = await pool.query(
      'SELECT id, name, email, role, password_hash FROM users WHERE email = ?',
      [email]
    );
    const row = rows[0];
    const ok = row && (await bcrypt.compare(password, row.password_hash));
    if (!ok) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }
    const user = publicUser(row);
    res.json({ token: signToken(user), user });
  } catch (err) {
    next(err);
  }
});

// GET /auth/me
router.get('/me', authenticateToken, (req, res) => {
  res.json({ user: publicUser(req.user) });
});

module.exports = router;
