// Scheduling Lab: simulate CPU scheduling algorithms on interviews.
const express = require('express');
const { simulate } = require('../lib/scheduler');

const router = express.Router();

// POST /schedule/simulate
router.post('/simulate', (req, res, next) => {
  try {
    const { algorithm, quantum, interviews } = req.body || {};
    if (!['fcfs', 'priority', 'rr'].includes(algorithm)) {
      return res.status(400).json({ error: 'Algorithm must be one of: fcfs, priority, rr.' });
    }
    if (!Array.isArray(interviews) || !interviews.length) {
      return res.status(400).json({ error: 'Provide a non-empty interviews array.' });
    }
    for (const p of interviews) {
      if (p.id == null || p.burst == null || Number(p.burst) <= 0) {
        return res
          .status(400)
          .json({ error: 'Every interview needs an id and a positive burst time.' });
      }
    }
    res.json(simulate(algorithm, interviews, quantum == null ? 4 : quantum));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
