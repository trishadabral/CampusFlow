// Offer letter detail — GET /api/offers/:offerId.
// Kept as its own router because the URL is not under /drives.
const express = require('express');
const pool = require('../dbms/db');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { notifyUser } = require('../mailer');

const router = express.Router();

// POST /api/offers/:offerId/respond — the student accepts or declines.
// Only the student the letter belongs to, and only while it is still
// pending: an answer is final (a second response is a 400, not a silent
// overwrite). The drive's recruiter gets a bell notification either way.
router.post(
  '/:offerId/respond',
  authenticateToken,
  requireRole('student'),
  async (req, res, next) => {
    try {
      const { decision } = req.body || {};
      if (!['accepted', 'declined'].includes(decision)) {
        return res.status(400).json({ error: 'Please choose accept or decline.' });
      }
      const [rows] = await pool.query(
        `SELECT o.id, o.drive_id, o.student_id, o.status,
                d.title AS drive_title, d.created_by AS recruiter_id,
                c.name AS company_name
         FROM offer_letters o
         JOIN drives d ON d.id = o.drive_id
         JOIN companies c ON c.id = d.company_id
         WHERE o.id = ?`,
        [req.params.offerId]
      );
      if (!rows.length) return res.status(404).json({ error: 'Offer letter not found.' });
      const offer = rows[0];
      if (offer.student_id !== req.user.id) {
        return res.status(403).json({ error: 'This offer was made to someone else.' });
      }
      if (offer.status !== 'pending') {
        return res.status(400).json({ error: `You already ${offer.status} this offer.` });
      }
      await pool.query(
        "UPDATE offer_letters SET status = ?, responded_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'pending'",
        [decision, offer.id]
      );
      const [uRows] = await pool.query('SELECT name FROM users WHERE id = ?', [req.user.id]);
      const studentName = uRows[0]?.name || 'A student';
      // The answer is already saved above; a notification problem must
      // never turn it into an error for the student.
      try {
        await notifyUser(pool, {
          userId: offer.recruiter_id,
          title: `${studentName} ${decision} the ${offer.company_name} offer`,
          body: `${studentName} ${decision} the offer for ${offer.drive_title} (${offer.company_name}).`,
          link: `/recruiter/drives/${offer.drive_id}`,
        });
      } catch (err) {
        console.error('[offers] could not notify recruiter of response:', err.message);
      }
      res.json({ ok: true, status: decision });
    } catch (err) {
      next(err);
    }
  }
);

router.get(
  '/:offerId',
  authenticateToken,
  requireRole('recruiter', 'admin'),
  async (req, res, next) => {
    try {
      const [rows] = await pool.query(
        `SELECT o.id, o.drive_id, o.student_id, o.package_lpa, o.joining_date,
                o.letter_text, o.generated_at, o.status, o.responded_at,
                u.name AS student_name, u.email AS student_email,
                d.title AS drive_title, d.package_lpa AS drive_package_lpa,
                c.name AS company_name
         FROM offer_letters o
         JOIN users u ON u.id = o.student_id
         JOIN drives d ON d.id = o.drive_id
         JOIN companies c ON c.id = d.company_id
         WHERE o.id = ?`,
        [req.params.offerId]
      );
      if (!rows.length) return res.status(404).json({ error: 'Offer letter not found.' });
      const [driveRows] = await pool.query('SELECT created_by FROM drives WHERE id = ?', [rows[0].drive_id]);
      if (req.user.role !== 'admin' && driveRows[0]?.created_by !== req.user.id) {
        return res.status(403).json({ error: 'Only the recruiter who created this drive (or an admin) can view this letter.' });
      }
      const r = rows[0];
      res.json({
        id: r.id,
        drive_id: r.drive_id,
        student: { id: r.student_id, name: r.student_name, email: r.student_email },
        company_name: r.company_name,
        drive_title: r.drive_title,
        package_lpa: r.package_lpa != null ? Number(r.package_lpa) : null,
        joining_date: r.joining_date,
        letter_text: r.letter_text,
        generated_at: r.generated_at,
        status: r.status,
        responded_at: r.responded_at,
      });
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
