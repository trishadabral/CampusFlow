// Eligibility Engine (JS mirror of sp_generate_shortlist's rules).
// Used by POST /drives/:id/apply and GET /drives/:id/applications so the
// API can explain *why* a student passed or failed each criterion.

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

module.exports = { checkEligibility, parseBranches };
