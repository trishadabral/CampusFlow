# Demo Script — Phase 2 Final Evaluation

How to show every Phase 2 feature end to end, in one sitting. Estimated run time:
**~25 minutes** if you follow the acts in order (Act 5 adds the student-side
features finished in the completion pass). Each act names the role to log in as,
the exact clicks, what the evaluator should see, and the one viva question it answers.

All demo accounts use password **`password123`**.

| Role | Email | Lands on |
|---|---|---|
| Admin | `admin@campusflow.local` | Control Center |
| Recruiter | `priya@techcorp.com` | Hiring dashboard (TechCorp) |
| Recruiter | `neha.kapoor@campusflow.local` | Hiring dashboard (TCS) |
| Recruiter | `ritu.sharma@campusflow.local` | Hiring dashboard (Infosys) |
| Student | `aarav@student.local` | My Applications |
| Student | `nisha@student.local` | Shortlisted + an accepted offer |
| Student | `ishita@student.local` | An offer waiting for an answer |
| Student | `aditya@student.local` | #1 on a waiting list |

**What a fresh `db:reset` ships:** 24 students (all with skills filled in),
9 drives across the whole lifecycle — 4 open, 1 mid-test, 1 at interview
stage, 2 finished with offers — 112 applications, 44 test results, a full
test session with 2 students on the waiting list, 6 interview slots with
feedback, 5 offer letters (2 accepted, 1 declined, 2 pending), 27 inbox
messages, and 18 lab machines already reporting. Every date is relative to
the reset day, so the data never goes stale. TCS/Infosys are sample company
names only — no real affiliation is claimed.

---

## 0. Setup (before the evaluator arrives)

```bash
# 1. Database (MySQL 8)
docker compose up -d            # wait ~15 s

# 2. Backend
cd server
cp .env.example .env            # put your MySQL password in DB_PASSWORD
npm install                     # picks up nodemailer (Phase 2)
npm run db:reset                # fresh install: schema.sql now includes all Phase 2 tables
# — or, to keep existing data: npm run db:migrate   (applies migrate_v4.sql + migrate_v5.sql once)
npm run dev                     # API at http://localhost:5000

# 3. Frontend (second terminal)
cd ../client
npm install
npm run dev                     # UI at http://localhost:5173
```

**Email is optional.** If you leave `SMTP_*` blank in `server/.env`, every email
step below still works — the message is saved in the student's in-app inbox and
the email is skipped with a log line. To show real emails, fill in `SMTP_HOST`,
`SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` and restart the backend.

**New accounts:** the login page has a **"Create an account"** link — anyone
can register as a student, recruiter or admin from there (no separate invite
step). Demo accounts below still work as before.

**Narrow screens:** the sidebar collapses into a menu button below ~768px and
the admin grids stack, so the whole demo also works on a small laptop window.

**Lab agent (Act 9) needs a build:** `g++ -std=c++17 -O2 -o lab-agent agent/lab-agent.cpp`

---

## Act 1 — Accounts & communication (Ishika, M1)

### 1a. Password reset
1. Log out. On the login page click **"Forgot password?"**.
2. Enter `aarav@student.local` → the page says *"If an account exists for that
   email, a reset link has been sent."* (Try a made-up email — the reply is
   identical. That is the point: the app never reveals which emails exist.)
3. Open the link from the inbox (or, with SMTP blank, copy the token from the
   server log) → set a new password (min 8 characters) → log in with it.
4. Reuse the same link → *"This link is not valid any more."* — tokens are
   single-use and expire after 1 hour.
- **Show:** `server/src/routes/auth.js` — `forgot-password` / `reset-password`.
- **Viva:** *Why expire + single-use?* A leaked link has a 1-hour window and
  can't be replayed. *Why the identical reply?* To stop user-enumeration.

