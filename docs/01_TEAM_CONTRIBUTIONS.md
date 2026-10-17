# Team Contributions — Phase 1

What each member designed, built and owns in CampusFlow OS. Every module carries a real
OS concept, real DBMS work, and its own UI screens.

---

## Ishika Rawat (Team Lead) — M1 · Platform Core & Data Foundation

**Owns:** the application's foundation — everything every other module stands on.

**Built:**
- **Database design** — the full 3NF schema (`database/schema.sql`): 14 tables, primary/foreign keys,
  CHECK constraints, indexes; audit triggers on bookings, applications and allocations
- **Migrations** — `server/src/dbms/migrations.js`: `migrate_*.sql` files upgrade a live database
  without wiping data, tracked in `schema_migrations` (`npm run db:migrate`)
- **Migrations** — `database/migrate_v2.sql` so existing installs upgrade cleanly
- **DB pool** — `server/src/dbms/db.js`: the shared connection pool, plus `tableCounts()`
  and `healthCheck()` (powers the System Monitor stats)
- **Banker's safety check** — `server/src/os/banker.js`: every manual booking runs the
  safe-sequence check; unsafe requests are refused *with an explanation of what would
  over-allocate*
- **Seed data** — 12 students (mixed CGPA/branches/backlogs), companies, drives, test questions,
  labs and interview rooms (`server/src/seed.js`)
- **Auth system** — register/login, JWT tokens, bcrypt password hashing, role-based access control
  (`requireRole` middleware: admin > recruiter > student)
- **App shell** — sidebar + topbar layout, role-based navigation, notification bell, login page
  with one-click demo logins
- **Shared UI kit** — buttons, cards, inputs, tables, badges, steppers, empty states, and the
  whole design system (`client/src/index.css`, `client/src/components/`)
- **API layer** — the single Axios client every page uses (`client/src/api.js`)
- **Users page** — admin directory of all accounts

**OS concept:** privilege rings (RBAC), the request-as-process model, connection pooling as
resource management.
**DBMS concept:** ER → 3NF normalization, keys, constraints, indexes, triggers, seed/migration
discipline.

---

## Akansha Parley — M2 · Drives, Eligibility & Interview Scheduling

**Owns:** the placement pipeline itself — drives, tests, shortlisting and interviews.

**Built:**
- **Eligibility engine** — `checkEligibility()` plus the `sp_generate_shortlist()` stored procedure;
  every verdict comes with reasons. `findEligibleStudents()` (`server/src/dbms/eligibility.js`)
  enforces the same rules as one indexed SQL query — the wizard preview and eligible-student
  views filter in the database, not in Node
- **Drive APIs** — create/list/detail/apply, eligibility preview, question management
  (`server/src/routes/drives.js`)
- **Add Drive wizard** — 4 guided steps: details + eligibility → test-question builder →
  interview setup → review with a live eligible-student count
- **Recruiter drive dashboard** — pipeline tracker, funnel stats, one-click scheduling actions,
  eligible-student table, results leaderboard, final selection
- **Test system** — recruiter question builder; student test-taker UI (timed, one question at a
  time, auto-submit); instant auto-grading (`submitTest`)
- **Interview scheduling engine** — shortlists by score (cutoff + top-N cap), then timetables
  interviews round-robin across panels and rooms (`server/src/os/pipeline.js`)
- **Student journey UI** — open-drives browsing (every published drive appears; eligibility is
  a badge, never a filter), 1-click apply, visual progress tracker
  (Applied → Test → Result → Interview), My Schedule page

**OS concept:** batch-job scheduling (the pipeline drains queues as jobs).
algorithms for interview ordering.
**DBMS concept:** stored procedures, eligibility as indexed queries, views for reports.

---

## Trisha Dabral — M3 · Synchronization & Concurrency Control

**Owns:** correctness under concurrency — the reason 100 students can race for 10 seats and
exactly 10 win.

**Built:**
- **Booking critical section** — `bookSeat()` (`server/src/os/critical-section.js`): one transaction,
  `SELECT … FOR UPDATE` row lock on the slot, seat insert + counter bump atomically; the database
  lock (not app code) is the single source of truth
- **Pipeline seat assignment** — the auto-scheduler books every test/interview seat through the
  same serialized primitive, so system-driven booking is just as safe as manual booking
- **System Monitor UI** — now the **Live Monitor**: plain-language live activity feed
  ("who's booking right now", "recent activity", rush-hour test), no OS jargon on screen;
  still the demo surface for the viva
- **Stress test** — `POST /api/monitor/stress`: fires N concurrent booking attempts and proves
  `confirmed = min(attempts, seats)` with zero oversell
- **Notifications backend** — the inbox tables and APIs students rely on for schedules and results
- **CPU scheduling simulator** — `server/src/os/cpu-scheduler.js`: FCFS / Priority / Round-Robin
  with Gantt output and waiting-time analysis (Round-Robin kept in the simulator for
  resource-management experiments; interview scheduling uses Priority / FCFS only)
- **Interview Scheduler** — `POST /schedule/auto` (`server/src/routes/schedule.js`): pick a drive
  and the system timetables its shortlisted students — priority from marks (highest CGPA
  first) or application order, a lab reserved for the whole window via the Banker's safety
  check, real interview slots written in one transaction; `DELETE /schedule/auto/:id`
  regenerates cleanly. UI: drive picker, ordering rule, lab booking verdict, timetable and
  rule comparison — no manual candidate entry, no Round-Robin
- **Reporting queries** — `server/src/dbms/reports.js`: all aggregate queries (JOIN + GROUP BY,
  conditional counts, the `v_drive_report` view) behind the Control Center and Reports page

**OS concept:** mutexes, critical sections, lock waits, process-safe resource sharing.
**DBMS concept:** ACID transactions, row-level locking, isolation behavior.

---

## Akshay Singh Gusain — M4 · Resource Allocation & Control Center

**Owns:** the physical inventory the pipeline runs on, and the admin's view of everything.

**Built:**
- **Resource inventory** — labs (with seating capacity), interview rooms, interviewers
  (`server/src/routes/resources.js`); admin UI to add and manage them
- **Admin Control Center** — all drives with stage + progress, one-click pipeline actions,
  full schedule of every test/interview session, per-applicant roster
- **Pipeline resource wiring** — test sessions are batched into labs by capacity; interviews are
  assigned rooms round-robin, straight from the inventory
- **Reports page** — placement progress per drive and per company
- **Lock observability** — `lock_events` table + `server/src/os/locks.js`: every acquire/wait/release
  is recorded with wait times (feeds the System Monitor's live lock table)
- **Transactional writes** — `server/src/dbms/transactions.js`: `withTransaction()` plus the
  multi-statement operations that need it — question-set replacement and test-result recording
  (result row + status flip, never one without the other)
- **Audit-trail reads** — `server/src/dbms/audit.js`: recent activity, per-record history and
  GROUP-BY summaries over the trigger-written `audit_log` (powers the System Monitor feed)

**OS concept:** resource-allocation graph, lock observability, deadlock avoidance.
**DBMS concept:** ACID transactions, audit-trail queries, views, audit triggers on allocations.

---

## How we worked

- One shared repo (`trishadabral/CampusFlow`), feature work in small commits on `main`
- Module boundaries from day one — each member owns their vertical end to end
- Every error message is a human sentence, never a stack trace; no dead buttons anywhere
