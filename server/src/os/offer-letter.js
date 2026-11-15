// Offer-letter template (Phase 2, M2) — plain server-side text, no library.
// buildOfferLetter turns the stored facts (student, company, drive, package,
// joining date) into a letter that reads like a real offer, not a data dump.
// `joiningDate` is a 'YYYY-MM-DD' string or a Date; `packageLpa` may be null.

function fmtDay(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  const months = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

function buildOfferLetter({ studentName, companyName, driveTitle, packageLpa, joiningDate }) {
  const dateLine = fmtDay(joiningDate) || 'the date confirmed by the placement office';
  const packageLine = packageLpa != null
    ? `a compensation package of ₹${Number(packageLpa)} LPA`
    : 'the compensation package discussed during your interview';
  return [
    `Dear ${studentName},`,
    '',
    `Congratulations! We are delighted to offer you the position of ${driveTitle} at ${companyName}. Your performance through the selection process stood out, and we would be glad to have you join our team.`,
    '',
    `This offer carries ${packageLine}. Your joining date is ${dateLine}. Please report to the ${companyName} office on that day with your original academic documents and a valid photo ID for verification.`,
    '',
    'Your first weeks will cover onboarding and training with your team, after which you will take up your regular responsibilities. If you have any questions about the role, the joining formalities, or anything else, please reach out to the placement office — they will connect you with us.',
    '',
    'Please confirm your acceptance of this offer by replying to the placement office within seven days of receiving this letter.',
    '',
    'We look forward to welcoming you aboard.',
    '',
    'Warm regards,',
    `${companyName} — Hiring Team`,
  ].join('\n');
}

module.exports = { buildOfferLetter };