### 1b. Student profiles
1. Log in as **Aarav** → sidebar **My Profile**. Skills are already filled in
   from the seed (Java, Python, DSA, SQL, React) — change them, add a photo
   (JPG/PNG, ≤ 2 MB), upload a PDF resume (≤ 5 MB) → Save → reload: it sticks.
   Click **Download** — the PDF opens.
2. Try a non-PDF "resume" and an oversized photo → plain-language errors.
- **Show:** `server/src/routes/student.js` (`GET/PUT /api/student/profile`,
  `GET /api/student/profile/resume`); `client/src/pages/student/StudentProfile.jsx`.
- **Viva:** *Why validate on the server?* Client checks can be bypassed — the
  server is the trust boundary. Files are stored as base64 in the DB (no
  filesystem to manage), which is why the JSON body limit is 10 MB.

### 1c. Email notifications
1. As **Priya** (recruiter), open the drive **"SDE Role 2027"** → **Schedule
   tests**, then later **Publish results**.
2. As **Aarav**, open the bell (top right): the same messages appear as inbox
   items. With SMTP filled in, the same messages also arrive by email.
- **Show:** `server/src/mailer.js` (`notifyUser`) and `server/src/os/pipeline.js`
  (`notify()` now delegates to it).
- **Viva:** *Why is email best-effort?* The database work (slots, status flip)
  finishes and the connection is released **before** any notification is sent,
  so a mail failure can never break or half-finish the action that triggered
  it. The notification row is still written first, so nothing is lost either.

### 1d. Live updates
1. Open the app as **Aarav** in one browser window and as **Priya** in another.
2. As Priya, schedule tests / publish results → Aarav's bell badge and
   dashboard update within a second, **without refreshing**.
3. Stop the backend and restart it: the bell still refreshes (30-second polling
   is kept as fallback; live updates are the fast path).
- **Show:** `server/src/realtime.js` (`publish`), `GET /api/events`,
  `client/src/realtime.js` (`connectLive`).
- **Viva:** *Why SSE, not websockets?* Traffic is one-way (server → browser)
  and EventSource reconnects by itself; websockets would add a library and a
  second protocol for no benefit.

---

## Act 2 — A fuller hiring process (Akansha, M2)

### 2a. Multi-round drives
1. As **Priya**, open "SDE Role 2027" → **Rounds** → add "Technical round",
   cutoff 70 → **Make current**.
2. Run the normal flow (Schedule tests → students take the test → Publish
   results): only students scoring ≥ 70% are shortlisted.
