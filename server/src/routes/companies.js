// Company routes.
const express = require('express');
const pool = require('../db');
const { authenticateToken, requireRole } = require('../middleware/auth');

const router = express.Router();

// GET /companies — list all companies
router.get('/', async (req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT id, name, website, sector FROM companies ORDER BY name');
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// POST /companies — recruiter/admin creates a company
router.post('/', authenticateToken, requireRole('recruiter', 'admin'), async (req, res, next) => {
  try {
    const { name, website, sector } = req.body || {};
    if (!name) {
      return res.status(400).json({ error: 'Company name is required.' });
    }
    const [result] = await pool.query(
      'INSERT INTO companies (name, website, sector) VALUES (?, ?, ?)',
      [name, website || null, sector || null]
    );
    const [rows] = await pool.query('SELECT id, name, website, sector FROM companies WHERE id = ?', [
      result.insertId,
    ]);
    res.status(201).json({ company: rows[0] });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
