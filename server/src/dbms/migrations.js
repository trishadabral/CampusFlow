// DBMS — schema migrations (DDL versioning).
//
// database/schema.sql is the full schema for fresh installs (npm run db:reset
// drops and rebuilds everything). database/migrate_*.sql upgrade an EXISTING
// database without wiping its data. This module tracks which migrations have
// run in the schema_migrations table and applies pending ones in filename
// order. Usage: npm run db:migrate
//
// Honest limitation, worth knowing for the viva: MySQL auto-commits DDL, so
// a migration file is NOT one atomic transaction — statements apply one by
// one, and a failure stops the run WITHOUT recording the file, making it
// safe to fix and re-run.

const fs = require('fs');
const path = require('path');
const pool = require('./db');

const MIGRATIONS_DIR = path.join(__dirname, '..', '..', '..', 'database');

async function ensureMigrationsTable() {
  await pool.query(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
       version    VARCHAR(120) PRIMARY KEY,
       applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
     )`
  );
}

function discoverMigrations() {
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => /^migrate_.*\.sql$/i.test(f))
    .sort();
}

// Split a .sql file into executable statements, honouring DELIMITER lines
// (same approach as the seed script).
function splitStatements(sql) {
  const statements = [];
  let delimiter = ';';
  let current = '';
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  for (const line of sql.split('\n')) {
    const trimmed = line.trim();
    const m = trimmed.match(/^DELIMITER\s+(.+)$/i);
    if (m) {
      delimiter = m[1].trim();
      continue;
    }
    current += line + '\n';
    if (new RegExp(esc(delimiter) + '\\s*$').test(trimmed)) {
      current = current.replace(new RegExp(esc(delimiter) + '\\s*$'), '').trim();
      if (current) statements.push(current);
      current = '';
    }
  }
  if (current.trim()) statements.push(current.trim());
  return statements;
}

function isCommentOnly(stmt) {
  const code = stmt
    .split('\n')
    .filter((l) => !l.trim().startsWith('--'))
    .join('\n')
    .trim();
  return !code;
}

// Versions already applied to this database.
async function appliedVersions() {
  await ensureMigrationsTable();
  const [rows] = await pool.query('SELECT version FROM schema_migrations ORDER BY version');
  return rows.map((r) => r.version);
}

// Migration files not yet applied, in order.
async function pendingMigrations() {
  const applied = new Set(await appliedVersions());
  return discoverMigrations().filter((f) => !applied.has(f));
}

// MySQL has no "ADD COLUMN IF NOT EXISTS", so an ALTER TABLE that re-adds
// an existing column / index / constraint fails. A migration file re-run
// against a database that already has the object is therefore NOT an error:
// these errnos all mean "already there", so the statement is skipped and the
// run continues. Anything else still aborts the run (and the file is NOT
// recorded as applied, so it is safe to fix and re-run).
const ALREADY_EXISTS_ERRNOS = new Set([
  1050, // ER_TABLE_EXISTS_ERROR — CREATE TABLE on an existing table
  1060, // ER_DUP_FIELDNAME — ADD COLUMN for a column that exists
  1061, // ER_DUP_KEYNAME — ADD INDEX for an index that exists
  1068, // ER_MULTIPLE_PRI_KEY — ADD PRIMARY KEY when one exists
  1826, // ER_DUP_FK_NAME — ADD CONSTRAINT for a FK name that exists
]);

// Apply every pending migration. Returns the list of versions applied.
async function migrate() {
  const pending = await pendingMigrations();
  const appliedNow = [];
  for (const file of pending) {
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    for (const stmt of splitStatements(sql)) {
      if (isCommentOnly(stmt)) continue;
      try {
        await pool.query(stmt);
      } catch (err) {
        if (ALREADY_EXISTS_ERRNOS.has(err.errno)) {
          console.log(`  (${file}: already applied, skipped — ${err.message})`);
          continue;
        }
        throw err;
      }
    }
    await pool.query('INSERT INTO schema_migrations (version) VALUES (?)', [file]);
    appliedNow.push(file);
  }
  return appliedNow;
}

module.exports = { migrate, pendingMigrations, appliedVersions, discoverMigrations };
