# Viva Prep — model answers per module

Answer pattern: **one crisp sentence → point at the running system → name the file/line.**
Evaluators trust what you can show.

---

## M1 — Platform Core (Ishika)

**Q: Why is your schema in 3NF? Give an example.**
A: Every non-key attribute depends on the key, the whole key, nothing but the key. Example: student
CGPA lives once in `students`, not copied into `applications` — the application references the
student, so a CGPA update can't leave two copies disagreeing. Show `schema.sql`.

**Q: What does the UNIQUE(drive_id, student_id) constraint guarantee?**
A: A student can't apply twice to the same drive — the database rejects it even if the app has a
bug. Defense in depth: we also check in code, but the constraint is the guarantee.

**Q: Why index (drive_id, status) on applications?**
A: The recruiter's most common query is "all shortlisted for drive X" — the composite index serves
the filter and avoids a full table scan. Show the shortlist query.

**Q: JWT vs sessions — why JWT here?**
A: Stateless: the API verifies the signature without a session lookup, so any server instance can
serve any request. Trade-off we accept: can't revoke instantly; mitigated by short 8h expiry.

## M2 — Eligibility Engine & Interview Scheduling (Akansha)

**Q: Why is the shortlist a stored procedure instead of app code?**
A: It runs *where the data lives* — one round trip, set-based UPDATE over a join, no N+1 queries.
`sp_generate_shortlist` in `schema.sql`. The app just calls it.

**Q: Walk me through the eligibility SQL.**
A: `UPDATE applications JOIN students JOIN drives SET status = CASE WHEN cgpa >= min_cgpa AND
backlogs <= max_backlogs AND graduation_year matches AND JSON_CONTAINS(allowed_branches, branch)
THEN 'shortlisted' ELSE 'rejected'`. One statement, whole drive.

**Q: How do you know it's fast?**
A: The filter columns are indexed (`idx_students_branch_cgpa`, `idx_applications_drive`); run
`EXPLAIN` on the SELECT form and show index usage in the recruiter UI.

**Q: Compare the three scheduling algorithms on your data.**
A: Open Scheduling Lab → Compare all. Priority (by candidate rank) minimizes waiting for top
candidates but can starve low-priority ones; RR is fair but has context-switch overhead (more
preemptions); FCFS is simple but suffers the convoy effect. Point at the Gantt charts.

## M3 — Synchronization & Concurrency (Trisha)

**Q: Show me the race condition. What breaks without the lock?**
A: Two students read `booked_count = 9` for a 10-seat slot simultaneously; both insert; count goes
to 11 — oversell. *Demo it:* run the stress test, then explain the fix. (We keep the numbers
honest: the stress test would oversell without `FOR UPDATE`.)

**Q: Where exactly is your critical section?**
A: In `src/lib/booking.js`: from `SELECT … FOR UPDATE` to `COMMIT`. Only one transaction holds the
row lock at a time; everything between is the critical section.

**Q: Why not just a Node.js mutex?**
A: A mutex only serializes *this* process. The database row lock is the single source of truth that
works across processes, restarts, and horizontal scaling. The in-app lock table is only for
*visualization* in the Kernel Monitor.

**Q: Which isolation level and why?**
A: `REPEATABLE READ` (InnoDB default): the `FOR UPDATE` lock plus gap protection prevents phantom
seats appearing mid-transaction. We document the choice in code comments.

## M4 — Resources & Safety (Akshay)

**Q: Walk me through Banker's algorithm on your data.**
A: State = available lab seats/rooms/interviewers minus overlapping allocations. Request arrives →
tentatively grant → try to find a safe sequence over pending slot demands (each future slot needs
seats + 1 room + interviewers). If some ordering lets every demand finish, state is safe → grant.
Else refuse. *Demo the refusal* and read the explanation banner aloud.

**Q: Prevention vs avoidance vs detection — which do you do?**
A: **Avoidance** (Banker's): we check safety *before* granting. Prevention would restrict request
patterns (too rigid for a placement cell); detection+recovery would mean cancelling real bookings
(unacceptable). Show `src/lib/banker.js`.

**Q: What does the audit trigger record?**
A: `trg_bookings_audit_ai` etc. write every insert/update/delete with old/new values into
`audit_log` — the application can't skip it, because it fires inside the database.

## General (anyone)

**Q: What did you cut, and why?** → "The C++ lab-monitoring agent — needs physical lab PCs and
Win32 APIs, highest risk, zero Phase-1 dependency. Scoping is in `01_BLUEPRINT.md`. Phase 2."
**Q: How do the four modules connect?** → "One database, one API contract (`05_API_CONTRACT.md`).
M1 owns schema+auth, M2/M3/M4 own their routes+tables+UI. We integrate through the contract."
**Q: Prove the 100→10 stress test isn't faked.** → "Run it again live. Then `SELECT booked_count
FROM slots` — it's 10, and `COUNT(*) FROM bookings` is 10. The lock table shows the waits."
