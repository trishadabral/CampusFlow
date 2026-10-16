# `src/dbms/` — DBMS concepts, as running code

Every file here implements DBMS concepts from the syllabus, with real SQL. The schema
itself (`database/schema.sql`) carries the rest: 3NF tables, keys, CHECK constraints,
indexes, audit triggers, the `sp_generate_shortlist` procedure and the `v_drive_report` view.

| File | DBMS concept | Owner | Where it's used |
|---|---|---|---|
| `db.js` | **Connection pooling.** One shared pool (20 connections, FIFO queue) instead of per-request connections — the DB as a managed resource. | Ishika (M1) | Every route and module |
| `migrations.js` | **Schema versioning (DDL management).** `migrate_*.sql` files upgrade a live database without wiping data; applied versions are tracked in `schema_migrations`. Fresh installs still use `npm run db:reset`; upgrades use `npm run db:migrate`. | Ishika (M1) | `npm run db:migrate` |
| `transactions.js` | **ACID transactions.** `withTransaction(work)` wraps multi-statement writes in BEGIN … COMMIT with automatic ROLLBACK — all-or-nothing by construction. | Trisha (M3) | Question-set saves, and the pattern every critical section follows |
| `audit.js` | **Audit-trail reads.** Triggers write every mutation to `audit_log`; this module reads it back — recent activity, per-record history (via `idx_audit_entity`), and GROUP-BY summaries. | Trisha (M3) | System Monitor activity feed; Phase-2 audit viewer |
| `eligibility.js` | **Set-based eligibility.** The drive rules in two forms: `checkEligibility()` explains *why* per student, and `findEligibleStudents()` enforces the same rules as ONE indexed query (`JSON_CONTAINS` on the branches array) — the filter runs in the database, not in Node. | Akansha (M2) | Apply flow, wizard preview, eligible-students view |
| `reports.js` | **Aggregate reporting queries.** JOINs, GROUP BY, conditional COUNTs and the `v_drive_report` view — the SQL behind the Control Center, master schedule, roster and placement reports. | Akshay (M4) | `GET /api/admin/*`, `GET /api/reports/placement` |

**Viva one-liners:**
- *Why a stored procedure / single query for eligibility?* — Set-based logic runs where the
  data lives: one indexed pass over applicants instead of N round-trips from Node.
- *Why does the pool matter?* — The stress test fires 200 concurrent bookings; without
  pooling, connection setup alone would serialize them.
- *What does the trigger audit give us?* — A tamper-evident history of every booking and
  application change, written by the database itself — the app can't forget to log.
- *Why migrations instead of drop-and-recreate?* — `db:reset` wipes data; migrations evolve
  a live database. And know the honest limit: MySQL auto-commits DDL, so a migration file
  is applied statement-by-statement, not as one atomic transaction.
