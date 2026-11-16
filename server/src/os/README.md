# `src/os/` — Operating Systems concepts, as running code

Every file here implements one OS concept from the syllabus. Open any file: the top
comment states the concept, and the code is the demo.

| File | OS concept | Owner | Where it's used |
|---|---|---|---|
| `critical-section.js` | **Mutex + critical section.** Booking a seat serializes on a `SELECT … FOR UPDATE` row lock inside one transaction — the DB row is the mutex. | Trisha | `POST /api/bookings`, the pipeline's auto seat assignment, the stress test |
| `locks.js` | **Lock observability.** Every acquire / wait / release is recorded with wait times, powering the Live Monitor's activity feed. The log writes use their own small connection pool (limit 3), separate from the main pool — logging from inside a booking transaction must never starve the transaction itself (the shared-pool version deadlocked a 100-way rush-hour test). | Akshay | Called by `critical-section.js` |
| `cpu-scheduler.js` | **CPU scheduling.** FCFS, non-preemptive Priority, SJF and SRTF simulators with waiting/turnaround/response-time, utilisation and throughput analysis. (Round-robin removed: preemptive time-slicing makes no sense for interviews.) | Trisha | `POST /api/schedule/simulate`, `POST /api/os/schedule/run`, `POST /api/os/schedule/compare`, Interview Scheduler UI |
| `banker.js` | **Banker's algorithm (deadlock avoidance).** Every resource booking runs the safe-sequence check; unsafe requests are refused with an explanation. | Ishika | `POST /api/allocations`, Resources page |
| `pipeline.js` | **Batch-job scheduling.** Applications queue up; the engine drains the queue as jobs — test sessions batched into labs, interviews timetabled rotating across panels × rooms. | Akansha | `POST /api/drives/:id/schedule-tests`, `POST /api/drives/:id/publish-results` |
| `lab-status.js` | **Lab liveness for the scheduler.** Counts recently-reported free machines per lab from the C++ lab agent's reports; the scheduler prefers labs whose machines are actually up. | Trisha | `scheduleTestSessions` in `pipeline.js` |
| `deadlock-demo.js` | **Deadlock detection + recovery.** Two pretend bookings wait on each other's seats; a wait-for graph cycle is detected and the younger booking is asked to wait so the other can finish. In-memory only — no real data is touched. | Trisha | `POST /api/monitor/deadlock-demo`, Live Monitor demo |
| `pc-allocator.js` | **Lab-PC allocation (First Fit + Best Fit).** Hands out an exam PC for a session under a row lock, so two sessions can never grab the same PC; also writes the lock-event rows the Live Monitor shows. Merged from Ishika's repo 2026-11-16. | Ishika | `POST /api/admin/exam-sessions`, Exam Monitoring / Exam PCs |

**Viva one-liners:**
- *Why is the DB lock the mutex, not a Node mutex?* — Node is multi-process/multi-instance;
  only the database sees every contender, so only it can serialize correctly.
- *What happens without the lock?* — Run the stress test mentally: 100 racers × 10 seats
  oversells without `FOR UPDATE`; with it, exactly 10 win. Measured 2026-11-16 on
  a real database: 100 attempts on a 10-seat slot → exactly 10 confirmed in
  ~370 ms, 90 refused.
- *Why does the lock log have its own pool?* — The log is written from inside
  the booking transaction, which already holds a main-pool connection. Sharing
  the pool meant 100 racing bookings could hold every connection while each
  waited for one more to log with — a self-deadlock (5 of 10 seats in 250 s).
  A separate 3-connection log pool can never starve the transaction that
  triggered it.
- *Banker's: avoidance vs prevention vs detection?* — We implement **avoidance**: the check
  simulates granting the request and refuses it if no safe sequence remains.
- *Deadlock demo: detection vs avoidance vs prevention?* — The demo is **detection +
  recovery**: it lets the circle form, finds it in the wait-for graph, then
  breaks it by asking the younger booking to wait. Avoidance (Banker's) stops
  the circle before it forms; prevention would forbid holding one seat while
  asking for another.
- *Why does the lab agent never report 'down'?* — A machine that has gone quiet
  cannot report itself. The server infers 'down' from silence: no report for
  over 5 minutes.
