# Module Split — 4 Members, Equal Weight, OS + DBMS in Every Module

Principle: **nobody owns "just frontend" or "just DB".** Each member owns one vertical module with a
genuine OS concept, genuine DBMS work, the UI screens for it, and the viva questions for it.
Workload is balanced: ~2–3 API areas + 2–4 screens + 1 doc each.

---

## M1 — Platform Core & Data Foundation → Ishika Rawat (Team Lead)

**OS content:** the request-as-process model (every API call = a process with lifecycle states shown
in the monitor); RBAC as privilege rings (admin > recruiter > student); DB connection pooling as
resource management.
**DBMS content:** ER model → 3NF schema, keys, constraints, indexes, audit triggers, seed data,
migrations.
**Builds:**
- `database/schema.sql`, `database/seed.sql`, `docs/ER_DIAGRAM.md`
- Auth: register/login, JWT + bcrypt, `requireRole` middleware (`server/src/middleware/auth.js`)
- App shell: layout, sidebar, topbar, login page with role demo buttons (`client/src/...`)
- Users admin screen
**Viva owns:** normalization (1NF→3NF on our tables), primary vs foreign keys, what each constraint
guarantees, why we index `(drive_id, status)`, JWT vs sessions, connection pooling.

## M2 — Drives, Eligibility & Interview Scheduling → Akansha Parley

**OS content:** shortlisting as *batch-job scheduling* — applications queue up, the engine drains the
queue as one job; **CPU scheduling (FCFS / Priority / Round-Robin)** for interview ordering, with
Gantt chart and waiting-time analysis.
**DBMS content:** `sp_generate_shortlist()` stored procedure, eligibility as a single indexed query,
`EXPLAIN` plan shown in UI, views for recruiter reports.
**Builds:**
- `POST /api/drives`, `GET /api/drives`, `POST /api/drives/:id/shortlist`, `POST /api/drives/:id/apply`
- Drive creation wizard + criteria builder UI, drive detail page, shortlist results table with
  per-student pass/fail reasons, student "am I eligible?" verdict badge
- `POST /api/schedule/simulate` + Scheduling Lab UI (algorithm picker, Gantt chart,
  avg-waiting-time comparison across algorithms)
**Viva owns:** stored procedure vs application-side logic (why the shortlist lives in SQL),
how the eligibility query uses indexes, what `EXPLAIN` shows, view vs table, comparing FCFS /
Priority / Round-Robin on interview data, reading a Gantt chart, why the RR quantum matters.

## M3 — Synchronization & Concurrency Control → Trisha Dabral

**OS content:** mutex + critical section around seat booking; process states (ready/waiting) in the
Kernel Monitor.
**DBMS content:** booking as one ACID transaction, `SELECT … FOR UPDATE` row locking, isolation
levels (configurable `READ COMMITTED` vs `REPEATABLE READ`), deadlock error handling + retry.
**Builds:**
- `POST /api/slots`, `GET /api/slots`, `POST /api/bookings` (transactional), `DELETE /api/bookings/:id`
- `GET /api/monitor/locks`, `POST /api/monitor/stress`, `GET /api/monitor/activity`
- Slot booking UI, Kernel Monitor UI (lock table, queues, txn log tail), Stress Test panel
**Viva owns:** the race condition (what breaks without the lock — demo it), mutex vs semaphore,
critical section boundaries in the booking code, isolation levels and phantom reads, why the DB
row lock (not an app mutex) is the single source of truth.

## M4 — Resource Allocation & Control Center → Akshay Singh Gusain

**OS content:** resource-allocation graph, **Banker's-algorithm safety check** on every allocation;
resource inventory as OS-managed resources.
**DBMS content:** aggregate reporting queries (joins + GROUP BY), summary views, audit triggers on
allocations, transaction-safe allocation writes.
**Builds:**
- `GET/POST /api/resources`, `POST /api/allocations` (with safety check), `GET /api/allocations`,
  `GET /api/reports/placement`, `GET /api/monitor/stats`
- Resources inventory UI, allocation board (book lab/room/interviewer for a slot), admin dashboard
  with stat cards, reports page, unsafe-allocation explanation banner
**Viva owns:** Banker's algorithm walkthrough on our data (safe sequence), deadlock prevention vs
avoidance vs detection (which one we implement and why), aggregate query design, what the audit
trigger records.

---

## Shared ownership (all four)

- `docs/03_PHASE1_PLAN.md` demo script — everyone rehearses the full 10-minute demo.
- Code review: every PR needs one reviewer from another module.
- Phase 1 rehearsal: each member demos *their* module live; anyone can be asked anything.

## Work log (for the evaluation report)

Each member keeps a 5-line weekly log in `docs/WORKLOG.md`: what I built, what OS concept it shows,
what DBMS concept it shows. Evaluators love this — it maps effort to syllabus directly.
