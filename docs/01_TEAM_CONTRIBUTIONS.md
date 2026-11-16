# Team Contributions — Phase 1 + Phase 2

What each member designed, built and owns in CampusFlow OS. Every module carries a real
OS concept, real DBMS work, and its own UI screens.

> **Phase 2 (2026-11-10):** all 14 planned features are built — see
> [02_PHASE2_PLAN.md](02_PHASE2_PLAN.md) and the walkthrough in
> [DEMO_SCRIPT.md](DEMO_SCRIPT.md). Phase 2 additions per member are listed in
> "Phase 2 additions" below; the Phase 1 record above is unchanged.

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
  and `healthCheck()` (powers the Live Monitor stats)
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
  interviews rotating across panels and rooms (`server/src/os/pipeline.js`)
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
- **CPU scheduling simulator** — `server/src/os/cpu-scheduler.js`: FCFS / Priority
  with waiting-time analysis (Round-Robin deliberately removed — preemptive time-slicing
  makes no sense for interviews)
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
  assigned rooms in rotation, straight from the inventory
- **Reports page** — placement progress per drive and per company
- **Lock observability** — `lock_events` table + `server/src/os/locks.js`: every acquire/wait/release
  is recorded with wait times (feeds the Live Monitor's booking activity)
- **Transactional writes** — `server/src/dbms/transactions.js`: `withTransaction()` plus the
  multi-statement operations that need it — question-set replacement and test-result recording
  (result row + status flip, never one without the other)
- **Audit-trail reads** — `server/src/dbms/audit.js`: recent activity, per-record history and
  GROUP-BY summaries over the trigger-written `audit_log` (powers the Live Monitor feed)

**OS concept:** resource-allocation graph, lock observability, deadlock avoidance.
**DBMS concept:** ACID transactions, audit-trail queries, views, audit triggers on allocations.

---

---

## Phase 2 additions (2026-11-10)

Shared foundation (all waves build on it): `database/migrate_v4.sql` (+ the
`schema.sql` mirror for fresh installs), `server/src/mailer.js` (email that never
crashes the request), `server/src/realtime.js` (Server-Sent Events live updates),
`server/src/utils/csv.js` (RFC 4180 CSV). Verified in the sandbox as far as
possible without MySQL: `node --check` on every changed server file, `g++`
compile of the lab agent, `vite build` passing, API boot + `/api/health` OK.
Live database runs (migrations, endpoints, browser flows) need a laptop with
MySQL — see [DEMO_SCRIPT.md](DEMO_SCRIPT.md).

### Ishika Rawat (M1) — communication & accounts
- **Email notifications** — `notifyUser()` in `server/src/mailer.js`; `pipeline.js`
  `notify()` delegates to it, so bell + email can never drift apart.
- **Password reset** — forgot/reset flow with 1-hour single-use tokens
  (`users.reset_token`), identical reply for unknown emails (no user-enumeration).
- **Student profiles** — editable page (photo, skills, resume PDF as base64 in
  the DB, no new upload dependency); server-side type/size validation.
- **Real-time updates** — SSE endpoint + `connectLive()` client helper; bell and
  student dashboard refresh live, 30 s polling kept as fallback.

### Akansha Parley (M2) — a fuller hiring process
- **Interviewer feedback forms** — one score per interviewer per student
  (UNIQUE key), consolidated scorecard (AVG + remarks) for the recruiter.
- **Multi-round process** — `drive_rounds` table, one active round at a time;
  publishing uses the active round's cutoff, single-round drives unchanged.
- **Offer letters** — server-side template, idempotent generation
  (`NOT EXISTS` + UNIQUE key), printable letter page with print-to-PDF.
- **Drive analytics** — score buckets, branch-wise shortlist rates, stage
  drop-off, all in `dbms/reports.js` (`analytics()`), plain div bars, no chart library.

### Trisha Dabral (M3) — deeper systems work
- **C++ lab-monitoring agent** — `agent/lab-agent.cpp` (g++, zero dependencies,
  POSIX sockets, `/proc/loadavg`); reports up/free/busy to
  `POST /api/lab-agent/report` (shared-key auth); scheduler prefers labs with
  the most free machines, capacity-only when no agent data exists.
- **Deadlock demo** — `server/src/os/deadlock-demo.js` (wait-for graph + DFS
  cycle detection, pure in-memory, demo-only data) in the Live Monitor;
  detection + recovery, victim = younger booking.
- **Audit log viewer** — searchable/filterable admin page (`/admin/audit`)
  wiring `dbms/audit.js` (`searchActivity`, `entityHistory`, `activitySummary`).

### Akshay Singh Gusain (M4) — operations at scale
- **Waitlist management** — full sessions take a waiting list; cancellation
  auto-promotes the next student under the same slot lock (capacity re-checked)
  and notifies them; pipeline auto-scheduler never waitlists.
- **Resource calendar** — week view of labs/rooms, click to create manual
  events, drag manual events to move them, strict interval-overlap check.
- **Report exports** — one-click CSV of drive reports and rosters reusing
  `reports.js` queries; print via the existing print stylesheet (no PDF library).
- **Placement statistics** — year-wise placement % (distinct students, not
  applications), average package from offer letters, top recruiters; safe
  empty states, never NaN.

## Merged from Ishika's CampusFlow (2026-11-16)

Ishika's repo had grown features this repo did not have; they were merged
here (locally, uncommitted at the time of writing) with Trisha's dark theme
and Phase 2 work kept intact. What landed, by owner:

- **Ishika Rawat (M1)** — exam monitoring: `server/src/socket.js`
  (Socket.IO live feed), `server/src/routes/agent.js` (Windows agent
  protocol: register / heartbeat / events, SHA-256 token auth, 15 s offline
  sweeper), `server/src/os/pc-allocator.js` (First Fit + Best Fit lab
  allocation under a row lock), `windows-agent/` (C++17 Windows service +
  desktop monitor), `scripts/agent-simulator.js` / `smoke-test.js` /
  `verify-phase3.js`, `docs/AGENT_API.md`, admin pages Exam Monitoring
  (`/admin/monitoring`) and Exam PCs (`/admin/exam-pcs`), and the new
  tables `computers`, `agent_devices`, `exam_sessions`,
  `monitoring_events`, `prohibited_processes` (migration `migrate_v7.sql`).
- **Recruiter workspace** — company profile page (`/recruiter/company`),
  inbox (`/recruiter/inbox`), applicants list with search/sort/pagination,
  bulk shortlist/reject, per-student offer extension and withdrawal
  (`server/src/routes/recruiter.js`, adapted onto this repo's
  `offer_letters` table), resume downloads with access control
  (`server/src/routes/resumes.js`, still base64-in-DB — no file storage).
- **Extra reports** — branch / company / package summaries + CSV exports
  (`server/src/routes/reportsExtra.js`, views `v_branch_placement`,
  `v_company_funnel`, `v_package_stats`), shown in a "More reports"
  section on the admin Reports page.
- **OS lab tools** — CPU scheduling run + compare (`/api/os/schedule`,
  now also SJF and SRTF — Round-Robin stays out by design), race-condition
  demo (`/api/os/race-demo`, scratch table `demo_seats`), run log
  (`os_runs`), corrected simulator tests.
- **Accounts & profiles** — public sign-up is now student-only (staff
  accounts are created by an admin from the Users page, which also gains
  activate/deactivate and password reset); `users.is_active` gate on
  login and token checks; student profiles gain phone, projects and
  certifications.
- **Student journey page** (`/student/journey`) — the full Applied → Test
  → Result → Interview timeline with offer accept/decline and application
  withdrawal; test page gains fullscreen and a submit confirmation.

Deliberately **not** merged: Ishika's "Campus Registrar" visual language
(dark theme kept), the drive/test approval workflow (dormant in her repo —
nothing ever sets `pending_approval`, and approving a drive would have
broken applications), her standalone `admin/*.js` sub-routers (unmounted
dead code with wrong `withTransaction`/`audit_log` signatures — the working
logic was ported into `admin.js`/`users.js` instead), Round-Robin
scheduling, disk-based resumes (multer), and the `offers` table (this repo's
`offer_letters` is the single offer system).

## How we worked

- One shared repo (`trishadabral/CampusFlow`), feature work in small commits on `main`
- Module boundaries from day one — each member owns their vertical end to end
- Every error message is a human sentence, never a stack trace; no dead buttons anywhere
