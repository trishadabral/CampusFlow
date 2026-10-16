# CampusFlow OS — Optimized Project Blueprint

> **One-line pitch:** *CampusFlow OS is the operating system for campus placements — the placement cell
> treated as a computer system, with drives as jobs, students as processes, and interview slots, labs
> and rooms as resources managed by a real scheduler, real locks, and real transactions.*

## Why this framing wins

Most placement projects bolt OS/DBMS buzzwords onto a CRUD app. Evaluators see through that.
CampusFlow OS inverts it: **the OS concepts ARE the product.** Every headline feature maps 1:1 to a
syllabus chapter, and every one of them is *visible and demoable* — not claimed in a slide.

| Syllabus chapter | Where it lives in the product (running code, not slides) |
|---|---|
| Process management | Every booking/shortlist request is a "process" with states, visible in the Kernel Monitor |
| CPU scheduling | Scheduling Lab: FCFS / Priority / Round-Robin applied to interview slots, with Gantt chart + avg waiting time |
| Synchronization | Slot booking serializes on a mutex + `SELECT … FOR UPDATE`; lock acquire/wait/release is shown live |
| Critical sections & race conditions | One-click **Concurrency Stress Test**: 100 students race for 10 seats → exactly 10 win |
| Deadlock avoidance | Resource allocation runs a Banker's-algorithm safety check; unsafe requests are refused *with an explanation* |
| Transactions & ACID | Booking is one DB transaction; the monitor tails the transaction log; isolation level is configurable |
| Schema design / normalization | Full 3NF schema, ER diagram, constraints, indexes (`database/schema.sql`) |
| Stored procedures / triggers | `sp_generate_shortlist()` (eligibility engine), audit triggers on bookings/allocations |
| Query optimization | Criteria builder → indexed queries; `EXPLAIN` output shown in the recruiter UI |

## Wow features (all working in Phase 1)

1. **Kernel Monitor** — a live dashboard styled like `htop`: lock table (who holds what, who waits),
   process queues (ready/waiting), and a tail of the transaction/audit log. Polls every 2s.
2. **Concurrency Stress Test** — the demo that ends all "but does the lock actually work?" questions.
   One button, N simulated students, M seats, provably correct result.
3. **Scheduling Lab** — pick an algorithm, watch interviews get ordered, compare avg waiting times.
   This is the OS scheduling chapter as an interactive toy.
4. **One-click Eligibility Engine** — recruiter sets CGPA/branch/backlog criteria → stored procedure
   generates the shortlist → results table shows *why* each student passed/failed.
5. **Deadlock-safe allocation** — the system can say "no" to a resource request and explain the unsafe
   state. Almost no student project demonstrates Banker's algorithm on real data.

## Scope discipline (what we deliberately cut)

A product users understand is a product that says no. For Phase 1:

- ❌ **C++ lab-monitoring agent** → moved to Phase 2 (biggest risk item; needs lab PCs + Win32 APIs).
  Nothing in Phase 1 depends on it.
- ❌ Email/SMS notifications → Phase 2 (needs external providers, adds no OS/DBMS marks).
- ❌ Mobile app, advanced analytics, resume parsing → Phase 2 / never.
- ✅ Everything else in this blueprint is *in* and *demoable*.

Rule of thumb: if a feature doesn't demonstrate an OS or DBMS concept and a user wouldn't miss it
in a demo, it doesn't ship in Phase 1.

## Architecture (monorepo)

```
campusflow/
├── client/        React + Vite + Tailwind — the product UI (3 role portals, one shell)
├── server/        Node.js + Express REST API — the "kernel" (scheduler, locks, transactions)
├── database/      schema.sql (3NF, constraints, indexes, triggers, procedures); seed via server/src/seed.js
├── docs/          this blueprint, module split, phase plan, API contract, viva prep
└── docker-compose.yml   MySQL 8 for one-command local setup
```

**Data flow:** UI → REST → Express "kernel" layer → MySQL 8 (InnoDB, row-level locks).
Concurrency truth lives in the database (`FOR UPDATE` + transactions); the Node lock manager only
*observes and visualizes* it for the Kernel Monitor. One source of truth, no double-locking confusion
in viva.

## Roles (3 portals, 1 shell)

- **Student** — browse drives, see eligibility verdict instantly, apply, book test/interview slots.
- **Recruiter** — create drives, set criteria, one-click shortlist, create slots, view bookings.
- **Admin** — Kernel Monitor, resources, allocations, scheduling lab, stress test, reports, users.

## Success criteria for Phase 1 (the 40%)

An evaluator can, with zero help: log in as each role (demo buttons on the login page), create a
drive, run the eligibility engine, book a slot, run the 100-student stress test and watch exactly
the right number win, open the Kernel Monitor and explain every row, run the Scheduling Lab with 3
algorithms, and get refused by the Banker's check with an explanation. If all of that works live,
that's a 40% that looks like 80%.
