# Phase 1 Plan — the 40% That Looks Like 80%

## What "40%" means here

Not 40% of a feature list — **100% of the core loop, working end to end**, with Phase-2 items
explicitly parked. An evaluator sees a complete product story, not scaffolding.

### The core loop (must all work live)
`login → create drive → set criteria → one-click shortlist → create slots → student books →
stress test proves correctness → monitor shows it all → resources allocated safely → reports`

## Phase-1 checklist (tick before evaluation)

**Foundation (M1)**
- [ ] `docker compose up` gives a working MySQL 8 with schema + seed, no manual steps
- [ ] Login works for all 3 roles; demo-credential buttons on the login page
- [ ] Wrong-role users cannot hit other roles' APIs (test with curl, show 403)
- [ ] Seed data: 12 students (mixed CGPA/branches/backlogs), 2 companies, 3 drives, slots, resources

**Drives & eligibility (M2)**
- [ ] Recruiter creates a drive with criteria (CGPA, branches, backlogs, grad year)
- [ ] One click → `sp_generate_shortlist()` runs → shortlist table shows pass/fail + reasons
- [ ] Student sees instant "Eligible / Not eligible (why)" badge on every drive
- [ ] Ineligible student apply → 422 with reasons, nothing written to DB

**Scheduling & concurrency (M3)**
- [ ] Recruiter creates test/interview slots with capacity
- [ ] Student books → seat count decrements; full slot → clean "Slot full" (no 500)
- [ ] Cancel → seat freed, visible immediately
- [ ] **Stress test: 100 racers, 10 seats → exactly 10 confirmed, 90 rejected, zero oversell**
- [ ] Kernel Monitor shows lock acquire/wait/release rows during the stress test
- [ ] Scheduling Lab: same 6 interviews under FCFS/Priority/RR → Gantt + avg waiting time differ sensibly

**Resources & control (M4)**
- [ ] Admin sees inventory (labs, rooms, interviewers) with availability
- [ ] Safe allocation succeeds; deliberately unsafe request → refused with explanation naming the problem
- [ ] Dashboard stat cards match DB counts (verify with one SQL query live)
- [ ] Reports page: per-drive applications/shortlists, per-company pipeline

**Product feel**
- [ ] No dead buttons, no lorem ipsum, no "coming soon" screens
- [ ] Every error is a human sentence ("This slot is full — 2 seats opened in Slot B"), not a stack trace
- [ ] Works on a projector (large click targets, readable tables)

## 10-minute demo script (rehearse this exact order)

| Min | Who | What | Line to say |
|---|---|---|---|
| 0–1 | Ishika | Login as admin via demo button; dashboard | "One login, three portals — roles are enforced in the API, not just hidden in UI." |
| 1–3 | Akansha | Recruiter creates drive → sets criteria → shortlist | "The shortlist is a stored procedure, not app code — watch the reasons column." |
| 3–5 | Akansha | Scheduling Lab: 3 algorithms, Gantt comparison | "The shortlisted candidates become scheduled interviews — same data, three schedulers." |
| 5–7 | Trisha | Student books last seat; then **stress test 100→10** | "Without the lock this oversells. With it — exactly ten. The monitor shows every lock wait." |
| 7–8 | Akshay | Allocate lab for the test; trigger unsafe request | "Banker's check refused it — and tells us which resource would deadlock." |
| 8–9 | Akshay | Reports + audit log tail | "Every write is audited by a trigger — the log is the DB telling on us." |
| 9–10 | All | Q&A | Each answers their module's viva (see `04_VIVA_PREP.md`) |

**Backup plan:** if the projector has no internet, everything runs on `localhost` — DB, API, UI.
Seed the DB fresh 10 minutes before (`npm run db:reset`). Screenshot the stress-test result as a
fallback slide.

## Phase 2 (parked, mentioned in one slide only)

C++ lab-monitoring agent, email/SMS notifications, offer-letter workflow, advanced analytics,
production deployment hardening. One slide, no apologies — scoping is a skill.