3. Open a drive with no rounds: it publishes exactly as before (cutoff = the
   drive's qualifying score). Nothing changed for single-round drives.
4. Shortcut: the **Systems Engineer 2027** drive (Infosys, Ritu) already ships
   with three rounds — Aptitude 50, Technical 60, HR 50 — so you can open it
   and see the round setup and the round picker in feedback (2b) without
   adding anything.
- **Show:** `server/src/routes/drives.js` (rounds endpoints),
  `server/src/os/pipeline.js` (`publishResults` cutoff lookup).
- **Viva:** *Why fall back to the drive cutoff?* The feature is purely
  additive — no migration, no behaviour change for existing drives. Only one
  round can be active at a time, so two cutoffs can never apply to one publish.

### 2b. Interviewer feedback + scorecard
1. On the same drive page → **Interview notes**: pick a shortlisted student,
   give a score (0–100) and remarks → Save. On a multi-round drive, pick the
   round first — the note is recorded against that round.
2. The **Scorecard** shows the average score, how many people scored them,
   and every remark. Save again for the same student: the average changes but
   the reviewer count stays 1 (one score per interviewer per student).
   Shortcut: **Graduate Engineer Trainee 2027** already has feedback for all
   6 shortlisted students (scores 78–92 with remarks), so its scorecard is
   full the moment you open it — and on the Infosys drive the round picker
   offers the three seeded rounds.
3. If notes are missing, the recruiter sees a **"Notes needed"** count on
   My Hiring Drives and a **Send a reminder** button on the drive page — one
   bell notification per missing scorecard (see Act 5, step 5d).
- **Show:** `server/src/routes/drives.js` (`POST/GET /api/drives/:id/feedback`).
- **Viva:** *Why one score per interviewer?* The UNIQUE key makes it a
  database fact, not UI politeness — and the average is then meaningful.

### 2c. Offer letters
1. On the drive page, click **Select** next to a shortlisted student (repeat
   for a second student if you like).
2. Scroll to **Offer letters**: enter a package (or leave blank — it uses the
   drive's package, set in the **Package (LPA)** field when the drive was
   created) and a joining date → **Generate**.
3. The letters appear in the list → **View** → a real offer letter (role,
   package, joining date, documents to bring, 7-day acceptance) → **Print /
   save as PDF**: the print preview shows only the letter, no sidebar.
4. Click **Generate** again → 0 new letters (idempotent).
- **Show:** `server/src/os/offer-letter.js` (template),
  `server/src/routes/drives.js` (generate/list), `client/src/pages/recruiter/OfferLetter.jsx`.
- **Viva:** *Why can't Generate duplicate a letter?* The `NOT EXISTS` select
  plus the UNIQUE key. *Why store the letter text?* What the student sees is
  exactly what was issued — it is never re-rendered from changing data.

### 2d. Drive analytics
1. On the same drive page → **How this drive is doing**: test-score buckets
   (0–20 … 81–100), shortlist rate by branch, and the stage funnel
   (applied → test taken → shortlisted → selected).
2. Check: bucket counts add up to tests taken; funnel steps never increase.
3. Shortcut: **Graduate Engineer Trainee 2027**, **Business Analyst 2027**
   and **Software Developer 2027** already have real seeded test results
   (12, 12 and 10 respectively), so their analytics pages show real buckets
   and funnels on a fresh reset — no need to run a test first.
- **Show:** `server/src/dbms/reports.js` (`analytics()`),
  `GET /api/reports/drives/:id/analytics`.
- **Viva:** *Why count test-taken from `test_results`, not application status?*
  Publishing overwrites `test_taken` status — status alone would undercount.

### 2e. Interview Scheduler — timetable chart
1. As **Admin** → **Interview Scheduler** → pick a drive → **Generate
   timetable** (or open one already generated).
2. Below the slot list, a **timetable chart** (Gantt) shows every interview as
   a bar on a minutes timeline — who is being interviewed, when, and for how
   long. Generate again (delete + regenerate) and the chart redraws from the
   new timetable.
- **Show:** `client/src/components/GanttChart.jsx`,
  `client/src/pages/admin/SchedulingLab.jsx` (`toGantt`).
- **Viva:** *What does the chart show that the table doesn't?* Gaps and
  overlaps at a glance — whether the day is packed solid or has dead time
  between interviews.

---

## Act 3 — Deeper systems work (Trisha, M3)

### 3a. C++ lab-monitoring agent (headline item)
```bash
# in a third terminal, from the repo root
g++ -std=c++17 -O2 -o lab-agent agent/lab-agent.cpp
./lab-agent --server http://localhost:5000 --lab 1 --machines pc01,pc02,pc03 --key dev-agent-key
# interval mode: add --interval 30
```
1. The agent prints e.g. `Reported 3 machines to http://localhost:5000 — 3 free, 0 busy.`
2. As **Admin** → **Resources** → **Lab machines**: pc01–03 with Free badges
   and "last seen just now". (The seed already reports 10 machines for Lab A
   and 8 for Lab B, so the page is alive before the agent ever runs — the
   agent run above just refreshes pc01–03 and proves the live path.)
3. Schedule a drive's tests: the lab with the most free machines is picked
   first. Stop the agent for 5+ minutes: the machines flip to **Down** —
   "down" is inferred from silence, because a dead machine can't report itself.
4. Wrong key → 401; dead server → a human error line and exit code 1.
- **Show:** `agent/lab-agent.cpp`, `agent/README.md`,
  `server/src/routes/lab-agent.js`, `server/src/os/lab-status.js`.
- **Viva:** *Why raw sockets, no libraries?* A lab machine needs only `g++`.
  *Why does the scheduler only prefer, never require, agent data?* If the
  agent has never run, scheduling must still work — capacity-only, as before.

### 3b. What happens when two bookings clash (deadlock demo)
1. As **Admin** → **Live Monitor** → **What happens when two bookings clash**
   (labelled: "Demo — uses pretend bookings; your real bookings are not touched.").
2. **Start demo**: 7 steps appear one by one — Demo booking A holds seat 1 and
   waits for seat 2; Demo booking B holds seat 2 and waits for seat 1; the
   circle is found; the younger booking is asked to wait and try again; A finishes.
3. **Reset** and run it again — identical every time (a teaching demo).
- **Show:** `server/src/os/deadlock-demo.js` (wait-for graph + DFS cycle
  detection — zero `require()` calls, pure in-memory, no real data touched),
  `POST /api/monitor/deadlock-demo`.
- **Viva:** *Detection vs avoidance vs prevention?* The demo is **detection +
  recovery** (let the circle form, find it, break it); Banker's is **avoidance**
  (refuse before the unsafe state). Victim = the younger process: least work
  done, cheapest to redo.

### 3c. Audit log viewer
1. As **Admin** → sidebar **Activity log**.
2. Search "booking", filter by What happened / Which area / Who / date range →
   the table shows when, who, what, which record. Click a record link
   (e.g. "Booking #12") → its full history below (created → updated → removed).
3. Try From-date after To-date → a human error, not a crash.
- **Show:** `server/src/routes/audit.js` (`GET /api/admin/audit`,
  `/summary`, `/:entity/:entityId`), `server/src/dbms/audit.js`
  (`searchActivity`, `entityHistory`, `activitySummary`).
- **Viva:** *Why is the audit trail trustworthy?* It is written by DB
  triggers, not the app — the application can never "forget to log".

---

## Act 4 — Operations at scale (Akshay, M4)

### 4a. Waiting list (waitlist)
1. Shortcut (seeded): the **Data Analyst 2027** test session (Lab A, tomorrow
   10:00) is already full — 10 confirmed seats — with **Aditya Rao #1** and
   **Vikram Rao #2** on the waiting list. Log in as **Aditya** → open the
   drive → the session shows **"You're #1 on the waiting list"**, and his
   **My Schedule** has a Waiting list section. Then, as **Aarav** (a confirmed
   seat on that session), cancel from My Schedule → Aditya is promoted to
   confirmed automatically and gets a bell notification: "A seat opened up —
   you're booked in." (Vikram becomes #1.)
2. From scratch, if you prefer: find or create a session with capacity 1
   (admin can check capacities on the Resources / Control Center pages; a
   recruiter can also add one from the drive page → **Sessions** → **Add
   session**, picking a venue). As student A, open the drive →
   **Sessions — book a seat** → **Book a seat** on that session. Then as
   student B, do the same: the button shows the message "You're on the
   waiting list" and the session shows **"You're #1 on the waiting list"**
   on the drive page.
3. B's **My Schedule** also shows a **Waiting list** section ("You're #1 in line").
4. Cancel A's booking → B is promoted to confirmed automatically and gets a
   bell notification: "A seat opened up — you're booked in."
5. Repeat with two waiting students to check ordering (#1 promoted, #2 becomes #1).
- **Show:** `server/src/os/critical-section.js` (`bookSeat({allowWaitlist})`),
  `server/src/routes/bookings.js` (cancel → promote).
- **Viva:** *Why re-check capacity under the same lock?* Between "seat freed"
  and "promote", another booking could take the seat — without the re-check,
  two promotions could overbook. The lock serialises both paths through the
  same row. (The pipeline auto-scheduler never waitlists — it still gets the
  409, unchanged.)

### 4b. Resource calendar
1. As **Admin** → **Room calendar** (week view, Mon–Sun, 8:00–18:00, room filter).
2. Click an empty cell (e.g. Tue 10:00) → title "Workshop" → save: an amber
   block appears. Bookings from drives show as blue blocks with booked/capacity.
3. Try a second manual booking overlapping it (10:30–11:30) → "That room is
   already booked at that time." Try one starting exactly when the first ends
   (11:00) → succeeds (touching endpoints don't overlap).
4. Drag the amber block to another day → it moves. Blue session blocks can't
   be dragged and have no delete button.
- **Show:** `server/src/routes/resources.js` (calendar + manual-events
  endpoints, `hasOverlap`), `client/src/pages/admin/ResourceCalendar.jsx`.
- **Viva:** *Why is overlap `start < other.end AND end > other.start`?* That
  is exactly "the intervals intersect"; touching endpoints fail one comparison,
  so adjacent bookings pass. Slots are read-only because the pipeline owns them.

### 4c. Report exports
1. As **Admin** → **Reports** → **Download CSV** → open `placement-report.csv`:
   one row per drive (Applied / Shortlisted / Selected / Avg CGPA).
2. Per-drive row → **Download drive report (CSV)** → the roster (name, branch, CGPA,
   status, test %, sessions).
3. **Print** → print preview shows only the report (sidebar hidden).
- **Show:** `server/src/routes/reports.js` (`export.csv`, `roster.csv`),
  `server/src/utils/csv.js` (RFC 4180 quoting).
- **Viva:** *Why reuse `placementReport()`/`driveRoster()`?* One SQL source,
  two renderings — the CSV can never disagree with the screen. No PDF library:
  CSV + the browser's print-to-PDF covers it with zero new dependencies.

### 4d. Placement statistics
1. As **Admin** → **Reports** → **Placement statistics** (top of the page):
   per-year placement % bars, overall average package, top recruiters. On a
   fresh reset it already shows real numbers from the seed — 2027: **6 of 24
   placed (25.0%) · avg ₹8.10 LPA**, top recruiters FinServe (3), TCS (2),
   TechCorp (1).
2. Generate more offer letters (Act 2c) and reload: the numbers move.
- **Show:** `server/src/dbms/reports.js` (`placementStats()`),
  `GET /api/reports/placement-stats`.
- **Viva:** *What does placement % measure?* Distinct **students** per
  graduating year, not applications — counting applications would inflate both
  sides. Average package only counts offer letters that actually have a package.

---

## Act 5 — New in this build: the student side, finished

### 5a. "Why am I eligible?" explainer
1. Log in as **Aarav** → open any drive → **How you match up**: one line per
   rule — branch, CGPA, backlogs, graduating year — each with a ✓ or ✗ and the
   numbers ("Your CGPA is 8.2 — this drive needs 7.0 or more").
2. On the drives list, ineligible drives show the failed checks compactly
   instead of hiding the drive. Open a drive Aarav fails: the ✗ lines say
   exactly which rule failed.
- **Show:** `server/src/dbms/eligibility.js` (`checkEligibility` → `checks`),
  `client/src/pages/student/DriveDetail.jsx`, `Drives.jsx`.
- **Viva:** *Where is the rule?* One function, one query — the screen, the
  list and the shortlist all read the same answer, so they can never disagree.

### 5b. Offer accept / decline
1. Shortcut (seeded): log in as **Ishita** → dashboard → **What happens next
   for you**: "🎉 You have an offer!" (Business Analyst 2027, ₹8.50 LPA) →
   **Accept offer** (or Decline). **Nisha** already accepted hers and **Riya**
   declined — open their dashboards to see the decided state, with the date
   the decision was made.
2. From scratch: as **Priya**, generate an offer letter for Aarav (Act 2c).
3. As **Aarav** → dashboard → **What happens next for you**: "🎉 You have an
   offer!" with the package and joining date → **Accept offer** (or Decline).
   The same accept/decline buttons are on the drive page, on the offer card.
4. Try answering again → the button is gone and the card shows the decision
   and the date it was made (one answer only — a second answer is refused).
5. As **Priya** → the drive page shows real numbers: "N accepted · M declined
   · K still deciding", and each student's answer badge on the offer view.
   The recruiter also gets a bell notification when a student answers.
- **Show:** `server/src/routes/offers.js` (`POST /api/offers/:id/respond`),
  `offer_letters.status` (`pending`/`accepted`/`declined`, `migrate_v5.sql`).
- **Viva:** *Why one answer only?* The decision is a fact the placement cell
  plans on — letting it flip back and forth would make the acceptance numbers
  meaningless. The status column makes it a database fact, not UI politeness.

### 5c. "What happens next for you" card
1. As **Aarav** → dashboard, top of the page: one card that says the single
   next thing to do — take the test (date + venue), attend the interview
   (time + room), answer an offer, or wait for the result — with up to three
   more upcoming items below it and a working link on each.
2. Move Aarav through the pipeline (apply → test → shortlist → interview →
   offer) and reload the dashboard after each step: the card always shows the
   correct next step, never a stale one.
3. A shortlisted student with no interview time yet sees the interview date
   ("Interviews on 15 Feb 2027 — your exact time will be shown here once
   interviews are scheduled"), not a dead end.
4. Seeded examples to open without doing anything first: **Aarav** (shortlisted
   for Graduate Engineer Trainee, interview in 2 days) sees the interview as
   his next step; **Aditya** (waiting list #1) sees the waiting-list status;
   **Nisha** (offer accepted) sees the offer outcome.
- **Show:** `client/src/pages/student/StudentDashboard.jsx` (journey card),
  `GET /api/student/journey`.
- **Viva:** *Why one card, not a checklist of everything?* The student only
  ever has one next action — showing everything at once is how people miss the
  one thing that matters.

### 5d. Feedback reminders (recruiter side)
1. As **Priya** → **My Hiring Drives**: any drive with missing interview
   notes shows a **"Notes needed"** count.
2. Open that drive → **Interview notes** → **Send a reminder**: the recruiter
   gets one bell notification per missing scorecard. Nothing is sent on page
   load — the reminder only goes out when the recruiter asks for it.
3. Save the missing notes → the count drops to zero.
- **Show:** `GET /api/drives/:id/feedback/pending`,
  `POST /api/drives/:id/feedback/remind`.
- **Viva:** *Why an explicit button, not automatic?* A reminder is a nudge to
  a person — sending it on every page load would spam them. The count is
  always visible; the nudge is the recruiter's call.

---

## Suggested 15-minute evaluator run

If time is short, do exactly this: **1a** (reset link, 1 min) → **1d** (two
windows, live bell, 1 min) → **2a+2b** (round cutoff + scorecard, 2 min) →
**2c** (generate + print a letter, 2 min) → **2e** (timetable chart, 1 min) →
**3a** (run the agent, watch the Resources page, 2 min) → **3b** (two-bookings
demo, 2 min) → **3c** (search the activity log, 1 min) → **4a** (book a seat,
waitlist promote, 2 min) → **4b+4c+4d** (calendar drag, CSV download, stats,
2 min) → **5a+5b+5c** (eligibility explainer, accept an offer, next-action
card, 2 min).

## If something goes wrong

| Symptom | Fix |
|---|---|
| `Access denied` on `db:reset` | `server/.env` (not `.env.example`) needs `DB_PASSWORD` |
| `ECONNREFUSED 127.0.0.1:3306` | `docker compose up -d`, wait 15 s |
| New tables missing on an old database | `cd server && npm run db:migrate` (applies `migrate_v4.sql` + `migrate_v5.sql` once; re-running is safe — migrations are idempotent) |
| Emails never arrive | SMTP blank = in-app only, by design. Fill `SMTP_*` and restart the backend |
| Agent reports nothing | Backend must be running first; check `--lab` matches a real resource id |
| Port 5000 / 5173 busy | Set `PORT=` in `server/.env`; Vite picks the next free port itself |
