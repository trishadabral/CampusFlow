// Seed script: recreates the campusflow database from database/schema.sql
// (idempotent — drops the DB first), then inserts demo data.
// Usage: npm run db:seed   (or: node src/seed.js)
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');

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

  await addUser('Placement Officer', 'admin@campusflow.local', 'admin');
  const priyaId = await addUser('Priya Nair', 'priya@techcorp.com', 'recruiter');
  const rahulId = await addUser('Rahul Mehta', 'rahul@finserve.com', 'recruiter');

  // ---------- students (user + student rows) ----------
  const students = [
    ['Aarav Sharma', 'aarav@student.local', '2418001', 'CSE', 9.1, 0],
    ['Diya Patel', 'diya@student.local', '2418002', 'CSE', 8.4, 0],
    ['Kabir Singh', 'kabir@student.local', '2418003', 'IT', 8.8, 1],
    ['Ananya Iyer', 'ananya@student.local', '2418004', 'ECE', 7.6, 0],
    ['Vikram Rao', 'vikram@student.local', '2418005', 'CSE', 7.9, 2],
    ['Sneha Kulkarni', 'sneha@student.local', '2418006', 'IT', 6.8, 1],
    ['Arjun Nair', 'arjun@student.local', '2418007', 'ME', 7.2, 0],
    ['Ishita Verma', 'ishita@student.local', '2418008', 'CSE', 9.4, 0],
    ['Rohan Gupta', 'rohan@student.local', '2418009', 'ECE', 6.5, 3],
    ['Meera Joshi', 'meera@student.local', '2418010', 'IT', 8.1, 0],
    ['Aditya Rao', 'aditya@student.local', '2418011', 'CSE', 7.4, 1],
    ['Pooja Reddy', 'pooja@student.local', '2418012', 'ECE', 8.9, 0],
  ];
  const studentIds = [];
  for (const [name, email, roll, branch, cgpa, backlogs] of students) {
    const id = await addUser(name, email, 'student');
    await conn.query(
      'INSERT INTO students (user_id, roll_no, branch, cgpa, backlogs, graduation_year) VALUES (?, ?, ?, ?, ?, ?)',
      [id, roll, branch, cgpa, backlogs, 2027]
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

  // ---------- drives ----------
  const [d1] = await conn.query(
    `INSERT INTO drives (company_id, title, min_cgpa, allowed_branches, max_backlogs,
                         graduation_year, application_deadline, status, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      c1.insertId,
      'SDE Role 2027',
      8.0,
      JSON.stringify(['CSE', 'IT']),
      0,
      2027,
      '2026-11-30 23:59:59',
      'open',
      priyaId,
    ]
  );
  const [d2] = await conn.query(
    `INSERT INTO drives (company_id, title, min_cgpa, allowed_branches, max_backlogs,
                         graduation_year, application_deadline, status, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      c2.insertId,
      'Analyst 2027',
      7.0,
      JSON.stringify(['CSE', 'IT', 'ECE']),
      1,
      2027,
      '2026-12-15 23:59:59',
      'open',
      rahulId,
    ]
  );
  const [d3] = await conn.query(
    `INSERT INTO drives (company_id, title, min_cgpa, allowed_branches, max_backlogs,
                         graduation_year, application_deadline, status, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      c1.insertId,
      'Summer Intern 2026',
      7.5,
      JSON.stringify(['CSE', 'IT']),
      0,
      2026,
      '2026-05-31 23:59:59',
      'closed',
      priyaId,
    ]
  );
  const drive1 = d1.insertId;
  const drive2 = d2.insertId;
  const drive3 = d3.insertId;

  // ---------- applications ----------
  // Drive 1: all 12 students applied (the eligibility engine will shortlist them).
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

  // ---------- slots ----------
  const [s1] = await conn.query(
    `INSERT INTO slots (drive_id, type, title, starts_at, ends_at, capacity)
     VALUES (?, 'test', ?, ?, ?, ?)`,
    [drive1, 'Online Assessment — Slot A', '2026-11-03 10:00:00', '2026-11-03 12:00:00', 60]
  );
  await conn.query(
    `INSERT INTO slots (drive_id, type, title, starts_at, ends_at, capacity)
     VALUES (?, 'interview', ?, ?, ?, ?)`,
    [drive1, 'Technical Interview — Slot A', '2026-11-05 10:00:00', '2026-11-05 13:00:00', 10]
  );
  await conn.query(
    `INSERT INTO slots (drive_id, type, title, starts_at, ends_at, capacity)
     VALUES (?, 'test', ?, ?, ?, ?)`,
    [drive2, 'Aptitude Test', '2026-11-10 09:00:00', '2026-11-10 11:00:00', 40]
  );
  const testSlotA = s1.insertId;

  // ---------- bookings: 2 sample bookings on the test slot ----------
  for (const sid of studentIds.slice(0, 2)) {
    await conn.query('INSERT INTO bookings (slot_id, student_id) VALUES (?, ?)', [
      testSlotA,
      sid,
    ]);
    await conn.query('UPDATE slots SET booked_count = booked_count + 1 WHERE id = ?', [testSlotA]);
  }

  // ---------- resources ----------
  const resources = [
    ['Lab A', 'lab', 60, 'Block C, Floor 2'],
    ['Lab B', 'lab', 40, 'Block C, Floor 1'],
    ['Seminar Room 1', 'room', 1, 'Admin Block'],
    ['Interview Room 1', 'room', 1, 'Placement Cell'],
    ['Interview Room 2', 'room', 1, 'Placement Cell'],
    ['Prof. Sharma', 'interviewer', 1, 'CSE Dept'],
    ['Prof. Iyer', 'interviewer', 1, 'ECE Dept'],
  ];
  for (const [name, type, capacity, location] of resources) {
    await conn.query('INSERT INTO resources (name, type, capacity, location) VALUES (?, ?, ?, ?)', [
      name,
      type,
      capacity,
      location,
    ]);
  }

  console.log('Seeded: 3 users (admin+recruiters), 12 students, 2 companies, 3 drives,');
  console.log('        24 applications, 3 slots, 2 bookings, 7 resources.');
  console.log('All demo accounts use password: password123');
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
