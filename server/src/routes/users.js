// M1 — admin user directory.
const express = require('express');
const pool = require('../db');
const { authenticateToken, requireRole } = require('../middleware/auth');

const router = express.Router();

// GET /users — admin only
router.get('/', authenticateToken, requireRole('admin'), async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT u.id, u.name, u.email, u.role, u.created_at,
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

module.exports = router;
