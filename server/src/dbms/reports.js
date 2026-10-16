// DBMS — aggregate reporting queries.
//
// Every analytics screen in the app is powered by one of these functions:
// JOINs, GROUP BY, conditional COUNTs and the v_drive_report summary view.
// Routes call these and shape the JSON; this module owns the SQL, so the
// reporting logic can be explained, tested and viva-defended in one place.

const pool = require('./db');

// Placement report — one row per drive (from the v_drive_report view).
async function placementReport() {
  const [rows] = await pool.query('SELECT * FROM v_drive_report ORDER BY drive_id');
  return rows;
}

// Control Center overview — one row per drive: stage, funnel counts, readiness.
async function driveOverview() {
  const [rows] = await pool.query(
    `SELECT d.id, d.title, d.status, d.test_date, d.interview_date,
            d.num_interviewers, d.min_test_score, d.max_shortlist,
            c.name AS company_name,
            COUNT(DISTINCT a.id) AS applied,
            COUNT(DISTINCT tr.student_id) AS tests_taken,
            COUNT(DISTINCT CASE WHEN a.status IN ('shortlisted','selected') THEN a.id END) AS shortlisted,
            COUNT(DISTINCT CASE WHEN a.status = 'selected' THEN a.id END) AS selected,
            COUNT(DISTINCT CASE WHEN s.type = 'test' THEN s.id END) AS test_sessions,
            COUNT(DISTINCT CASE WHEN s.type = 'interview' THEN s.id END) AS interview_slots,
            (SELECT COUNT(*) FROM test_questions q WHERE q.drive_id = d.id) AS questions
     FROM drives d
     JOIN companies c ON c.id = d.company_id
     LEFT JOIN applications a ON a.drive_id = d.id
     LEFT JOIN test_results tr ON tr.drive_id = d.id
     LEFT JOIN slots s ON s.drive_id = d.id
     GROUP BY d.id
     ORDER BY d.application_deadline DESC`
  );
  return rows;
}

// Master schedule — every test & interview session across all drives.
async function masterSchedule() {
  const [rows] = await pool.query(
    `SELECT s.id, s.type, s.title, s.starts_at, s.ends_at, s.capacity, s.booked_count,
            d.id AS drive_id, d.title AS drive_title, c.name AS company_name,
            r.name AS venue, r.type AS venue_type
     FROM slots s
     JOIN drives d ON d.id = s.drive_id
     JOIN companies c ON c.id = d.company_id
     LEFT JOIN resources r ON r.id = s.resource_id
     ORDER BY s.starts_at`
  );
  return rows;
}

// Drive roster — every applicant with their session assignments and result.
async function driveRoster(driveId) {
  const [rows] = await pool.query(
    `SELECT u.name, u.email, s.roll_no, s.branch, s.cgpa,
            a.status, a.applied_at,
            tr.percentage AS test_percentage,
            ts.title AS test_session, ts.starts_at AS test_at, tr2.name AS test_venue,
            iv.title AS interview_slot, iv.starts_at AS interview_at, ir.name AS interview_venue
     FROM applications a
     JOIN students s ON s.user_id = a.student_id
     JOIN users u ON u.id = s.user_id
     LEFT JOIN test_results tr ON tr.drive_id = a.drive_id AND tr.student_id = a.student_id
     LEFT JOIN bookings bt ON bt.student_id = a.student_id AND bt.status = 'confirmed'
     LEFT JOIN slots ts ON ts.id = bt.slot_id AND ts.drive_id = a.drive_id AND ts.type = 'test'
     LEFT JOIN resources tr2 ON tr2.id = ts.resource_id
     LEFT JOIN bookings bi ON bi.student_id = a.student_id AND bi.status = 'confirmed'
     LEFT JOIN slots iv ON iv.id = bi.slot_id AND iv.drive_id = a.drive_id AND iv.type = 'interview'
     LEFT JOIN resources ir ON ir.id = iv.resource_id
     WHERE a.drive_id = ?
     GROUP BY a.id
     ORDER BY tr.percentage DESC, u.name`,
    [driveId]
  );
  return rows;
}

module.exports = { placementReport, driveOverview, masterSchedule, driveRoster };
