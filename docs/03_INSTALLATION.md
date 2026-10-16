# Installation — Run CampusFlow on Your Machine

Everything runs on `localhost`: the database, the API and the UI. No internet needed after
setup. Takes about 10 minutes.

---

## 1. What you need

| Tool | Version | Check with |
|---|---|---|
| Node.js | 18+ | `node --version` |
| MySQL | 8.0 | see below — Docker **or** a local install |
| Git | any | `git --version` |

**Database — pick one:**
- **Option A (recommended): Docker.** Install [Docker Desktop](https://www.docker.com/products/docker-desktop/),
  then the project starts its own MySQL for you. You don't need MySQL installed separately.
- **Option B: local MySQL.** Install [MySQL 8 Community Server](https://dev.mysql.com/downloads/mysql/).
  During setup, **note down the root password you choose** — you'll need it in step 3.

---

## 2. Get the code

```bash
git clone https://github.com/trishadabral/CampusFlow.git
cd CampusFlow
```

(No Git? Download the ZIP from the GitHub page and extract it instead.)

---

## 3. Start the database

**Option A — Docker:**
```bash
docker compose up -d
```
This starts MySQL 8 with root password `campusflow`. Wait ~15 seconds for it to finish starting.

**Option B — local MySQL:** make sure the MySQL service is running.
- Windows: open `services.msc`, find `MySQL80`, status should be *Running*
  (or in PowerShell: `Get-Service *mysql*`)

---

## 4. Backend

```bash
cd server
cp .env.example .env
```

Now **open the new `.env` file** and set your password on the `DB_PASSWORD=` line:

| Your setup | What to put |
|---|---|
| Docker (Option A) | `DB_PASSWORD=campusflow` |
| Local MySQL (Option B) | `DB_PASSWORD=` + the root password you chose during MySQL setup |

> ⚠️ The app **only** reads the file named exactly `.env` inside the `server/` folder.
> The `.env.example` file is just a template — editing it does nothing.

Then:

```bash
npm install
npm run db:reset     # creates the database, all tables, and demo data
npm run dev          # API runs at http://localhost:5000
```

You should see: `Recreating database campusflow ...` → `Schema created` → `Done.`

---

## 5. Frontend

Open a **second terminal**:

```bash
cd client
npm install
npm run dev          # UI runs at http://localhost:5173
```

Open **http://localhost:5173** in your browser. 🎉

---

## 6. Log in (demo accounts, password: `password123`)

| Role | Email | You'll see |
|---|---|---|
| Admin | `admin@campusflow.local` | Control Center, resources, reports |
| Recruiter | `priya@techcorp.com` | Hiring dashboard, Add Drive wizard |
| Student | `aarav@student.local` | My Applications, drives, tests |

The login page also has one-click buttons for each role.

---

## 7. Suggested first tour (5 minutes)

1. **Recruiter** → *Add Drive* → walk the 4-step wizard → Publish
2. **Student** → *Find Drives* → Apply in 1 click
3. **Recruiter** → open the drive → **Schedule tests** → the system batches students into labs
4. **Student** → *My Applications* → **Take the test now**
5. **Recruiter** → **Publish results** → interviews are timetabled automatically
6. **Admin** → *Control Center* → watch the whole operation; try the **System Monitor** stress test

---

## 🆘 Troubleshooting

**`Reset failed: Access denied for user 'root'@'localhost' (using password: NO)`**
The `.env` file has no password. Open `server/.env` (not `.env.example`) and fill in
`DB_PASSWORD=`. Then run `npm run db:reset` again.

**`Reset failed: Access denied ... (using password: YES)`**
A password *was* sent but MySQL rejected it — it's the wrong password. Check it works first:
```
"C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe" -u root -p
```
(type your password at the prompt; if you get a `mysql>` prompt, that password goes in `.env`).

**`'mysql' is not recognized` (Windows)**
The MySQL tools aren't on your PATH — that's fine, you don't need them. The Node app connects
directly. Use the full path above if you want the MySQL prompt.

**`connect ECONNREFUSED 127.0.0.1:3306`**
MySQL isn't running. Docker: `docker compose up -d` (and wait 15s). Local: start the `MySQL80`
service.

**`Port 5000 is already in use`**
Another program is on port 5000. Either stop it, or set `PORT=5001` in `server/.env`.

**`Port 5173 is already in use`**
Vite will offer the next free port automatically — use the URL it prints.

**Password contains a `#`**
Wrap it in quotes in `.env`: `DB_PASSWORD="my#password"` — otherwise everything after `#`
is silently ignored.

**Starting over**
`npm run db:reset` wipes and rebuilds everything (schema + demo data). Safe to run any time.

**Upgrading without wiping data**
If you already have a database with real data (e.g. from an earlier version), don't reset —
apply the pending schema upgrades instead:
```bash
cd server
npm run db:migrate
```
This runs any `database/migrate_*.sql` files you haven't applied yet, in order, and records
them so each runs exactly once.

---

## Project layout

```
CampusFlow/
├── client/     React + Vite + Tailwind UI (student / recruiter / admin portals)
├── server/     Express REST API
│   └── src/
│       ├── os/       OS concepts: critical-section, locks, cpu-scheduler,
│       │             banker (Banker's algorithm), pipeline (job scheduler)
│       ├── dbms/     DBMS concepts: db pool, transactions, eligibility rules
│       └── routes/   HTTP layer (thin — logic lives in os/ or dbms/)
├── database/   schema.sql (full schema) · migrate_v2.sql (upgrade script)
├── docs/       01_TEAM_CONTRIBUTIONS.md · 02_PHASE2_PLAN.md · 03_INSTALLATION.md
└── docker-compose.yml   MySQL 8 container for local development
```
