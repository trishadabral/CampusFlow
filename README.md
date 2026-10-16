# CampusFlow OS

**The operating system for campus placements.** Drives are jobs, students are processes, and
interview slots, labs and rooms are resources managed by a real scheduler, real locks, and real
database transactions.

Built for a PBL evaluation (OS + DBMS). Phase 1 = the full core loop, working end to end.

## Quick start

```bash
# 1. Start MySQL 8
docker compose up -d

# 2. Backend (http://localhost:5000)
cd server
cp .env.example .env        # set DB_PASSWORD=campusflow to match docker-compose
npm install
npm run db:reset             # creates schema + seed data
npm run dev

# 3. Frontend (http://localhost:5173)
cd ../client
npm install
npm run dev
```

## Demo logins (password: `password123`)

| Role | Email | Sees |
|---|---|---|
| Admin | `admin@campusflow.local` | Kernel Monitor, resources, reports, scheduling lab |
| Recruiter | `priya@techcorp.com` | Drives, eligibility engine, slots |
| Student | `aarav@student.local` | Drives, eligibility verdict, slot booking |

The login page has one-click demo buttons for all three.

## The 60-second wow tour

1. Log in as **admin** → **Kernel Monitor** → **Stress Test**: 100 students race for 10 seats.
   Exactly 10 win. The lock table shows every wait and acquire live.
2. **Scheduling Lab**: same 6 interviews under FCFS / Priority / Round-Robin — Gantt charts
   and avg waiting times side by side.
3. Log in as **recruiter** → open a drive → **Run Eligibility Engine** → shortlist with
   per-student pass/fail reasons (it's a stored procedure: `sp_generate_shortlist`).
4. **Resources** → allocate a lab → then request an unsafe allocation → watch the
   Banker's safety check refuse it *and explain why*.

## Repo map

```
client/     React + Vite + Tailwind UI (3 role portals, one shell)
server/     Express REST API — the "kernel"
database/   schema.sql — 3NF schema, constraints, indexes, triggers, procedures
docs/       blueprint, module split, phase plan, API contract, viva prep
```

## Docs (read in order)

1. `docs/01_BLUEPRINT.md` — the optimized idea: why this framing wins
2. `docs/02_MODULE_SPLIT.md` — 4 members, equal weight, OS + DBMS in every module
3. `docs/03_PHASE1_PLAN.md` — the 40% checklist + 10-minute demo script
4. `docs/05_API_CONTRACT.md` — every endpoint
5. `docs/04_VIVA_PREP.md` — viva questions per module, with model answers

## Team

- Ishika Rawat (lead) — M1 Platform Core & Data Foundation
- Akansha Parley — M2 Drives, Eligibility & Interview Scheduling
- Trisha Dabral — M3 Synchronization & Concurrency Control
- Akshay Singh Gusain — M4 Resource Allocation & Control Center
