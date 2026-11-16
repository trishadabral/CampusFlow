# Known Issues — what is still open (and what the merge fixed)

Updated 2026-11-16, after the merge of Ishika's CampusFlow (`a5c250b`) and its
verification run (115/115 endpoint checks on a real MariaDB 10.11 database).
Anything not listed here is either fixed or has never been reported.

## Still open

- **Browser-only flows are not verified here.** Tab-switch detection,
  fullscreen toggle, the live Socket.IO feed on Exam Monitoring, SSE live
  updates and the responsive sidebar drawer all have server-side paths
  verified, but their in-browser behaviour needs a laptop browser run.
- **The Windows exam agent has not been built.** `windows-agent/` is copied
  verbatim from Ishika's repo; building it needs a Windows machine with
  Visual Studio Build Tools (`windows-agent/build.bat`). The Node simulator
  (`scripts/agent-simulator.js`) covers the same API paths without Windows.
- **Docker MySQL 8 is the final proof.** Verification ran on MariaDB 10.11.
  The one MySQL-8-only construct found (`ANY_VALUE()` in the roster query)
  was replaced with `MIN()`, and no other MySQL-8-only function was found in
  `server/src`, but the laptop run against Docker MySQL 8 is still the
  confirmation that matters.
- **Feedback is one score per interviewer per student per drive.** The
  `uq_feedback (drive_id, student_id, interviewer_id)` key means a second
  round's score overwrites the first round's. Widening it (e.g. adding
  `round_id`) needs a migration and is not done.
- **The seeded online agent goes offline ~15 s after boot.** That is the
  sweeper working as designed (no heartbeat → offline), not a bug — but it
  surprises on first sight: LAB-A-PC02 shows online right after `db:reset`
  and flips offline unless an agent (or the simulator) is actually running.

## Fixed by the 2026-11-16 merge / verification

- `db:reset` failed outright — `os_runs.created_by` was `BIGINT` against
  `users.id INT` (foreign-key error 150). Now `INT` in `schema.sql` and
  `migrate_v7.sql`.
- Roster / drive-result PDF returned 500 on MariaDB — `driveRoster()` used
  MySQL-only `ANY_VALUE()`. Now `MIN()`; same result, works on MySQL 8 and
  MariaDB.
- Recruiter offer list returned 500 — it selected `offer_letters.created_at`,
  which does not exist; the column is `generated_at`.
- A student could not read their own offer letter (403) — the endpoint was
  recruiter/admin-only. Students can now read their own letter (ownership
  checked).
- The rush-hour stress test deadlocked itself — the lock-event log shared
  the main connection pool with the booking transactions it logged from.
  100 attempts on a 10-seat slot booked only 5 seats in ~250 s. `os/locks.js`
  now logs on its own 3-connection pool: exactly 10 confirmed in ~370 ms.
- Stress-test cleanup left a stale `booked_count` — deleting the temporary
  users cascaded their bookings away but the counter stayed. It is now
  recomputed from the remaining confirmed bookings.
- **Open registration accepted any role, including admin.** Public sign-up is
  now student-only (`server/src/routes/auth.js` forces `role = 'student'`
  and ignores any role in the request); staff accounts are created by an
  admin from the Users page.
- **The drive-approval workflow is not a bug, it is dormant.** Nothing ever
  sets a drive to `pending_approval`, so it was deliberately not merged and
  is not documented as a working feature anywhere in this repo.
