# Architecture — how CampusFlow fits together

Updated 2026-11-16 (merge of Ishika's CampusFlow, `a5c250b`). For who built
what, see [01_TEAM_CONTRIBUTIONS.md](01_TEAM_CONTRIBUTIONS.md); for setup,
see [03_INSTALLATION.md](03_INSTALLATION.md).

## Big picture

```
Browser (React + Vite) ──HTTPS/JSON──> Express API (Node) ──SQL──> MySQL 8 / MariaDB
        │                                     │  Socket.IO live feed
        │                                     │  (admins room)
        │                              Lab agents ──┘
```

- **Client** (`client/`): React + Vite + Tailwind, React Router, Axios, plus
  `socket.io-client` (Exam Monitoring live feed) and `lucide-react` icons.
  Dark theme throughout: navy `#0B0E1A`, coral `#FF5C38`, cyan `#22D3EE`.
- **Server** (`server/src/`): Express + JWT auth + bcrypt. Thin routes in
  `routes/`; the real logic lives in `os/` (OS concepts) and `dbms/` (DBMS
  concepts). `socket.js` runs the Socket.IO feed; `realtime.js` runs the
  older Server-Sent Events feed (`GET /api/events`) — both exist, the bell
  uses SSE, Exam Monitoring uses Socket.IO.
- **Database** (`database/schema.sql`, migrations `migrate_v2.sql` …
  `migrate_v7.sql`): 26 tables, 4 views, audit triggers, the
  `sp_generate_shortlist` procedure. `npm run db:reset` rebuilds everything
  + demo data; `npm run db:migrate` upgrades a live database in order.

## The database (26 tables, 4 views)

| Group | Tables |
|---|---|
| Accounts | `users` (`is_active` gate), `students` (phone / projects / certifications) |
| Placement core | `companies` (description / location / industry / HR contact), `drives`, `drive_rounds`, `applications` (incl. `withdrawn`), `test_questions`, `test_results` (`tab_switches`), `interview_feedback`, `offer_letters` (incl. `withdrawn`) |
| Scheduling & inventory | `resources`, `lab_machines`, `slots`, `bookings`, `allocations`, `manual_events` |
| Observability | `notifications`, `audit_log`, `lock_events` |
| Exam monitoring (v7) | `computers`, `agent_devices`, `exam_sessions`, `prohibited_processes`, `monitoring_events` |
| OS-lab runs (v7) | `os_runs`, `demo_seats` |

Views: `v_drive_report` (one row per drive — the placement report),
`v_branch_placement`, `v_company_funnel`, `v_package_stats` (the "More
reports" section). The full picture, with keys and relationships, is in
`docs/archive/ER_DIAGRAM.md` — it predates the v7 tables, so treat the table
list above as current and the archived diagram as the Phase 1 shape.

## The pipeline (the core idea)

Recruiter creates a drive → uploads test questions → sets interview params.
The engine then: batches applicants into lab test sessions (seats assigned
inside a serialized critical section, `SELECT … FOR UPDATE` in
`os/critical-section.js` — the database lock is the mutex), auto-grades,
shortlists by score (cutoff + top-N cap, `os/pipeline.js`), timetables
interviews rotating across panels × rooms, and notifies students at every
step (in-app bell first, email best-effort after the database work commits).

## Exam monitoring flow (merged 2026-11-16)

```
Windows agent (or scripts/agent-simulator.js)
   │ enrol once:  POST /api/agent/register  {enrollment_code} -> agent token (SHA-256 stored)
   │ every 5 s:   POST /api/agent/heartbeat {foreground_title, foreground_process}
   │              <- {session, prohibited_processes}   (server is authoritative)
   │ on violation: POST /api/agent/events   (only while a session is active)
   ▼
Server sweeper (every 5 s): no heartbeat for 15 s -> agent offline
   (+ AGENT_DISCONNECTED / AGENT_RECONNECTED events around active sessions)
   ▼
Socket.IO: agent:status / agent:event / session:update -> admins room
   ▼
Admin pages: Exam Monitoring (/admin/monitoring) + Exam PCs (/admin/exam-pcs)
```

PC allocation (`os/pc-allocator.js`, First Fit + Best Fit) hands out an exam
PC under a row lock: `POST /api/admin/exam-sessions`, then `/start` and
`/end` move the session through its lifecycle. Full protocol:
[AGENT_API.md](AGENT_API.md). The Windows agent itself
(`windows-agent/`, C++17 service + desktop monitor) has not been built from
this repo yet — see [KNOWN_ISSUES.md](KNOWN_ISSUES.md).

## The other agents

- **C++ lab agent** (`agent/lab-agent.cpp`): reports lab-machine liveness
  (free/busy from `/proc/loadavg`) to `POST /api/lab-agent/report` with a
  shared key. The scheduler *prefers* labs with free machines; capacity is
  the fallback. This is the scheduling agent — different from the Windows
  exam agent above.
- **CPU scheduler** (`os/cpu-scheduler.js`): FCFS / Priority / SJF / SRTF
  simulators — `POST /api/os/schedule/run` and `/compare`. Round-Robin is
  deliberately not offered.

## Admin navigation (7 items)

Control Center, Live Monitor, Resources, Reports, Users, **Exam Monitoring**,
**Exam PCs**. Three pages exist by direct URL only (not on the sidebar):
Interview Scheduler (`/admin/scheduling`), Room calendar (`/admin/calendar`),
Activity log (`/admin/audit`).

## Verification status (2026-11-16)

115/115 endpoint checks pass on a real MariaDB 10.11 database, `npm test`
10/10, frontend build passes, `db:reset` + `db:migrate` clean including the
v7 upgrade path. Not verified here: browser-only flows (tab-switch,
fullscreen, live Socket.IO feed), the Windows agent build, and Docker MySQL 8
as the final proof — see [KNOWN_ISSUES.md](KNOWN_ISSUES.md).
