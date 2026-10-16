# Phase 2 Plan — Next Evaluation

Phase 1 delivered the complete core loop: drive → test → shortlist → interview, all working
end to end. Phase 2 deepens it into a product a real placement cell could run on, plus the
items we deliberately parked.

Each feature has one owner — the member whose module it extends.

---

## Ishika (M1 · Platform) — communication & accounts

| Feature | What it does |
|---|---|
| **Email notifications** | Students get drive invites, test reminders and results by email (SMTP), alongside the in-app bell |
| **Password reset** | "Forgot password" flow with email reset links |
| **Student profiles** | Editable profile page: photo, skills, resume PDF upload |
| **Real-time updates** | Dashboard refreshes live when results publish (no manual reload) |

## Akansha (M2 · Pipeline) — a fuller hiring process

| Feature | What it does |
|---|---|
| **Interviewer feedback forms** | After each interview, the panel submits scores + remarks; the recruiter sees a consolidated scorecard |
| **Multi-round process** | Drives can have several rounds (e.g. aptitude → technical → HR), each with its own cutoff |
| **Offer letters** | Generate offer letters for selected students from a template |
| **Drive analytics** | Per-drive charts: score distribution, branch-wise shortlist rates, drop-off between stages |

## Trisha (M3 · Concurrency) — deeper systems work

| Feature | What it does |
|---|---|
| **C++ lab-monitoring agent** | *Parked in Phase 1 — headline Phase 2 item.* A small C++ agent that reports lab machine status (up/free/busy) to the scheduler, so test sessions are placed on actually-free machines |
| **Deadlock demo** | A guided demo in the System Monitor that deliberately creates lock contention and shows detection/recovery |
| **Audit log viewer** | Searchable UI over the audit trail (who changed what, when) for the admin |

## Akshay (M4 · Resources) — operations at scale

| Feature | What it does |
|---|---|
| **Waitlist management** | Full test sessions get a waitlist; cancellations auto-promote the next student and notify them |
| **Resource calendar** | Week view of every lab and room — what's booked, what's free, drag-to-book for manual events |
| **Report exports** | One-click CSV/PDF export of drive reports and rosters |
| **Placement statistics** | Year-wise placement percentages, average packages, top recruiters dashboard |

---

## Non-goals (still out of scope)

Production deployment hardening, mobile apps, payment integration, SMS gateway. Scoping is a
skill — these stay parked unless an evaluator asks.

## Definition of done (per feature)

Working end to end on `localhost` → human-readable errors → covered in the demo script →
owner can answer viva questions on the OS/DBMS concept behind it.
