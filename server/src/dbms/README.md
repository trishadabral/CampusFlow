# `src/dbms/` — DBMS concepts, as running code

Every file here implements one DBMS concept from the syllabus. The schema itself
(`database/schema.sql`) carries the rest: 3NF tables, keys, CHECK constraints, indexes,
audit triggers and the `sp_generate_shortlist` stored procedure.

| File | DBMS concept | Where it's used |
|---|---|---|
| `db.js` | **Connection pooling.** One shared pool (20 connections, FIFO queue) instead of per-request connections — the DB as a managed resource. | Every route and module |
| `transactions.js` | **ACID transactions.** `withTransaction(work)` wraps multi-statement writes in BEGIN … COMMIT with automatic ROLLBACK — all-or-nothing by construction. | Question-set saves, and the pattern every critical section follows |
| `eligibility.js` | **Declarative eligibility rules.** The JS mirror of `sp_generate_shortlist()`: one rule set evaluated two ways (SQL for batch, JS for per-student explanations). | Apply flow, eligible-student lists, wizard preview |
| `reports.js` | **Aggregate reporting queries.** JOINs, GROUP BY, conditional COUNTs and the `v_drive_report` view — the SQL behind the Control Center, the master schedule, the roster and the placement reports. | `GET /api/admin/*`, `GET /api/reports/placement` |

**Viva one-liners:**
- *Why a stored procedure for the shortlist?* — Set-based logic runs where the data lives:
  one indexed pass over applicants instead of N round-trips from Node.
- *Why does the pool matter?* — The stress test fires 200 concurrent bookings; without
  pooling, connection setup alone would serialize them.
- *What does the trigger audit give us?* — A tamper-evident history of every booking and
  application change, written by the database itself — the app can't forget to log.
