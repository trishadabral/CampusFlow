# Phase 2 Plan — Next Evaluation

**Status (2026-11-10): all 14 features built and committed on `main` (locally —
run `git push origin main` from a machine with credentials).** Each feature
below is marked ✅ with the files that implement it. Full walkthrough:
[docs/DEMO_SCRIPT.md](DEMO_SCRIPT.md). Foundation shared by all waves:
`database/migrate_v4.sql` (+ `schema.sql` mirror), `server/src/mailer.js`
(email, best-effort), `server/src/realtime.js` (SSE live updates),
`server/src/utils/csv.js`.

**Completion pass (2026-11-15):** an audit of the built app found broken,
unwired and mismatched pieces, all fixed on `main` (locally, not yet pushed):
broken defects B1–B6 (resource badge crash, dead Live Monitor lock table,
audit details crash, allocate seats ignored, audit actor never recorded,
non-idempotent migrations); unwired features U1–U6 (book-a-seat buttons,
per-drive CSV, dead API helpers, Gantt chart, waitlisted sessions visible,
slot venue); mismatches M1–M5 (drive package, rush-test bounds, feedback
round, open endpoints now authenticated + recruiter drives scoped) and
notifications moved after DB work so a mail failure can't half-finish
scheduling; UI polish P1–P7 (responsive sidebar, loading + error states,
plain-words copy, responsive grids). Six new placement features, also in
[docs/DEMO_SCRIPT.md](DEMO_SCRIPT.md) Act 5: book-a-seat, package (LPA),
"why am I eligible?" explainer, offer accept/decline (`offer_letters.status`,
`migrate_v5.sql`), feedback reminders, student next-action card. End-to-end
verification still needs a laptop run with MySQL — see the demo script.

Phase 1 delivered the complete core loop: drive → test → shortlist → interview, all working
end to end. Phase 2 deepens it into a product a real placement cell could run on, plus the
items we deliberately parked.

Each feature has one owner — the member whose module it extends.

---

## Ishika (M1 · Platform) — communication & accounts

| Feature | What it does |
|---|---|
| **Email notifications** ✅ | Students get drive invites, test reminders and results by email (SMTP), alongside the in-app bell — `server/src/mailer.js` (`notifyUser`), `server/src/os/pipeline.js` (`notify()` delegates to it). In-app behaviour unchanged; unconfigured SMTP = in-app only. |
| **Password reset** ✅ | "Forgot password" flow with email reset links — `server/src/routes/auth.js` (`POST /auth/forgot-password`, `POST /auth/reset-password`), `client/src/pages/ForgotPassword.jsx`, `ResetPassword.jsx`; token (1 h, single-use) in `users.reset_token`. |
| **Student profiles** ✅ | Editable profile page: photo, skills, resume PDF upload — `server/src/routes/student.js` (`GET/PUT /api/student/profile`, `GET /api/student/profile/resume`), `client/src/pages/student/StudentProfile.jsx`; base64 in DB, no new upload dependency. |
| **Real-time updates** ✅ | Dashboard refreshes live when results publish (no manual reload) — `server/src/realtime.js` (SSE, `GET /api/events`, `publish()`), `client/src/realtime.js` (`connectLive`), wired in `Layout.jsx`; 30 s polling kept as fallback. |

## Akansha (M2 · Pipeline) — a fuller hiring process

| Feature | What it does |
|---|---|
| **Interviewer feedback forms** ✅ | After each interview, the panel submits scores + remarks; the recruiter sees a consolidated scorecard — `server/src/routes/drives.js` (`POST/GET /api/drives/:id/feedback`, upsert on UNIQUE key), "Interview notes" + "Scorecard" in `client/src/pages/recruiter/RecruiterDriveDetail.jsx`. |
| **Multi-round process** ✅ | Drives can have several rounds (e.g. aptitude → technical → HR), each with its own cutoff — `drive_rounds` table, `server/src/routes/drives.js` (rounds endpoints, one active at a time), `server/src/os/pipeline.js` (`publishResults` uses the active round's cutoff, else the drive cutoff). |
| **Offer letters** ✅ | Generate offer letters for selected students from a template — `server/src/os/offer-letter.js` (template), `server/src/routes/drives.js` (`POST /api/drives/:id/offers/generate`, idempotent), `server/src/routes/offers.js`, `client/src/pages/recruiter/OfferLetter.jsx` (printable, print-to-PDF). |
| **Drive analytics** ✅ | Per-drive charts: score distribution, branch-wise shortlist rates, drop-off between stages — `server/src/dbms/reports.js` (`analytics()`), `GET /api/reports/drives/:id/analytics`, "How this drive is doing" in `RecruiterDriveDetail.jsx` (plain div bars, no chart library). |

## Trisha (M3 · Concurrency) — deeper systems work

| Feature | What it does |
|---|---|
| **C++ lab-monitoring agent** ✅ | *Parked in Phase 1 — headline Phase 2 item.* A small C++ agent that reports lab machine status (up/free/busy) to the scheduler, so test sessions are placed on actually-free machines — `agent/lab-agent.cpp` (g++, no deps, POSIX sockets), `agent/README.md`, `server/src/routes/lab-agent.js`, `server/src/os/lab-status.js`, `lab_machines` table. |
| **Deadlock demo** ✅ | A guided demo in the System Monitor that deliberately creates lock contention and shows detection/recovery — `server/src/os/deadlock-demo.js` (wait-for graph + cycle detection, in-memory only, never touches real bookings), `POST /api/monitor/deadlock-demo`, panel in `client/src/pages/admin/KernelMonitor.jsx`. |
| **Audit log viewer** ✅ | Searchable UI over the audit trail (who changed what, when) for the admin — `server/src/routes/audit.js` (`GET /api/admin/audit`, `/summary`, `/:entity/:entityId`), `server/src/dbms/audit.js` (`searchActivity`, `entityHistory`, `activitySummary`), `client/src/pages/admin/AuditLog.jsx` (`/admin/audit`). |

## Akshay (M4 · Resources) — operations at scale

| Feature | What it does |
|---|---|
| **Waitlist management** ✅ | Full test sessions get a waitlist; cancellations auto-promote the next student and notify them — `server/src/os/critical-section.js` (`bookSeat({allowWaitlist})`), `server/src/routes/bookings.js` (cancel → promote under the same lock), "Waiting list" in `client/src/pages/student/MyBookings.jsx`. |
| **Resource calendar** ✅ | Week view of every lab and room — what's booked, what's free, drag-to-book for manual events — `server/src/routes/resources.js` (calendar + manual-events endpoints, overlap check), `manual_events` table, `client/src/pages/admin/ResourceCalendar.jsx` (`/admin/calendar`). |
| **Report exports** ✅ | One-click CSV/PDF export of drive reports and rosters — `server/src/routes/reports.js` (`export.csv`, `roster.csv`, via `server/src/utils/csv.js`), download buttons on `client/src/pages/admin/Reports.jsx` + print (CSV + print-to-PDF; no PDF library added). |
| **Placement statistics** ✅ | Year-wise placement percentages, average packages, top recruiters dashboard — `server/src/dbms/reports.js` (`placementStats()`), `GET /api/reports/placement-stats`, "Placement statistics" on `client/src/pages/admin/Reports.jsx`. |

---

## Non-goals (still out of scope)

Production deployment hardening, mobile apps, payment integration, SMS gateway. Scoping is a
skill — these stay parked unless an evaluator asks.

## Definition of done (per feature)

Working end to end on `localhost` → human-readable errors → covered in the demo script →
owner can answer viva questions on the OS/DBMS concept behind it.
