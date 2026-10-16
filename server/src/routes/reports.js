// Reports routes. SQL lives in dbms/reports.js; this route shapes the JSON.
const express = require('express');
const { placementReport } = require('../dbms/reports');

const router = express.Router();

// GET /reports/placement — one row per drive (from the v_drive_report view)
router.get('/placement', async (req, res, next) => {
  try {
    const rows = await placementReport();
    res.json(
      rows.map((r) => ({
        drive_id: r.drive_id,
        drive_title: r.drive_title,
        company: r.company,
        applied: Number(r.applied || 0),
        shortlisted: Number(r.shortlisted || 0),
        selected: Number(r.selected || 0),
        avg_cgpa_shortlisted:
          r.avg_cgpa_shortlisted == null ? null : Number(r.avg_cgpa_shortlisted),
      }))
    );
  } catch (err) {
    next(err);
  }
});

module.exports = router;
