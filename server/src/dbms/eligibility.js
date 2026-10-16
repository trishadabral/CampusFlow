// Eligibility Engine — the rules every drive enforces, in two forms:
//   * checkEligibility() — per-student, explains *why* (used by apply + application lists)
//   * findEligibleStudents() — the same rules as ONE indexed SQL query
//     (used by the wizard preview and the eligible-students view)
const pool = require('./db');

function parseBranches(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function checkEligibility(student, drive) {
  const reasons = [];
  if (Number(student.cgpa) < Number(drive.min_cgpa)) {
    reasons.push(`CGPA ${student.cgpa} below required ${drive.min_cgpa}`);
  }
  if (Number(student.backlogs) > Number(drive.max_backlogs)) {
    reasons.push(`${student.backlogs} backlogs exceed maximum allowed ${drive.max_backlogs}`);
  }
  if (Number(student.graduation_year) !== Number(drive.graduation_year)) {
    reasons.push(
      `Graduation year ${student.graduation_year} does not match required ${drive.graduation_year}`
    );
  }
  const branches = parseBranches(drive.allowed_branches);
  if (!branches.includes(student.branch)) {
    reasons.push(`Branch ${student.branch} not eligible (allowed: ${branches.join(', ')})`);
  }
  return { eligible: reasons.length === 0, reasons };
}

// findEligibleStudents(drive) — every student passing the drive's criteria,
// as a single indexed query. The filtering happens in the database (one pass
// over the students table using the criteria as WHERE clauses), not by
// fetching everyone into Node and filtering in JS. Branch matching uses
// JSON_CONTAINS on the drive's allowed_branches array — the same idiom the
// sp_generate_shortlist procedure uses.
async function findEligibleStudents(drive) {
  const branchesJson = JSON.stringify(parseBranches(drive.allowed_branches));
  const [rows] = await pool.query(
    `SELECT u.id, u.name, u.email, s.roll_no, s.branch,
            s.cgpa, s.backlogs, s.graduation_year
     FROM students s
     JOIN users u ON u.id = s.user_id
     WHERE s.cgpa >= ?
       AND s.backlogs <= ?
       AND s.graduation_year = ?
       AND JSON_CONTAINS(?, JSON_QUOTE(s.branch)) = 1
     ORDER BY s.cgpa DESC`,
    [
      Number(drive.min_cgpa),
      Number(drive.max_backlogs),
      Number(drive.graduation_year),
      branchesJson,
    ]
  );
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    email: r.email,
    roll_no: r.roll_no,
    branch: r.branch,
    cgpa: Number(r.cgpa),
    backlogs: r.backlogs,
    graduation_year: r.graduation_year,
  }));
}

module.exports = { checkEligibility, parseBranches, findEligibleStudents };
