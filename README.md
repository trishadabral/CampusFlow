# CampusFlow OS

**The operating system for campus placements.** A complete placement pipeline — drives, aptitude
tests, shortlisting and interviews — where the *system* does the scheduling and students just
show up. Built with real OS concepts (locks, critical sections, scheduling, Banker's algorithm)
running on a real database.

Built by a 4-member team for a PBL evaluation (Operating Systems + DBMS).

---

## ✨ Features implemented (Phase 1)

### 🎓 Student portal
- **Find drives** — only drives matching your profile (CGPA, branch, backlogs, graduation year) are shown
- **1-click apply** — eligibility is checked instantly, with reasons if you're not eligible
- **My Applications** — every application as a visual progress tracker: Applied → Test → Result → Interview
- **In-app aptitude test** — timed, one question at a time, auto-submits, instantly graded
- **Auto-assigned sessions** — test venue/date/time and interview slot appear automatically; nothing to book
- **Notifications bell** — test schedules, results and interview invites land in your inbox
- **My Schedule** — all upcoming tests and interviews in one place

### 💼 Recruiter portal
- **Add Drive wizard** — 4 guided steps: drive details + eligibility → test questions builder → interview setup (number of interviewers, qualifying score, shortlist cap) → review with a live count of eligible students
- **Drive dashboard** — pipeline tracker (Applications → Test → Results → Interviews) with funnel stats
- **Schedule tests** (one click) — the system batches applicants into labs by capacity and notifies everyone
- **Publish results** (one click) — shortlists by test score (cutoff + top-N cap) and auto-builds the full interview timetable across panels and rooms
- **Eligible students, results leaderboard, final selection** — per-student views with test scores

### 🛠️ Admin — Control Center
- **All drives** — every drive's stage and progress (applied → tested → shortlisted) with one-click next steps
- **Full schedule** — every test and interview session across all drives, with venues and seat counts
- **Resources** — add labs (with seating capacity) and interview rooms; the auto-scheduler plans against this inventory. Manual bookings run a safety check that refuses overbooking with an explanation
- **System Monitor** — live view of locks, waits and transactions as the system works
- **Scheduling Lab** — CPU scheduling simulator (FCFS / Priority / Round-Robin) with Gantt charts
- **Reports** — placement progress per drive and per company
- **Users** — directory of all accounts

### ⚙️ The pipeline engine (the core idea)
Recruiters configure; the system executes. Test sessions are batched into labs, every seat is
assigned inside a serialized database critical section (`SELECT … FOR UPDATE` — no overselling,
ever), tests are auto-graded, shortlists are score-based, and interviews are timetabled
round-robin across panels and rooms. Students are notified at every step.

---

## 🚀 Run it locally

Full step-by-step guide (including troubleshooting): **[docs/03_INSTALLATION.md](docs/03_INSTALLATION.md)**

```bash
# 1. Database (MySQL 8)
docker compose up -d

# 2. Backend → http://localhost:5000
cd server
cp .env.example .env        # put your MySQL password in DB_PASSWORD
npm install
npm run db:reset            # builds schema + demo data
npm run dev

# 3. Frontend → http://localhost:5173
cd ../client
npm install
npm run dev
```

## 🔑 Demo logins (password: `password123`)

| Role | Email | Lands on |
|---|---|---|
| Admin | `admin@campusflow.local` | Control Center |
| Recruiter | `priya@techcorp.com` | Hiring dashboard |
| Student | `aarav@student.local` | My Applications |

One-click demo buttons are on the login page.

## 📚 Docs

| Doc | What it covers |
|---|---|
| [docs/01_TEAM_CONTRIBUTIONS.md](docs/01_TEAM_CONTRIBUTIONS.md) | What each team member built (Phase 1) |
| [docs/02_PHASE2_PLAN.md](docs/02_PHASE2_PLAN.md) | Features planned for the next evaluation, with owners |
| [docs/03_INSTALLATION.md](docs/03_INSTALLATION.md) | How to install and run the app on your machine |

Older working documents are preserved in `docs/archive/`.

## 🛠️ Tech stack

- **Frontend:** React + Vite + Tailwind CSS, React Router, Axios
- **Backend:** Node.js + Express, JWT auth, bcrypt
- **Database:** MySQL 8 (InnoDB) — 3NF schema, triggers, stored procedures, row-level locking

## 👥 Team

- **Ishika Rawat** (lead) — M1 Platform Core & Data Foundation
- **Akansha Parley** — M2 Drives, Eligibility & Interview Scheduling
- **Trisha Dabral** — M3 Synchronization & Concurrency Control
- **Akshay Singh Gusain** — M4 Resource Allocation & Control Center
