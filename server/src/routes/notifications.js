// In-app notifications: the system tells students about test sessions,
// results and interview schedules. Students read them from the header bell.

const express = require('express');
const pool = require('../db');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

function shape(n) {
  return {
    id: n.id,
    title: n.title,
    body: n.body,
    link: n.link,
    is_read: !!n.is_read,
    created_at: n.created_at,
  };
}

// GET /notifications — newest first, unread count included
router.get('/', authenticateToken, async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 30',
      [req.user.id]
    );
    const unread = rows.filter((r) => !r.is_read).length;
    res.json({ unread, notifications: rows.map(shape) });
  } catch (err) {
    next(err);
  }
});

// POST /notifications/read-all
router.post('/read-all', authenticateToken, async (req, res, next) => {
  try {
    await pool.query('UPDATE notifications SET is_read = 1 WHERE user_id = ?', [req.user.id]);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// PATCH /notifications/:id/read
router.patch('/:id/read', authenticateToken, async (req, res, next) => {
  try {
    await pool.query('UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?', [
      req.params.id,
      req.user.id,
    ]);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
