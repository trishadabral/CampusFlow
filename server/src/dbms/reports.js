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
            ANY_VALUE(ts.title) AS test_session, ANY_VALUE(ts.starts_at) AS test_at, ANY_VALUE(tr2.name) AS test_venue,
            ANY_VALUE(iv.title) AS interview_slot, ANY_VALUE(iv.starts_at) AS interview_at, ANY_VALUE(ir.name) AS interview_venue
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

// Drive analytics (Phase 2, M2) — one function, three shapes of answer:
//   score_distribution: how many test-takers fell in each 20-point bucket
//   branch_shortlist:   per branch, applied / shortlisted / shortlist rate
//   funnel:             applied → test taken → shortlisted → selected
// The funnel reuses the conditional-COUNT pattern from driveOverview; the
// test-taken count comes from test_results (not application status, which
// is overwritten to shortlisted/rejected when results are published).
async function analytics(driveId) {
  const [[dist]] = await pool.query(
    `SELECT
       SUM(CASE WHEN percentage BETWEEN 0 AND 20 THEN 1 ELSE 0 END) AS b0_20,
       SUM(CASE WHEN percentage BETWEEN 21 AND 40 THEN 1 ELSE 0 END) AS b21_40,
       SUM(CASE WHEN percentage BETWEEN 41 AND 60 THEN 1 ELSE 0 END) AS b41_60,
       SUM(CASE WHEN percentage BETWEEN 61 AND 80 THEN 1 ELSE 0 END) AS b61_80,
       SUM(CASE WHEN percentage BETWEEN 81 AND 100 THEN 1 ELSE 0 END) AS b81_100
     FROM test_results WHERE drive_id = ?`,
    [driveId]
  );
  const [branches] = await pool.query(
    `SELECT s.branch,
            COUNT(*) AS applied,
            SUM(a.status IN ('shortlisted', 'selected')) AS shortlisted,
            ROUND(100 * SUM(a.status IN ('shortlisted', 'selected')) / COUNT(*), 1) AS shortlist_rate
     FROM applications a
     JOIN students s ON s.user_id = a.student_id
     WHERE a.drive_id = ?
     GROUP BY s.branch
     ORDER BY shortlist_rate DESC, s.branch`,
    [driveId]
  );
  const [[funnel]] = await pool.query(
    `SELECT COUNT(*) AS applied,
            COUNT(DISTINCT tr.student_id) AS test_taken,
            SUM(a.status IN ('shortlisted', 'selected')) AS shortlisted,
            SUM(a.status = 'selected') AS selected
     FROM applications a
     LEFT JOIN test_results tr
       ON tr.drive_id = a.drive_id AND tr.student_id = a.student_id
     WHERE a.drive_id = ?`,
    [driveId]
  );
  return {
    score_distribution: [
      { bucket: '0–20', count: Number(dist.b0_20 || 0) },
      { bucket: '21–40', count: Number(dist.b21_40 || 0) },
      { bucket: '41–60', count: Number(dist.b41_60 || 0) },
      { bucket: '61–80', count: Number(dist.b61_80 || 0) },
      { bucket: '81–100', count: Number(dist.b81_100 || 0) },
    ],
    branch_shortlist: branches.map((b) => ({
      branch: b.branch,
      applied: Number(b.applied || 0),
      shortlisted: Number(b.shortlisted || 0),
      shortlist_rate: b.shortlist_rate != null ? Number(b.shortlist_rate) : 0,
    })),
    funnel: {
      applied: Number(funnel.applied || 0),
      test_taken: Number(funnel.test_taken || 0),
      shortlisted: Number(funnel.shortlisted || 0),
      selected: Number(funnel.selected || 0),
    },
  };
}

// Placement statistics (Phase 2, M4) — year-wise placement, packages,
// top recruiters. One call, four queries:
//   by_year:        every graduation year — total students, how many were
//                   selected anywhere, placement %
//   avgByYear:      average offered package per year (offers only)
//   overall:        average offered package across all years
//   top_recruiters: companies ordered by students placed
// Placement % = selected students ÷ all students of that year. It counts
// STUDENTS, not applications: a student placed through any drive counts
// once (COUNT DISTINCT), and a student with three applications still
// counts once in the total (COUNT DISTINCT s.user_id — a plain COUNT(*)
// would count their joined application rows instead).
// Average package only counts offer letters with a package filled in;
// with no offers yet every average comes back null, never NaN.
async function placementStats() {
  const [byYear] = await pool.query(
    `SELECT s.graduation_year,
            COUNT(DISTINCT s.user_id) AS total_students,
            COUNT(DISTINCT CASE WHEN a.status = 'selected' THEN a.student_id END) AS selected,
            ROUND(100 * COUNT(DISTINCT CASE WHEN a.status = 'selected' THEN a.student_id END)
                  / NULLIF(COUNT(DISTINCT s.user_id), 0), 1) AS placement_pct
     FROM students s
     LEFT JOIN applications a ON a.student_id = s.user_id
     GROUP BY s.graduation_year
     ORDER BY s.graduation_year DESC`
  );
  const [avgByYear] = await pool.query(
    `SELECT s.graduation_year, ROUND(AVG(ol.package_lpa), 2) AS avg_package_lpa
     FROM offer_letters ol
     JOIN applications a
       ON a.drive_id = ol.drive_id AND a.student_id = ol.student_id AND a.status = 'selected'
     JOIN students s ON s.user_id = ol.student_id
     WHERE ol.package_lpa IS NOT NULL
     GROUP BY s.graduation_year`
  );
  const [[overall]] = await pool.query(
    `SELECT ROUND(AVG(ol.package_lpa), 2) AS avg_package_lpa
     FROM offer_letters ol
     JOIN applications a
       ON a.drive_id = ol.drive_id AND a.student_id = ol.student_id AND a.status = 'selected'
     WHERE ol.package_lpa IS NOT NULL`
  );
  const [recruiters] = await pool.query(
    `SELECT c.name AS company,
            COUNT(DISTINCT a.student_id) AS placed,
            COUNT(DISTINCT d.id) AS drives
     FROM applications a
     JOIN drives d ON d.id = a.drive_id
     JOIN companies c ON c.id = d.company_id
     WHERE a.status = 'selected'
     GROUP BY c.id, c.name
     ORDER BY placed DESC, c.name
     LIMIT 10`
  );
  const avgByYearMap = new Map(avgByYear.map((r) => [r.graduation_year, Number(r.avg_package_lpa)]));
  return {
    by_year: byYear.map((y) => ({
      graduation_year: y.graduation_year,
      total_students: Number(y.total_students || 0),
      selected: Number(y.selected || 0),
      placement_pct: y.placement_pct == null ? 0 : Number(y.placement_pct),
      avg_package_lpa: avgByYearMap.has(y.graduation_year) ? avgByYearMap.get(y.graduation_year) : null,
    })),
    overall_avg_package_lpa: overall.avg_package_lpa == null ? null : Number(overall.avg_package_lpa),
    top_recruiters: recruiters.map((r) => ({
      company: r.company,
      placed: Number(r.placed || 0),
      drives: Number(r.drives || 0),
    })),
  };
}

module.exports = { placementReport, driveOverview, masterSchedule, driveRoster, analytics, placementStats };
