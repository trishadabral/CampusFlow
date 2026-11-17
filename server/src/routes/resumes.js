// Resume access control route: GET /api/resumes/:studentId
// Allows download ONLY if caller is:
// (a) the student themselves,
// (b) an admin,
// (c) a recruiter whose company has a drive the student applied to.
// Any other caller receives 403 Forbidden.
//
// Resumes are stored as base64 in students.resume_data (no file
// storage), so the file is served from the database instead of read
// from disk.

const express = require('express');
const pool = require('../dbms/db');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

router.get('/:studentId', authenticateToken, async (req, res, next) => {
  try {
    const targetStudentId = parseInt(req.params.studentId, 10);
    if (!targetStudentId || isNaN(targetStudentId)) {
      return res.status(400).json({ error: 'Invalid student ID.' });
    }

    const isSelf = req.user.id === targetStudentId;
    const isAdmin = req.user.role === 'admin';

    let isAuthorizedRecruiter = false;
    if (req.user.role === 'recruiter') {
      const [authRows] = await pool.query(
        `SELECT 1 FROM applications a
         JOIN drives d ON d.id = a.drive_id
         WHERE a.student_id = ?
           AND (d.company_id = ? OR d.created_by = ?)
         LIMIT 1`,
        [targetStudentId, req.user.company_id || -1, req.user.id]
      );
      if (authRows.length > 0) {
        isAuthorizedRecruiter = true;
      }
    }

    if (!isSelf && !isAdmin && !isAuthorizedRecruiter) {
      return res.status(403).json({ error: 'You are not authorized to access this resume.' });
    }

    const [studentRows] = await pool.query(
      'SELECT resume_data, resume_filename FROM students WHERE user_id = ?',
      [targetStudentId]
    );

    if (studentRows.length === 0 || !studentRows[0].resume_data) {
      return res.status(404).json({ error: 'No resume found for this student.' });
    }

    const filename = studentRows[0].resume_filename || 'resume.pdf';
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename.replace(/"/g, '')}"`);
    res.send(Buffer.from(studentRows[0].resume_data, 'base64'));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
