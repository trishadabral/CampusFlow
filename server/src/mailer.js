// Email sender (Phase 2) — optional, never load-bearing.
//
// Email is a nice-to-have on top of the in-app notification inbox: every
// message is saved as a notification first (notifyUser below), and email is
// only attempted afterwards. If SMTP is not configured, or sending fails,
// the request still succeeds — the user just sees the notification in-app.
//
// Configuration lives in server/.env (see .env.example): SMTP_HOST,
// SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM. No credential is hardcoded.

const nodemailer = require('nodemailer');

let transporter = null; // created lazily on first send, then reused

function isEmailConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

function getTransporter() {
  if (transporter) return transporter;
  if (!isEmailConfigured()) return null;
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: Number(process.env.SMTP_PORT || 587) === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  return transporter;
}

// Send one email. NEVER throws: returns { sent: true } on success and
// { sent: false, reason } when email is unconfigured or sending fails,
// so a mail problem can never crash the request that triggered it.
async function sendMail({ to, subject, text, html }) {
  const transport = getTransporter();
  if (!transport) {
    console.log('[mail] SMTP not configured — email skipped, in-app notification still saved');
    return { sent: false, reason: 'Email is not set up yet.' };
  }
  try {
    await transport.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to,
      subject,
      text,
      html,
    });
    return { sent: true };
  } catch (err) {
    console.error('[mail] send failed:', err.message);
    return { sent: false, reason: 'Email could not be sent right now.' };
  }
}

// Save the in-app notification AND try to email the same message.
// The notification row is always written first (same INSERT as
// os/pipeline.js notify()); email is best-effort and never throws.
// pool is the mysql2 pool (server/src/dbms/db.js).
async function notifyUser(pool, { userId, title, body, link, emailSubject, emailText }) {
  await pool.query(
    'INSERT INTO notifications (user_id, title, body, link) VALUES (?, ?, ?, ?)',
    [userId, title, body, link || null]
  );
  let email = null;
  try {
    const [rows] = await pool.query('SELECT email FROM users WHERE id = ?', [userId]);
    email = rows.length ? rows[0].email : null;
  } catch (err) {
    console.error('[mail] could not look up user email:', err.message);
  }
  if (!email) return { sent: false, reason: 'No email address on file.' };
  return sendMail({
    to: email,
    subject: emailSubject || title,
    text: emailText || body || title,
  });
}

module.exports = { isEmailConfigured, sendMail, notifyUser };
