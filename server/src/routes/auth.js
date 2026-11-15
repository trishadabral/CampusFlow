// Auth routes: register, login, me.
const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../dbms/db');
const { sendMail } = require('../mailer');
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

// Always the same reply, whether or not the email is registered —
// the response must never reveal which emails have an account.
const FORGOT_REPLY = 'If an account exists for that email, a reset link has been sent.';

// POST /auth/forgot-password { email }
// If the email belongs to a user, store a random one-hour token and email a
// reset link. Email is best-effort (sendMail never throws): if SMTP is not
// set up, the endpoint still returns success.
router.post('/forgot-password', async (req, res, next) => {
  try {
    const { email } = req.body || {};
    if (!email) {
      return res.status(400).json({ error: 'Please enter your email address.' });
    }
    const [rows] = await pool.query('SELECT id, name FROM users WHERE email = ?', [email]);
    const user = rows[0];
    if (user) {
      const token = crypto.randomBytes(32).toString('hex');
      const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
      await pool.query(
        'UPDATE users SET reset_token = ?, reset_token_expires = ? WHERE id = ?',
        [token, expires, user.id]
      );
      const appUrl = (process.env.APP_URL || 'http://localhost:5173').replace(/\/$/, '');
      const link = `${appUrl}/reset-password?token=${token}`;
      await sendMail({
        to: email,
        subject: 'Reset your CampusFlow password',
        text:
          `Hi ${user.name},\n\n` +
          `Someone asked to reset the password for this CampusFlow account. ` +
          `Use the link below to choose a new password. The link works for 1 hour and can only be used once.\n\n` +
          `${link}\n\n` +
          `If you did not ask for this, just ignore this email — your password stays the same.`,
      });
    }
    res.json({ message: FORGOT_REPLY });
  } catch (err) {
    next(err);
  }
});

// POST /auth/reset-password { token, password }
// The token is single-use: it is cleared as soon as the password changes,
// and it stops working after 1 hour.
router.post('/reset-password', async (req, res, next) => {
  try {
    const { token, password } = req.body || {};
    if (!token || !password) {
      return res.status(400).json({ error: 'A reset link and a new password are required.' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'Your new password must be at least 8 characters long.' });
    }
    const [rows] = await pool.query(
      'SELECT id, reset_token_expires FROM users WHERE reset_token = ?',
      [token]
    );
    const user = rows[0];
    if (!user) {
      return res.status(400).json({
        error: 'This reset link is not valid. Please request a new one from the login page.',
      });
    }
    if (!user.reset_token_expires || new Date(user.reset_token_expires).getTime() <= Date.now()) {
      return res.status(400).json({
        error: 'This reset link has expired. Please request a new one from the login page.',
      });
    }
    const hash = await bcrypt.hash(password, 10);
    await pool.query(
      'UPDATE users SET password_hash = ?, reset_token = NULL, reset_token_expires = NULL WHERE id = ?',
      [hash, user.id]
    );
    res.json({ message: 'Your password has been changed. You can now log in with your new password.' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
