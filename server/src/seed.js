// Seed script: recreates the campusflow database from database/schema.sql
// (idempotent — drops the DB first), then inserts demo data.
// Usage: npm run db:seed   (or: node src/seed.js)
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const { discoverMigrations } = require('./dbms/migrations');
const { buildOfferLetter } = require('./os/offer-letter');

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Split a .sql file into statements, honouring DELIMITER changes
// (schema.sql uses DELIMITER $$ around triggers / the stored procedure).
function splitStatements(sql) {
  const statements = [];
  let delimiter = ';';
  let current = '';
  for (const line of sql.split('\n')) {
    const trimmed = line.trim();
    const delimMatch = trimmed.match(/^DELIMITER\s+(.+)$/i);
    if (delimMatch) {
      delimiter = delimMatch[1].trim();
      continue;
    }
    current += line + '\n';
    if (new RegExp(escapeRegExp(delimiter) + '\\s*$').test(trimmed)) {
      current = current.replace(new RegExp(escapeRegExp(delimiter) + '\\s*$'), '').trim();
      if (current) statements.push(current);
      current = '';
    }
  }
  if (current.trim()) statements.push(current.trim());
  return statements;
}

async function seed(conn) {
  const hash = await bcrypt.hash('password123', 10); // same password for every demo account

  // ---------- users ----------
  const userIds = {};
  async function addUser(name, email, role) {
    const [res] = await conn.query(
      'INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)',
      [name, email, hash, role]
    );
    userIds[email] = res.insertId;
    return res.insertId;
  }

  const adminId = await addUser('Placement Officer', 'admin@campusflow.local', 'admin');
  const priyaId = await addUser('Priya Nair', 'priya@techcorp.com', 'recruiter');
  const rahulId = await addUser('Rahul Mehta', 'rahul@finserve.com', 'recruiter');
  // Sample recruiters for two well-known Indian campus recruiters (TCS,
  // Infosys). Sample data only — no real affiliation is claimed, and the
  // contact addresses are plainly sample ones on the campusflow.local
  // domain, not any real person's email.
  await addUser('Neha Kapoor', 'neha.kapoor@campusflow.local', 'recruiter');
  await addUser('Ritu Sharma', 'ritu.sharma@campusflow.local', 'recruiter');
  const nehaId = userIds['neha.kapoor@campusflow.local'];
  const rituId = userIds['ritu.sharma@campusflow.local'];

  // ---------- students (user + student rows) ----------
  // [name, email, roll_no, branch, cgpa, backlogs, skills]
  // skills: comma-separated text (students.skills), 3-5 per student.
  // photo_data / resume_data / resume_filename stay NULL (no fake blobs).
  const students = [
    ['Aarav Sharma', 'aarav@student.local', '2418001', 'CSE', 9.1, 0, 'Java, Python, DSA, SQL, React'],
    ['Diya Patel', 'diya@student.local', '2418002', 'CSE', 8.4, 0, 'Python, SQL, DBMS, HTML, CSS'],
    ['Kabir Singh', 'kabir@student.local', '2418003', 'IT', 8.8, 1, 'Java, DSA, OS, C++, SQL'],
    ['Ananya Iyer', 'ananya@student.local', '2418004', 'ECE', 7.6, 0, 'C, Python, Embedded Systems, MATLAB, IoT'],
    ['Vikram Rao', 'vikram@student.local', '2418005', 'CSE', 7.9, 2, 'Java, DBMS, SQL, DSA, Git'],
    ['Sneha Kulkarni', 'sneha@student.local', '2418006', 'IT', 6.8, 1, 'Python, JavaScript, React, SQL, HTML'],
    ['Arjun Nair', 'arjun@student.local', '2418007', 'ME', 7.2, 0, 'AutoCAD, SolidWorks, Python, C, MATLAB'],
    ['Ishita Verma', 'ishita@student.local', '2418008', 'CSE', 9.4, 0, 'Java, Python, React, Node.js, SQL'],
    ['Rohan Gupta', 'rohan@student.local', '2418009', 'ECE', 6.5, 3, 'C, Python, Digital Electronics, MATLAB, SQL'],
    ['Meera Joshi', 'meera@student.local', '2418010', 'IT', 8.1, 0, 'JavaScript, React, SQL, DBMS, Python'],
    ['Aditya Rao', 'aditya@student.local', '2418011', 'CSE', 7.4, 1, 'Java, C++, DSA, OS, DBMS'],
    ['Pooja Reddy', 'pooja@student.local', '2418012', 'ECE', 8.9, 0, 'Python, SQL, Embedded Systems, C, IoT'],
    ['Nisha Agarwal', 'nisha@student.local', '2418013', 'CSE', 9.6, 0, 'Java, Python, DSA, Machine Learning, SQL'],
    ['Yash Thakur', 'yash@student.local', '2418014', 'IT', 8.7, 0, 'JavaScript, React, Node.js, SQL, Git'],
    ['Tanvi Bhatt', 'tanvi@student.local', '2418015', 'ECE', 7.8, 1, 'C, Python, MATLAB, Digital Electronics, IoT'],
    ['Dev Malhotra', 'dev@student.local', '2418016', 'ME', 6.9, 2, 'AutoCAD, SolidWorks, MATLAB, Python, C'],
    ['Sara Khan', 'sara@student.local', '2418017', 'CSE', 8.3, 0, 'Python, SQL, DBMS, React, DSA'],
    ['Karan Joshi', 'karan@student.local', '2418018', 'EE', 7.1, 1, 'C, Python, MATLAB, Circuit Design, Power Systems'],
    ['Riya Singh', 'riya@student.local', '2418019', 'IT', 9.2, 0, 'Java, DSA, SQL, React, DBMS'],
    ['Nikhil Verma', 'nikhil@student.local', '2418020', 'ECE', 6.2, 3, 'C, Embedded Systems, Python, SQL, IoT'],
    ['Aisha Sheikh', 'aisha@student.local', '2418021', 'CSE', 8.0, 0, 'Python, Machine Learning, SQL, DSA, Java'],
    ['Manav Chawla', 'manav@student.local', '2418022', 'ME', 7.5, 0, 'SolidWorks, AutoCAD, C, Python, MATLAB'],
    ['Simran Kaur', 'simran@student.local', '2418023', 'EE', 8.6, 0, 'Python, SQL, MATLAB, Circuit Design, C'],
    ['Amit Yadav', 'amit@student.local', '2418024', 'CSE', 6.7, 2, 'Java, C++, OS, DBMS, DSA'],
  ];
  const studentIds = [];
  for (const [name, email, roll, branch, cgpa, backlogs, skills] of students) {
    const id = await addUser(name, email, 'student');
    await conn.query(
      'INSERT INTO students (user_id, roll_no, branch, cgpa, backlogs, graduation_year, skills) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [id, roll, branch, cgpa, backlogs, 2027, skills]
    );
    studentIds.push(id);
  }

  // ---------- companies ----------
  const [c1] = await conn.query(
    'INSERT INTO companies (name, website, sector) VALUES (?, ?, ?)',
    ['TechCorp Solutions', 'techcorp.com', 'IT']
  );
  const [c2] = await conn.query(
    'INSERT INTO companies (name, website, sector) VALUES (?, ?, ?)',
    ['FinServe Analytics', 'finserve.com', 'Finance']
  );
  // Sample companies for the two new recruiters above (names only — no
  // real affiliation claimed). No drives reference them yet.
  const [c3] = await conn.query(
    'INSERT INTO companies (name, website, sector) VALUES (?, ?, ?)',
    ['Tata Consultancy Services (TCS)', 'tcs.com', 'IT']
  );
  const [c4] = await conn.query(
    'INSERT INTO companies (name, website, sector) VALUES (?, ?, ?)',
    ['Infosys', 'infosys.com', 'IT']
  );

  // ---------- relative dates ----------
  // All drive dates are relative to the day the seed runs, so a reset
  // never goes stale: deadlines/tests/interviews always land in the
  // right part of the lifecycle (past = done, future = upcoming).
  function fmtDate(d) {
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }
  // 'YYYY-MM-DD HH:MM:SS' n days from today (deadlines: 23:59:59).
  function daysFromNow(n, time = '23:59:59') {
    const d = new Date();
    d.setDate(d.getDate() + n);
    return `${fmtDate(d)} ${time}`;
  }
  // 'YYYY-MM-DD' n days from today (test_date / interview_date are DATEs).
  function dateFromNow(n) {
    const d = new Date();
    d.setDate(d.getDate() + n);
    return fmtDate(d);
  }

  const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  // '16 Nov, 10:00 AM' n days from today (same shape as pipeline.js fmtWhen).
  function fmtWhen(n, time = '10:00') {
    const d = new Date();
    d.setDate(d.getDate() + n);
    const [h24, m] = time.split(':').map(Number);
    const ap = h24 >= 12 ? 'PM' : 'AM';
    const h = h24 % 12 || 12;
    return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}, ${h}:${String(m).padStart(2, '0')} ${ap}`;
  }
  // '16 December 2026' n days from today.
  function fmtLongDate(n) {
    const d = new Date();
    d.setDate(d.getDate() + n);
    return `${d.getDate()} ${MONTHS_LONG[d.getMonth()]} ${d.getFullYear()}`;
  }

  // ---------- drives ----------
  // One helper keeps every drive insert in the same shape (all pipeline
  // columns: test/interview dates, min_test_score, max_shortlist, package).
  async function addDrive({
    companyId, title, minCgpa, branches, maxBacklogs, gradYear,
    deadlineInDays, testInDays, interviewInDays,
    minTestScore = 50, maxShortlist = 20, packageLpa = null,
    testMode = 'aptitude', status = 'open', createdBy,
  }) {
    const [res] = await conn.query(
      `INSERT INTO drives (company_id, title, min_cgpa, allowed_branches, max_backlogs,
                           graduation_year, application_deadline, test_date, interview_date,
                           min_test_score, max_shortlist, package_lpa, test_mode, status, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        companyId, title, minCgpa, JSON.stringify(branches), maxBacklogs, gradYear,
        daysFromNow(deadlineInDays),
        testInDays === null ? null : dateFromNow(testInDays),
        interviewInDays === null ? null : dateFromNow(interviewInDays),
        minTestScore, maxShortlist, packageLpa, testMode, status, createdBy,
      ]
    );
    return res.insertId;
  }

  const drive1 = await addDrive({
    companyId: c1.insertId, title: 'SDE Role 2027', minCgpa: 8.0,
    branches: ['CSE', 'IT'], maxBacklogs: 0, gradYear: 2027,
    deadlineInDays: 10, testInDays: 14, interviewInDays: 21,
    minTestScore: 50, maxShortlist: 20, testMode: 'both', status: 'open', createdBy: priyaId,
  });
  const drive2 = await addDrive({
    companyId: c2.insertId, title: 'Analyst 2027', minCgpa: 7.0,
    branches: ['CSE', 'IT', 'ECE'], maxBacklogs: 1, gradYear: 2027,
    deadlineInDays: 15, testInDays: 19, interviewInDays: 26,
    minTestScore: 50, maxShortlist: 20, status: 'open', createdBy: rahulId,
  });
  const drive3 = await addDrive({
    companyId: c1.insertId, title: 'Summer Intern 2026', minCgpa: 7.5,
    branches: ['CSE', 'IT'], maxBacklogs: 0, gradYear: 2026,
    deadlineInDays: -30, testInDays: null, interviewInDays: null,
    status: 'closed', createdBy: priyaId,
  });

  // Two more open drives, one per new recruiter/company.
  const drive4 = await addDrive({
    companyId: c3.insertId, title: 'Software Engineer 2027', minCgpa: 7.5,
    branches: ['CSE', 'IT', 'ECE'], maxBacklogs: 0, gradYear: 2027,
    deadlineInDays: 12, testInDays: 16, interviewInDays: 23,
    minTestScore: 50, maxShortlist: 15, packageLpa: 7.00,
    status: 'open', createdBy: nehaId,
  });
  const drive5 = await addDrive({
    companyId: c4.insertId, title: 'Systems Engineer 2027', minCgpa: 7.0,
    branches: ['CSE', 'IT', 'ECE', 'EE'], maxBacklogs: 1, gradYear: 2027,
    deadlineInDays: 18, testInDays: 22, interviewInDays: 29,
    minTestScore: 60, maxShortlist: 12, packageLpa: 9.50,
    status: 'open', createdBy: rituId,
  });
  // One drive mid-pipeline: applications closed, test about to run.
  const drive6 = await addDrive({
    companyId: c2.insertId, title: 'Data Analyst 2027', minCgpa: 7.5,
    branches: ['CSE', 'IT'], maxBacklogs: 0, gradYear: 2027,
    deadlineInDays: -2, testInDays: 1, interviewInDays: 8,
    minTestScore: 50, maxShortlist: 10, packageLpa: 8.00,
    status: 'testing', createdBy: rahulId,
  });
  // Test done, interviews coming up: shortlist already decided.
  const drive7 = await addDrive({
    companyId: c1.insertId, title: 'Graduate Engineer Trainee 2027', minCgpa: 8.0,
    branches: ['CSE', 'IT'], maxBacklogs: 0, gradYear: 2027,
    deadlineInDays: -10, testInDays: -5, interviewInDays: 2,
    minTestScore: 60, maxShortlist: 6, packageLpa: 10.00,
    status: 'interviews', createdBy: priyaId,
  });
  // Two finished drives with full outcomes (offers come in Wave 3).
  const drive8 = await addDrive({
    companyId: c2.insertId, title: 'Business Analyst 2027', minCgpa: 7.0,
    branches: ['CSE', 'IT', 'ECE'], maxBacklogs: 1, gradYear: 2027,
    deadlineInDays: -25, testInDays: -20, interviewInDays: -15,
    minTestScore: 50, maxShortlist: 10, packageLpa: 8.50,
    status: 'closed', createdBy: rahulId,
  });
  const drive9 = await addDrive({
    companyId: c3.insertId, title: 'Software Developer 2027', minCgpa: 7.5,
    branches: ['CSE', 'IT', 'ECE'], maxBacklogs: 0, gradYear: 2027,
    deadlineInDays: -35, testInDays: -30, interviewInDays: -22,
    minTestScore: 50, maxShortlist: 10, packageLpa: 7.50,
    status: 'closed', createdBy: nehaId,
  });

  // Multi-round setup for the Infosys drive (still open: rounds pending).
  for (const [roundNo, name, cutoff] of [
    [1, 'Aptitude', 50],
    [2, 'Technical', 60],
    [3, 'HR', 50],
  ]) {
    await conn.query(
      'INSERT INTO drive_rounds (drive_id, round_no, name, cutoff, status) VALUES (?, ?, ?, ?, ?)',
      [drive5, roundNo, name, cutoff, 'pending']
    );
  }

  // ---------- applications ----------
  // studentIds index -> student (same order as the students array above):
  // 0 Aarav, 1 Diya, 2 Kabir, 3 Ananya, 4 Vikram, 5 Sneha, 6 Arjun,
  // 7 Ishita, 8 Rohan, 9 Meera, 10 Aditya, 11 Pooja, 12 Nisha, 13 Yash,
  // 14 Tanvi, 15 Dev, 16 Sara, 17 Karan, 18 Riya, 19 Nikhil, 20 Aisha,
  // 21 Manav, 22 Simran, 23 Amit. All graduation_year 2027.
  // appliedAt ('YYYY-MM-DD HH:MM:SS') is set for the new drives only —
  // drives 1–3 keep the default (NOW) exactly as before.
  async function apply(driveId, studentIdx, status = 'applied', appliedAt = null) {
    if (appliedAt) {
      await conn.query(
        'INSERT INTO applications (drive_id, student_id, status, applied_at) VALUES (?, ?, ?, ?)',
        [driveId, studentIds[studentIdx], status, appliedAt]
      );
    } else {
      await conn.query(
        'INSERT INTO applications (drive_id, student_id, status) VALUES (?, ?, ?)',
        [driveId, studentIds[studentIdx], status]
      );
    }
  }

  // Drive 1: all 24 students applied (the eligibility engine will shortlist them).
  for (const sid of studentIds) {
    await conn.query('INSERT INTO applications (drive_id, student_id) VALUES (?, ?)', [
      drive1,
      sid,
    ]);
  }
  // Drive 2: first 8 students applied.
  for (const sid of studentIds.slice(0, 8)) {
    await conn.query('INSERT INTO applications (drive_id, student_id) VALUES (?, ?)', [
      drive2,
      sid,
    ]);
  }
  // Drive 3 (closed): a little history for the reports page.
  const hist = [
    [studentIds[0], 'selected'],
    [studentIds[1], 'shortlisted'],
    [studentIds[7], 'shortlisted'],
    [studentIds[9], 'applied'],
  ];
  for (const [sid, status] of hist) {
    await conn.query('INSERT INTO applications (drive_id, student_id, status) VALUES (?, ?, ?)', [
      drive3,
      sid,
      status,
    ]);
  }

  // Drive 4 (TCS, open): 11 eligible (CGPA>=7.5, CSE/IT/ECE, 0 backlogs)
  // + 3 ineligible (Kabir/Tanvi: 1 backlog; Aditya: 7.4 CGPA + 1 backlog).
  for (const [pos, idx] of [0, 1, 3, 7, 9, 11, 12, 13, 16, 18, 20, 2, 14, 10].entries()) {
    await apply(drive4, idx, 'applied', daysFromNow(-3 - (pos % 3), '10:00:00'));
  }
  // Drive 5 (Infosys, open): 14 eligible (CGPA>=7.0, CSE/IT/ECE/EE, <=1 backlog)
  // + 2 ineligible (Vikram: 2 backlogs; Sneha: 6.8 CGPA).
  for (const [pos, idx] of [0, 1, 2, 3, 9, 11, 12, 13, 14, 16, 17, 18, 20, 22, 4, 5].entries()) {
    await apply(drive5, idx, 'applied', daysFromNow(-2 - (pos % 3), '10:00:00'));
  }
  // Drive 6 (testing): 9 eligible (CGPA>=7.5, CSE/IT, 0 backlogs) + 3
  // ineligible (Kabir/Aditya: 1 backlog; Vikram: 2 backlogs). All 'applied'
  // — results not published yet (Wave 3 seeds test_results).
  for (const [pos, idx] of [0, 1, 7, 9, 12, 13, 16, 18, 20, 2, 10, 4].entries()) {
    await apply(drive6, idx, 'applied', daysFromNow(-4 - (pos % 2), '10:00:00'));
  }
  // Drive 7 (interviews): 6 shortlisted — all pass the rules (CGPA>=8.0,
  // CSE/IT, 0 backlogs, 2027) so Wave 3 can give them scores above the
  // 60% cutoff; the other 6 are rejected (3 eligible, 3 ineligible).
  for (const [pos, idx] of [0, 7, 12, 18, 13, 1].entries()) {
    await apply(drive7, idx, 'shortlisted', daysFromNow(-12 - (pos % 2), '10:00:00'));
  }
  for (const [pos, idx] of [9, 16, 20, 2, 10, 11].entries()) {
    await apply(drive7, idx, 'rejected', daysFromNow(-12 - (pos % 2), '10:00:00'));
  }
  // Drive 8 (closed): 3 selected (Nisha 9.6, Ishita 9.4, Riya 9.2 — all
  // CSE/IT, 0 backlogs), 3 shortlisted, 6 rejected.
  for (const [pos, idx] of [12, 7, 18].entries()) {
    await apply(drive8, idx, 'selected', daysFromNow(-30 - (pos % 2), '10:00:00'));
  }
  for (const [pos, idx] of [0, 11, 13].entries()) {
    await apply(drive8, idx, 'shortlisted', daysFromNow(-30 - (pos % 2), '10:00:00'));
  }
  for (const [pos, idx] of [1, 2, 9, 16, 14, 4].entries()) {
    await apply(drive8, idx, 'rejected', daysFromNow(-30 - (pos % 2), '10:00:00'));
  }
  // Drive 9 (closed): 2 selected (Aisha 8.0 CSE, Ananya 7.6 ECE — both
  // 0 backlogs), 2 shortlisted, 6 rejected.
  for (const [pos, idx] of [20, 3].entries()) {
    await apply(drive9, idx, 'selected', daysFromNow(-37 - (pos % 2), '10:00:00'));
  }
  for (const [pos, idx] of [9, 16].entries()) {
    await apply(drive9, idx, 'shortlisted', daysFromNow(-37 - (pos % 2), '10:00:00'));
  }
  for (const [pos, idx] of [0, 1, 2, 10, 5, 8].entries()) {
    await apply(drive9, idx, 'rejected', daysFromNow(-37 - (pos % 2), '10:00:00'));
  }

  // ---------- test questions (drive 1 + drive 2 ship with a ready test) ----------
  const sampleQuestions = [
    ['What is the time complexity of binary search on a sorted array of n elements?',
     ['O(n)', 'O(log n)', 'O(n log n)', 'O(1)'], 1, 2],
    ['Which of these is NOT a valid ACID property?',
     ['Atomicity', 'Consistency', 'Isolation', 'Durability'], 0, 1],
    ['A process is waiting for a resource held by another waiting process. This is…',
     ['Starvation', 'Deadlock', 'Livelock', 'Thrashing'], 1, 2],
    ['In a B+ tree of order m, what is stored in internal nodes?',
     ['Data records', 'Only keys for routing', 'Both keys and records', 'Nothing'], 1, 2],
    ['Which SQL clause filters groups after aggregation?',
     ['WHERE', 'HAVING', 'GROUP BY', 'ORDER BY'], 1, 1],
  ];
  // Per-drive question bank (Wave 3): question ids + correct answers +
  // marks, and each drive's total marks — results are built from these,
  // never from hardcoded totals.
  const questionBank = {};
  const driveTotals = {};
  async function insertQuestions(driveId, qs) {
    questionBank[driveId] = [];
    let total = 0;
    for (const [text, options, correct, marks] of qs) {
      const [res] = await conn.query(
        `INSERT INTO test_questions (drive_id, question_text, options, correct_index, marks)
         VALUES (?, ?, ?, ?, ?)`,
        [driveId, text, JSON.stringify(options), correct, marks]
      );
      questionBank[driveId].push({ id: res.insertId, correct, marks });
      total += marks;
    }
    driveTotals[driveId] = total;
  }
  for (const [driveX, qs] of [[drive1, sampleQuestions], [drive2, sampleQuestions.slice(0, 3)]]) {
    await insertQuestions(driveX, qs);
  }

  // One coding question on the SDE drive (Wave 6): its test_mode is 'both',
  // so students get the aptitude questions above plus this one. Inserted
  // separately from insertQuestions() — that helper only handles aptitude
  // questions (it tracks correct answers for seeded results, and drive1,
  // an open drive, has no seeded results).
  await conn.query(
    `INSERT INTO test_questions (drive_id, question_text, type, language, starter_code, expected_output, marks)
     VALUES (?, ?, 'coding', 'javascript', ?, '7', 2)`,
    [drive1, 'Write a program that prints the sum of 3 and 4.', '// Write your code below\n']
  );
  driveTotals[drive1] += 2;

  // Fresh questions for every new drive (8 each, 10 for the testing drive).
  await insertQuestions(drive4, [
    ['A 240 m long train travelling at 72 km/h crosses a pole in how many seconds?',
     ['10 seconds', '12 seconds', '15 seconds', '18 seconds'], 1, 1],
    ['What is the average of the first 10 natural numbers?',
     ['5', '5.5', '6', '10'], 1, 1],
    ['What does SELECT COUNT(*) FROM employees WHERE salary > 50000 return?',
     ['The number of employees earning above 50000', 'The total salary of all employees',
      'The highest salary above 50000', 'All employees earning above 50000'], 0, 1],
    ['Which data structure follows first-in, first-out order?',
     ['Stack', 'Queue', 'Tree', 'Graph'], 1, 1],
    ['What is the time complexity of inserting at the head of a singly linked list?',
     ['O(1)', 'O(n)', 'O(log n)', 'O(n^2)'], 0, 2],
    ['An item costing Rs. 500 is sold at a 20% profit. What is the selling price?',
     ['Rs. 550', 'Rs. 600', 'Rs. 650', 'Rs. 700'], 1, 1],
    ['Which normal form removes transitive dependencies?',
     ['1NF', '2NF', '3NF', 'BCNF'], 2, 2],
    ['Two numbers are in the ratio 3:4 and their sum is 63. What is the larger number?',
     ['27', '36', '28', '35'], 1, 1],
  ]);
  await insertQuestions(drive5, [
    ['If x + y = 15 and x - y = 3, what is the value of x?',
     ['6', '7', '8', '9'], 3, 1],
    ['Which CPU scheduling algorithm gives every process an equal time slice in turn?',
     ['FCFS', 'Round Robin', 'SJF', 'Priority'], 1, 1],
    ['In Java, which keyword prevents a class from being inherited?',
     ['static', 'final', 'abstract', 'private'], 1, 1],
    ['What is the next number in the series 2, 6, 12, 20, 30, …?',
     ['36', '40', '42', '44'], 2, 1],
    ['Which SQL join returns only the rows that match in both tables?',
     ['LEFT JOIN', 'RIGHT JOIN', 'INNER JOIN', 'FULL JOIN'], 2, 2],
    ['What is the binary equivalent of decimal 25?',
     ['11001', '10101', '11101', '10011'], 0, 1],
    ['Which of these is a DDL command?',
     ['SELECT', 'INSERT', 'CREATE', 'UPDATE'], 2, 1],
    ['The numbers 1, 2, 3 are pushed onto a stack in that order. In what order are they popped?',
     ['1, 2, 3', '3, 2, 1', '2, 3, 1', '1, 3, 2'], 1, 2],
  ]);
  await insertQuestions(drive6, [
    ['What is the mean of 4, 8, 15, 16, 23 and 42?',
     ['17', '18', '19', '20'], 1, 1],
    ['In SQL, which function returns the number of rows in a result?',
     ['SUM', 'COUNT', 'AVG', 'MAX'], 1, 1],
    ['What is the median of 3, 7, 9, 11 and 13?',
     ['7', '9', '11', '10'], 1, 1],
    ['What is the probability of rolling an even number on a fair six-sided die?',
     ['1/3', '1/2', '2/3', '1/6'], 1, 1],
    ['Which chart best shows parts of a whole?',
     ['Bar chart', 'Pie chart', 'Line chart', 'Scatter plot'], 1, 1],
    ['What is the mode of 2, 3, 3, 5, 7, 3 and 9?',
     ['2', '3', '5', '7'], 1, 1],
    ['GROUP BY is used together with which type of function?',
     ['Aggregate functions', 'JOIN clauses', 'ORDER BY', 'WHERE conditions'], 0, 2],
    ['A correlation coefficient of -0.9 describes what kind of relationship?',
     ['Strong positive', 'Weak positive', 'Strong negative', 'No correlation'], 2, 1],
    ['Which SQL clause sorts the rows of a result set?',
     ['SORT BY', 'ORDER BY', 'GROUP BY', 'FILTER BY'], 1, 1],
    ['What does standard deviation measure?',
     ['The average value', 'The spread of values around the mean',
      'The middle value', 'The most frequent value'], 1, 2],
  ]);
  await insertQuestions(drive7, [
    ['Which OSI layer is responsible for routing packets between networks?',
     ['Transport', 'Network', 'Data Link', 'Session'], 1, 1],
    ['In C, what is the typical size of an int on a modern 64-bit system?',
     ['1 byte', '2 bytes', '4 bytes', '8 bytes'], 2, 1],
    ['Which sorting algorithm has a worst-case time complexity of O(n log n)?',
     ['Bubble sort', 'Merge sort', 'Insertion sort', 'Selection sort'], 1, 2],
    ['Which of these is one of the four necessary conditions for deadlock?',
     ['Mutual exclusion', 'Hold and wait', 'Circular wait', 'All of the above'], 3, 2],
    ['A primary key must be…',
     ['Unique only', 'Not null only', 'Unique and not null', 'Allowed to repeat'], 2, 1],
    ['What is 15% of 240?',
     ['30', '32', '36', '40'], 2, 1],
    ['Which protocol is used to transfer web pages between a browser and a server?',
     ['FTP', 'SMTP', 'HTTP', 'TCP'], 2, 1],
    ['What does the base case of a recursive function prevent?',
     ['Stack overflow only', 'Infinite recursion', 'Compilation error', 'Memory leak'], 1, 1],
  ]);
  await insertQuestions(drive8, [
    ['A business earns Rs. 5,00,000 in revenue with Rs. 4,00,000 in costs. What is the profit margin?',
     ['10%', '20%', '25%', '80%'], 1, 1],
    ['Which UML diagram shows the actors of a system and the use cases they interact with?',
     ['Class diagram', 'Use case diagram', 'ER diagram', 'Flowchart'], 1, 1],
    ['The break-even point is reached when…',
     ['Profit is at its maximum', 'Total revenue equals total cost',
      'Sales are zero', 'Costs are zero'], 1, 1],
    ['In a DBMS, a foreign key refers to…',
     ['The primary key of the same table', 'The primary key of another table',
      'Any column in any table', 'An index only'], 1, 2],
    ['A project takes 10 days with 5 workers at the same rate. How long would it take with 10 workers?',
     ['2 days', '5 days', '10 days', '20 days'], 1, 1],
    ['Which SQL statement changes the values of existing rows?',
     ['INSERT', 'UPDATE', 'DELETE', 'ALTER'], 1, 1],
    ['In a SWOT analysis, "Opportunities" are…',
     ['Internal strengths', 'External favourable factors',
      'Internal weaknesses', 'External threats'], 1, 1],
    ['Which normal form is violated when a non-key attribute depends on only part of a composite key?',
     ['1NF', '2NF', '3NF', 'BCNF'], 1, 2],
  ]);
  await insertQuestions(drive9, [
    ['Which of these is a linear data structure?',
     ['Tree', 'Graph', 'Array', 'Heap'], 2, 1],
    ['What is the value of 7 % 3 in most programming languages?',
     ['0', '1', '2', '3'], 1, 1],
    ['Which loop is guaranteed to execute its body at least once?',
     ['for', 'while', 'do-while', 'foreach'], 2, 1],
    ['What is the worst-case time complexity of linear search?',
     ['O(1)', 'O(log n)', 'O(n)', 'O(n^2)'], 2, 1],
    ['Which keyword is used to define a class in Java?',
     ['struct', 'class', 'object', 'define'], 1, 1],
    ['In an operating system, a process waiting for I/O is in which state?',
     ['Running', 'Ready', 'Waiting', 'Terminated'], 2, 1],
    ['What is the next number in the series 1, 1, 2, 3, 5, 8, …?',
     ['11', '12', '13', '15'], 2, 1],
    ['Which SQL command removes an entire table from the database?',
     ['DELETE TABLE', 'DROP TABLE', 'TRUNCATE TABLE', 'REMOVE TABLE'], 1, 2],
  ]);

  // ---------- resources ----------
  const resources = [
    ['Lab A', 'lab', 60, 'Block C, Floor 2'],
    ['Lab B', 'lab', 40, 'Block C, Floor 1'],
    ['Seminar Room 1', 'room', 1, 'Admin Block'],
    ['Interview Room 1', 'room', 1, 'Placement Cell'],
    ['Interview Room 2', 'room', 1, 'Placement Cell'],
    ['Prof. Sharma', 'interviewer', 1, 'CSE Dept'],
    ['Prof. Iyer', 'interviewer', 1, 'ECE Dept'],
    // Wave 4: one more lab plus two more interviewers, so the Resources
    // page and calendar feel like a real placement cell.
    ['Lab C', 'lab', 30, 'Block C, Floor 3'],
    ['Prof. Verma', 'interviewer', 1, 'CSE Dept'],
    ['Dr. Kapoor', 'interviewer', 1, 'IT Dept'],
  ];
  // Capture insert ids (Wave 3 slots reference the exact lab/room rows).
  const resourceIds = {};
  for (const [name, type, capacity, location] of resources) {
    const [res] = await conn.query(
      'INSERT INTO resources (name, type, capacity, location) VALUES (?, ?, ?, ?)',
      [name, type, capacity, location]
    );
    resourceIds[name] = res.insertId;
  }
  const labAId = resourceIds['Lab A'];
  const labBId = resourceIds['Lab B'];
  const seminarId = resourceIds['Seminar Room 1'];
  const roomInt1Id = resourceIds['Interview Room 1'];
  const roomInt2Id = resourceIds['Interview Room 2'];
  const labCId = resourceIds['Lab C'];
  const profVermaId = resourceIds['Prof. Verma'];
  const drKapoorId = resourceIds['Dr. Kapoor'];

  // ---------- Exam monitoring: computers + prohibited processes ----------
  // Five enrolled PCs in each of the first two labs (the Exam PCs page
  // lists them; the Windows agent in windows-agent/ enrolls with the
  // enrollment code). The codes are random per reset — copy the current
  // one from the Exam PCs page when setting up an agent. The lab_machines
  // rows seeded later (line ~877) are the live lab-status feed and are
  // separate from these enrolled exam PCs.
  const crypto = require('crypto');
  let pcCount = 0;
  const pcIds = {}; // pc_code -> computers.id (exam sessions below need them)
  for (const [labId, labName] of [[labAId, 'Lab A'], [labBId, 'Lab B']]) {
    const prefix = labName.toUpperCase().replace(/\s+/g, '-');
    for (let i = 1; i <= 5; i++) {
      const pcCode = `${prefix}-PC${String(i).padStart(2, '0')}`;
      const enrollCode = `ENROLL-${prefix}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
      const [pcRes] = await conn.query(
        'INSERT INTO computers (resource_id, pc_code, enrollment_code, status) VALUES (?, ?, ?, ?)',
        [labId, pcCode, enrollCode, 'available']
      );
      pcIds[pcCode] = pcRes.insertId;
      pcCount++;
    }
  }
  const defaultProhibited = [
    'discord.exe',
    'telegram.exe',
    'anydesk.exe',
    'teamviewer.exe',
    'whatsapp.exe',
    'slack.exe',
    'zoom.exe',
    'chatgpt.exe',
  ];
  for (const proc of defaultProhibited) {
    await conn.query('INSERT IGNORE INTO prohibited_processes (process_name) VALUES (?)', [proc]);
  }

  // ---------- Exam monitoring: demo sessions, agent devices, events ----------
  // So the Exam Monitoring page is alive on first load: one exam in
  // progress right now (Diya on LAB-A-PC02, Data Analyst test), one
  // scheduled for tomorrow (Aarav on LAB-A-PC01, same test slot as the
  // seeded bookings), and a few flags for the admin to review.
  // Demo agent tokens (local demo only — same class as password123):
  //   LAB-A-PC01 -> dev-agent-token-pc01   (offline: agent not running)
  //   LAB-A-PC02 -> dev-agent-token-pc02   (online as of the reset; the
  //   sweeper marks it offline ~15 s after the API boots with no
  //   heartbeat, which is the honest behaviour for a demo agent).
  const agentTokenHash = (t) => crypto.createHash('sha256').update(t).digest('hex');
  await conn.query(
    `INSERT INTO agent_devices (computer_id, token_hash, hostname, agent_version, status, last_heartbeat_at)
     VALUES (?, ?, ?, '1.0.0', 'offline', NULL)`,
    [pcIds['LAB-A-PC01'], agentTokenHash('dev-agent-token-pc01'), 'LAB-A-PC01']
  );
  await conn.query(
    `INSERT INTO agent_devices (computer_id, token_hash, hostname, agent_version, status, last_heartbeat_at)
     VALUES (?, ?, ?, '1.0.0', 'online', NOW())`,
    [pcIds['LAB-A-PC02'], agentTokenHash('dev-agent-token-pc02'), 'LAB-A-PC02']
  );
  // Scheduled: tomorrow 10:00–11:00, matching the seeded drive-6 test slot.
  const [sess1] = await conn.query(
    `INSERT INTO exam_sessions (computer_id, student_id, drive_id, status, exam_window_keyword, starts_at, ends_at, created_by)
     VALUES (?, ?, ?, 'scheduled', 'CampusFlow', ?, ?, ?)`,
    [pcIds['LAB-A-PC01'], studentIds[0], drive6, daysFromNow(1, '10:00:00'), daysFromNow(1, '11:00:00'), adminId]
  );
  // Active: today 09:00–12:00, Diya's Data Analyst test in progress.
  const [sess2] = await conn.query(
    `INSERT INTO exam_sessions (computer_id, student_id, drive_id, status, exam_window_keyword, starts_at, ends_at, created_by)
     VALUES (?, ?, ?, 'active', 'CampusFlow', ?, ?, ?)`,
    [pcIds['LAB-A-PC02'], studentIds[1], drive6, daysFromNow(0, '09:00:00'), daysFromNow(0, '12:00:00'), adminId]
  );
  // Flags on the active session: three new, one already reviewed.
  for (const [eventType, title, proc, when, reviewStatus, note] of [
    ['WINDOW_SWITCH', 'Google Chrome', 'chrome.exe', daysFromNow(0, '09:12:00'), 'new', null],
    ['FOCUS_LOST', 'Google Chrome', 'chrome.exe', daysFromNow(0, '09:20:00'), 'new', null],
    ['PROHIBITED_PROCESS', 'Discord', 'discord.exe', daysFromNow(0, '09:35:00'), 'new', null],
    ['WINDOW_MINIMIZED', 'CampusFlow — Test', 'chrome.exe', daysFromNow(0, '09:05:00'), 'reviewed', 'Checked with the invigilator — the student was only adjusting the window, no concern.'],
  ]) {
    await conn.query(
      `INSERT INTO monitoring_events (exam_session_id, computer_id, event_type, window_title, process_name, occurred_at, review_status, reviewed_by, review_note)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [sess2.insertId, pcIds['LAB-A-PC02'], eventType, title, proc, when, reviewStatus, reviewStatus === 'reviewed' ? adminId : null, note]
    );
  }
  // Lock-table history for the Live Monitor page (the same acquire /
  // release rows the PC allocator writes when it hands out a seat).
  for (const [pcCode, when] of [['LAB-A-PC01', daysFromNow(0, '09:00:00')], ['LAB-A-PC02', daysFromNow(0, '08:59:00')]]) {
    await conn.query(
      "INSERT INTO lock_events (lock_name, holder, action, wait_ms, created_at) VALUES (?, ?, 'acquire', 3, ?)",
      [`computer:${pcIds[pcCode]}`, 'admin@campusflow.local', when]
    );
    await conn.query(
      "INSERT INTO lock_events (lock_name, holder, action, wait_ms, created_at) VALUES (?, ?, 'release', 0, ?)",
      [`computer:${pcIds[pcCode]}`, 'admin@campusflow.local', when]
    );
  }

  // ---------- Wave 3: pipeline data ----------
  // Percentage the way the app means it: score/total*100 rounded to 2dp
  // (os/pipeline.js submitTest() computes the same: *10000/100 — fixed
  // in d2c12b9, when it was 10x too small and nobody could clear a cutoff).
  function pct2(score, total) {
    return Math.round((score / total) * 10000) / 100;
  }

  // Pick answers whose correct marks sum exactly to `target`: walk the
  // questions from the last one backwards, taking a question correct
  // whenever its marks still fit the remainder. (Forward order strands a
  // remainder of 1 behind a trailing 2-mark question.) Every drive here
  // has 1-mark questions, so an exact sum is always reachable; anything
  // else throws loudly instead of seeding a wrong score.
  function answersFor(driveId, target) {
    const qs = questionBank[driveId];
    const answers = {};
    let remaining = target;
    for (let i = qs.length - 1; i >= 0; i--) {
      const q = qs[i];
      if (q.marks <= remaining) {
        answers[q.id] = q.correct;
        remaining -= q.marks;
      } else {
        answers[q.id] = (q.correct + 1) % 4; // deliberately wrong
      }
    }
    if (remaining !== 0) {
      throw new Error(`Cannot build answers summing to ${target} for drive ${driveId}`);
    }
    return answers;
  }

  async function addResult(driveId, studentIdx, score, submittedAt) {
    const total = driveTotals[driveId];
    await conn.query(
      `INSERT INTO test_results (drive_id, student_id, score, total, percentage, answers, submitted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        driveId,
        studentIds[studentIdx],
        score,
        total,
        pct2(score, total),
        JSON.stringify(answersFor(driveId, score)),
        submittedAt,
      ]
    );
  }

  // --- test results ---
  // Drive 6 (Data Analyst, total 12, cutoff 50): 10 of the 12 applicants
  // took the test — a spread above and below the cutoff. Aditya and
  // Vikram (the 2 waitlisted below) have no result yet.
  // Percentages: 91.67, 75, 83.33, 66.67, 58.33, 75, 50, 41.67, 33.33, 58.33.
  const d6Results = [
    [0, 11], [1, 9], [7, 10], [9, 8], [12, 7],
    [13, 9], [16, 6], [18, 5], [20, 4], [2, 7],
  ];
  for (const [pos, [idx, score]] of d6Results.entries()) {
    await addResult(drive6, idx, score, daysFromNow(1, `11:${String(5 + pos).padStart(2, '0')}:00`));
  }
  // Drive 7 (Graduate Engineer Trainee, total 10, cutoff 60): all 12.
  // Shortlisted 70–90% (>= 60); rejected eligible 50%; rejected
  // ineligible 30–50%. Matches publishResults exactly.
  const d7Results = [
    [0, 8], [7, 9], [12, 8], [18, 7], [13, 8], [1, 9], // shortlisted
    [9, 5], [16, 5], [20, 5], // rejected, eligible
    [2, 4], [10, 3], [11, 5], // rejected, ineligible
  ];
  for (const [pos, [idx, score]] of d7Results.entries()) {
    await addResult(drive7, idx, score, daysFromNow(-5, `11:${String(5 + pos).padStart(2, '0')}:00`));
  }
  // Drive 8 (Business Analyst, total 10, cutoff 50): selected 80–90%,
  // shortlisted 70%, rejected 20–40% (below the cutoff).
  const d8Results = [
    [12, 9], [7, 9], [18, 8], // selected
    [0, 7], [11, 7], [13, 7], // shortlisted
    [1, 4], [2, 3], [9, 4], [16, 2], [14, 4], [4, 3], // rejected
  ];
  for (const [pos, [idx, score]] of d8Results.entries()) {
    await addResult(drive8, idx, score, daysFromNow(-20, `11:${String(5 + pos).padStart(2, '0')}:00`));
  }
  // Drive 9 (Software Developer, total 9, cutoff 50): selected 88.89%,
  // shortlisted 77.78% / 66.67%, rejected 22.22–44.44%.
  const d9Results = [
    [20, 8], [3, 8], // selected
    [9, 7], [16, 6], // shortlisted
    [0, 4], [1, 3], [2, 4], [10, 2], [5, 3], [8, 2], // rejected
  ];
  for (const [pos, [idx, score]] of d9Results.entries()) {
    await addResult(drive9, idx, score, daysFromNow(-30, `11:${String(5 + pos).padStart(2, '0')}:00`));
  }

  // --- slots + bookings ---
  const hhmm = (min) =>
    `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
  async function addBooking(slotId, studentIdx, status, bookedAt) {
    await conn.query(
      'INSERT INTO bookings (slot_id, student_id, status, booked_at) VALUES (?, ?, ?, ?)',
      [slotId, studentIds[studentIdx], status, bookedAt]
    );
  }

  // Drive 6 test session: one full Lab A session, 10:00–11:00 on test day.
  // 10 confirmed seats (the 10 who took the test); booked_count stays 10 —
  // the 2 waitlisted students below hold no seat.
  const testDay6 = dateFromNow(1);
  const [slot6Res] = await conn.query(
    `INSERT INTO slots (drive_id, resource_id, type, title, starts_at, ends_at, capacity, booked_count)
     VALUES (?, ?, 'test', ?, ?, ?, 10, 10)`,
    [drive6, labAId, 'Aptitude Test · Batch A', `${testDay6} 10:00:00`, `${testDay6} 11:00:00`]
  );
  const testSlot6 = slot6Res.insertId;
  for (const [pos, idx] of [0, 1, 7, 9, 12, 13, 16, 18, 20, 2].entries()) {
    await addBooking(testSlot6, idx, 'confirmed', daysFromNow(-1, `09:${String(10 + pos * 2).padStart(2, '0')}:00`));
  }
  // Waitlist, in booking order: Aditya #1, Vikram #2 (booked_at decides
  // the position — see GET /bookings/me).
  await addBooking(testSlot6, 10, 'waitlist', daysFromNow(-1, '09:45:00'));
  await addBooking(testSlot6, 4, 'waitlist', daysFromNow(-1, '10:05:00'));

  // Drive 7 interviews: 6 one-seat slots on interview day, 20 minutes
  // apart from 10:00, panels 1..2 rotating, rooms Interview Room 1 /
  // Interview Room 2 / Seminar Room 1 rotating (same rotation as
  // publishResults: panel (i % num_interviewers) + 1, rooms in turn).
  const interviewDay7 = dateFromNow(2);
  const d7Shortlisted = [0, 7, 12, 18, 13, 1];
  const d7Rooms = [roomInt1Id, roomInt2Id, seminarId];
  for (let i = 0; i < d7Shortlisted.length; i++) {
    const startMin = 600 + i * 20;
    const panel = (i % 2) + 1;
    const [sRes] = await conn.query(
      `INSERT INTO slots (drive_id, resource_id, type, title, starts_at, ends_at, capacity, booked_count)
       VALUES (?, ?, 'interview', ?, ?, ?, 1, 1)`,
      [
        drive7,
        d7Rooms[i % 3],
        `Interview · Panel ${panel}`,
        `${interviewDay7} ${hhmm(startMin)}:00`,
        `${interviewDay7} ${hhmm(startMin + 20)}:00`,
      ]
    );
    await addBooking(sRes.insertId, d7Shortlisted[i], 'confirmed', daysFromNow(-2, `15:0${i}:00`));
  }

  // --- interview feedback ---
  // Score scale is 0–100 (routes/drives.js POST /:id/feedback rejects
  // anything outside 0–100), so the "7.5–9.2 on a 10 scale" brief is
  // seeded as 75–92. interviewer_id is a users id (the drive's creator);
  // round_id NULL (drive 7 has no rounds).
  async function addFeedback(driveId, studentIdx, interviewerId, score, remarks) {
    await conn.query(
      `INSERT INTO interview_feedback (drive_id, student_id, interviewer_id, round_id, score, remarks)
       VALUES (?, ?, ?, NULL, ?, ?)`,
      [driveId, studentIds[studentIdx], interviewerId, score, remarks]
    );
  }
  // Drive 7 (Priya Nair), one row per shortlisted student.
  for (const [idx, score, remarks] of [
    [0, 88, 'Strong DSA, clear communication; solved the follow-up without hints.'],
    [7, 92, 'Excellent problem solving and confident answers throughout.'],
    [12, 90, 'Very strong on DBMS fundamentals; explained indexing clearly.'],
    [18, 85, 'Solid on data structures; good examples from her projects.'],
    [13, 82, 'Good practical knowledge; took a little long on the SQL question.'],
    [1, 78, 'Clear thinker; needs a bit more depth on operating systems.'],
  ]) {
    await addFeedback(drive7, idx, priyaId, score, remarks);
  }
  // Completed drives: selected students only (Rahul for drive 8, Neha for drive 9).
  for (const [idx, score, remarks] of [
    [12, 91, 'Outstanding across the case discussion; calm under pressure.'],
    [7, 89, 'Strong analytical thinking; very good with numbers.'],
    [18, 86, 'Confident communicator; solid business sense.'],
  ]) {
    await addFeedback(drive8, idx, rahulId, score, remarks);
  }
  for (const [idx, score, remarks] of [
    [20, 87, 'Strong on DSA and machine learning basics; great attitude.'],
    [3, 84, 'Good embedded-systems depth; clear, structured answers.'],
  ]) {
    await addFeedback(drive9, idx, nehaId, score, remarks);
  }

  // --- offer letters ---
  // letter_text is built by the same buildOfferLetter() the generate route
  // uses, so the text matches the app byte for byte. joining_date is
  // today+30, the route's default. generated_at sits just after the
  // interview date; responded_at after that (NULL while pending).
  const joiningDate = dateFromNow(30);
  async function addOffer(driveId, studentIdx, packageLpa, companyName, driveTitle, status, respondedAt, generatedAt) {
    const letterText = buildOfferLetter({
      studentName: students[studentIdx][0],
      companyName,
      driveTitle,
      packageLpa,
      joiningDate,
    });
    await conn.query(
      `INSERT INTO offer_letters (drive_id, student_id, package_lpa, joining_date, letter_text, status, responded_at, generated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [driveId, studentIds[studentIdx], packageLpa, joiningDate, letterText, status, respondedAt, generatedAt]
    );
  }
  // Drive 8 (Business Analyst, 8.50 LPA): Nisha accepted, Ishita pending, Riya declined.
  await addOffer(drive8, 12, 8.50, 'FinServe Analytics', 'Business Analyst 2027', 'accepted', daysFromNow(-10, '11:00:00'), daysFromNow(-14, '10:00:00'));
  await addOffer(drive8, 7, 8.50, 'FinServe Analytics', 'Business Analyst 2027', 'pending', null, daysFromNow(-14, '10:00:00'));
  await addOffer(drive8, 18, 8.50, 'FinServe Analytics', 'Business Analyst 2027', 'declined', daysFromNow(-12, '10:30:00'), daysFromNow(-14, '10:00:00'));
  // Drive 9 (Software Developer, 7.50 LPA): Aisha accepted, Ananya pending.
  await addOffer(drive9, 20, 7.50, 'Tata Consultancy Services (TCS)', 'Software Developer 2027', 'accepted', daysFromNow(-18, '09:45:00'), daysFromNow(-21, '10:00:00'));
  await addOffer(drive9, 3, 7.50, 'Tata Consultancy Services (TCS)', 'Software Developer 2027', 'pending', null, daysFromNow(-21, '10:00:00'));

  // --- notifications ---
  // Wording mirrors the app's own notify() calls (pipeline.js for test /
  // result notices, bookings.js for waitlist notices, offers.js for the
  // recruiter's "accepted" notice). created_at is event-relative, never NOW.
  async function addNotification(userId, title, body, link, isRead, createdAt) {
    await conn.query(
      'INSERT INTO notifications (user_id, title, body, link, is_read, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      [userId, title, body, link, isRead, createdAt]
    );
  }

  // Drive 6: test scheduled for the 10 seated students.
  for (const [pos, idx] of [0, 1, 7, 9, 12, 13, 16, 18, 20, 2].entries()) {
    await addNotification(
      studentIds[idx],
      'Test scheduled: Data Analyst 2027',
      `Aptitude Test · Batch A · Lab A · ${fmtWhen(1, '10:00')}. Reach 15 minutes early with your ID card.`,
      `/student/drives/${drive6}`,
      [2, 5, 8].includes(pos) ? 1 : 0,
      daysFromNow(-1, `09:${String(30 + pos).padStart(2, '0')}:00`)
    );
  }
  // Drive 6 waitlist notices.
  await addNotification(studentIds[10], "You're #1 on the waiting list",
    "Aptitude Test · Batch A (Data Analyst 2027) is full — you're #1 on the waiting list. We'll let you know if a seat opens up.",
    '/student/bookings', 0, daysFromNow(-1, '09:45:00'));
  await addNotification(studentIds[4], "You're #2 on the waiting list",
    "Aptitude Test · Batch A (Data Analyst 2027) is full — you're #2 on the waiting list. We'll let you know if a seat opens up.",
    '/student/bookings', 0, daysFromNow(-1, '10:05:00'));

  // Drive 7: results — shortlisted get their interview time, two of the
  // rejected get the cutoff message.
  const d7InterviewInfo = [
    // [studentIdx, percentage, panel, room, startMin]
    [0, 80, 1, 'Interview Room 1', 600],
    [7, 90, 2, 'Interview Room 2', 620],
    [12, 80, 1, 'Seminar Room 1', 640],
    [18, 70, 2, 'Interview Room 1', 660],
    [13, 80, 1, 'Interview Room 2', 680],
    [1, 90, 2, 'Seminar Room 1', 700],
  ];
  for (const [i, [idx, percentage, panel, room, startMin]] of d7InterviewInfo.entries()) {
    await addNotification(
      studentIds[idx],
      'Shortlisted: Graduate Engineer Trainee 2027 🎉',
      `You scored ${percentage.toFixed(1)}%. Interview: ${fmtWhen(2, hhmm(startMin))} · Panel ${panel} · ${room}.`,
      `/student/drives/${drive7}`,
      [1, 4].includes(i) ? 1 : 0,
      daysFromNow(-4, `18:0${i}:00`)
    );
  }
  for (const [j, [idx, percentage]] of [[9, 50], [2, 40]].entries()) {
    await addNotification(
      studentIds[idx],
      'Result: Graduate Engineer Trainee 2027',
      `You scored ${percentage.toFixed(1)}% (cutoff 60%). You were not shortlisted this time — more drives are coming.`,
      `/student/drives/${drive7}`,
      j === 1 ? 1 : 0,
      daysFromNow(-4, `18:1${j}:00`)
    );
  }

  // Drives 8 + 9: offer letters are ready.
  const offerNotices = [
    // [studentIdx, driveId, driveTitle, companyName, packageLpa, isRead, daysAgo]
    [12, drive8, 'Business Analyst 2027', 'FinServe Analytics', 8.5, 1, -14],
    [7, drive8, 'Business Analyst 2027', 'FinServe Analytics', 8.5, 0, -14],
    [18, drive8, 'Business Analyst 2027', 'FinServe Analytics', 8.5, 1, -14],
    [20, drive9, 'Software Developer 2027', 'Tata Consultancy Services (TCS)', 7.5, 1, -21],
    [3, drive9, 'Software Developer 2027', 'Tata Consultancy Services (TCS)', 7.5, 0, -21],
  ];
  for (const [idx, driveId, driveTitle, companyName, pkg, isRead, daysAgo] of offerNotices) {
    await addNotification(
      studentIds[idx],
      `Offer letter: ${driveTitle}`,
      `Congratulations! Your offer letter for ${driveTitle} at ${companyName} is ready — a package of ₹${pkg} LPA, joining ${fmtLongDate(30)}. Open it to accept or decline.`,
      `/student/drives/${driveId}`,
      isRead,
      daysFromNow(daysAgo, '10:05:00')
    );
  }

  // Recruiters hear when an offer is answered.
  await addNotification(rahulId, 'Nisha Agarwal accepted the FinServe Analytics offer',
    'Nisha Agarwal accepted the offer for Business Analyst 2027 (FinServe Analytics).',
    `/recruiter/drives/${drive8}`, 0, daysFromNow(-10, '11:05:00'));
  await addNotification(nehaId, 'Aisha Sheikh accepted the Tata Consultancy Services (TCS) offer',
    'Aisha Sheikh accepted the offer for Software Developer 2027 (Tata Consultancy Services (TCS)).',
    `/recruiter/drives/${drive9}`, 0, daysFromNow(-18, '09:50:00'));

  // ---------- Wave 4: operations data ----------
  // Lab machines: a representative subset (not the full lab capacity),
  // as reported by the lab agent. last_seen is omitted on purpose so the
  // DEFAULT CURRENT_TIMESTAMP applies — machines look freshly reported
  // on a fresh reset (anything older than 5 minutes shows STALE).
  // Machine names are unique per lab, so pc01 in both labs is fine.
  const labMachines = [
    // [resourceId, machineName, status]
    ...['pc01', 'pc02', 'pc03', 'pc04', 'pc05', 'pc06', 'pc07'].map((n) => [labAId, n, 'free']),
    ...['pc08', 'pc09', 'pc10'].map((n) => [labAId, n, 'busy']),
    ...['pc01', 'pc02', 'pc03', 'pc04', 'pc05'].map((n) => [labBId, n, 'free']),
    ...['pc06', 'pc07'].map((n) => [labBId, n, 'busy']),
    [labBId, 'pc08', 'down'],
  ];
  for (const [resourceId, machineName, status] of labMachines) {
    await conn.query(
      'INSERT INTO lab_machines (resource_id, machine_name, status, reported_by) VALUES (?, ?, ?, ?)',
      [resourceId, machineName, status, 'lab-agent']
    );
  }

  // Manual events (resource calendar): hand-added bookings on different
  // days/resources from the seeded slots — the Data Analyst test is Lab A
  // on test day (+1) 10:00–11:00 and the Graduate Engineer Trainee
  // interviews are +2 from 10:00 in the interview rooms, so neither
  // event below can overlap them.
  const manualEvents = [
    // [resourceId, title, startsAt, endsAt]
    [labBId, 'Python Workshop', daysFromNow(3, '10:00:00'), daysFromNow(3, '12:00:00')],
    [seminarId, 'Guest Lecture: Careers in Data', daysFromNow(5, '14:00:00'), daysFromNow(5, '16:00:00')],
  ];
  for (const [resourceId, title, startsAt, endsAt] of manualEvents) {
    await conn.query(
      'INSERT INTO manual_events (resource_id, title, starts_at, ends_at, created_by) VALUES (?, ?, ?, ?, ?)',
      [resourceId, title, startsAt, endsAt, adminId]
    );
  }

  // Extra questions for the two new OPEN drives (Software Engineer 2027
  // TCS, Systems Engineer 2027 Infosys) — the ones students will
  // actually take live. No test_results exist for open drives, so adding
  // questions breaks no consistency. insertQuestions() resets a drive's
  // bank and totals, so append here instead and accumulate the
  // per-drive totals by hand.
  async function addMoreQuestions(driveId, qs) {
    for (const [text, options, correct, marks] of qs) {
      const [res] = await conn.query(
        `INSERT INTO test_questions (drive_id, question_text, options, correct_index, marks)
         VALUES (?, ?, ?, ?, ?)`,
        [driveId, text, JSON.stringify(options), correct, marks]
      );
      questionBank[driveId].push({ id: res.insertId, correct, marks });
      driveTotals[driveId] += marks;
    }
  }
  await addMoreQuestions(drive4, [
    ['A sum of Rs. 800 amounts to Rs. 920 in 3 years at simple interest. What is the rate of interest per annum?',
     ['4%', '5%', '6%', '7.5%'], 1, 1],
    ['Which of the following is a deadlock avoidance algorithm?',
     ["Banker's algorithm", 'Round Robin', 'FCFS', 'LRU'], 0, 2],
    ['In a relational database, a collection of related data organised as rows and columns is called a…',
     ['Table', 'View', 'Index', 'Schema'], 0, 1],
  ]);
  await addMoreQuestions(drive5, [
    ['The ratio of two numbers is 5:7. If each number is increased by 4, the ratio becomes 3:4. What is the larger number?',
     ['24', '28', '32', '35'], 1, 1],
    ['Which system call creates a new process in Unix/Linux?',
     ['fork()', 'exec()', 'wait()', 'exit()'], 0, 2],
    ['Which of the following is used to uniquely identify each row in a table?',
     ['Foreign key', 'Primary key', 'Index', 'View'], 1, 1],
  ]);

  console.log('Seeded: 5 users (admin+recruiters), 24 students, 4 companies, 9 drives,');
  console.log('        112 applications, 3 drive rounds, 64 test questions, 10 resources,');
  console.log('        44 test results, 7 slots, 18 bookings, 11 interview feedback,');
  console.log('        5 offer letters, 27 notifications, 18 lab machines, 2 manual events,');
  console.log('        10 exam PCs, 8 prohibited processes, 2 exam sessions, 4 monitoring');
  console.log('        events, 2 agent devices, 4 lock events.');
  console.log('All demo accounts use password: password123');
  console.log('Demo agent tokens (local demo only): LAB-A-PC01 dev-agent-token-pc01, LAB-A-PC02 dev-agent-token-pc02');
}

async function main() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    multipleStatements: false,
  });
  try {
    console.log('Recreating database campusflow ...');
    await conn.query('DROP DATABASE IF EXISTS campusflow');
    await conn.query('CREATE DATABASE campusflow CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
    await conn.query('USE campusflow');

    const schemaPath = path.join(__dirname, '..', '..', 'database', 'schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');
    for (const stmt of splitStatements(schema)) {
      // Skip comment-only chunks (the splitter can terminate a statement
      // early on a comment line that happens to end with the delimiter).
      const code = stmt
        .split('\n')
        .filter((l) => !l.trim().startsWith('--'))
        .join('\n')
        .trim();
      if (!code) continue;
      await conn.query(stmt);
    }
    console.log('Schema created (tables, triggers, procedure, view).');

    await seed(conn);

    // Fresh installs already contain every migration's objects (schema.sql
    // is the full schema, including all v2/v3/v4 additions), so record all
    // migration files as applied. Without this, `npm run db:migrate` after
    // a `npm run db:reset` would re-apply them against the fresh schema.
    await conn.query(
      `CREATE TABLE IF NOT EXISTS schema_migrations (
         version    VARCHAR(120) PRIMARY KEY,
         applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
       )`
    );
    const applied = discoverMigrations();
    for (const file of applied) {
      await conn.query('INSERT IGNORE INTO schema_migrations (version) VALUES (?)', [file]);
    }
    console.log(`Recorded ${applied.length} migration(s) as applied.`);
    console.log('Done.');
  } finally {
    await conn.end();
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error('Seed failed:', err.message);
    process.exit(1);
  });
}

module.exports = { main };
