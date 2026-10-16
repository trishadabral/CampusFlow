# `src/os/` — Operating Systems concepts, as running code

Every file here implements one OS concept from the syllabus. Open any file: the top
comment states the concept, and the code is the demo.

| File | OS concept | Where it's used |
|---|---|---|
| `critical-section.js` | **Mutex + critical section.** Booking a seat serializes on a `SELECT … FOR UPDATE` row lock inside one transaction — the DB row is the mutex. | `POST /api/bookings`, the pipeline's auto seat assignment, the stress test |
| `locks.js` | **Lock observability.** Every acquire / wait / release is recorded with wait times, powering the System Monitor's live lock table. | Called by `critical-section.js` |
| `cpu-scheduler.js` | **CPU scheduling.** FCFS, non-preemptive Priority and Round-Robin simulators with Gantt output and waiting/turnaround analysis. | `POST /api/schedule/simulate`, Scheduling Lab UI |
| `banker.js` | **Banker's algorithm (deadlock avoidance).** Every resource booking runs the safe-sequence check; unsafe requests are refused with an explanation. | `POST /api/allocations`, Resources page |
| `pipeline.js` | **Batch-job scheduling.** Applications queue up; the engine drains the queue as jobs — test sessions batched into labs, interviews timetabled round-robin across panels × rooms. | `POST /api/drives/:id/schedule-tests`, `POST /api/drives/:id/publish-results` |

**Viva one-liners:**
- *Why is the DB lock the mutex, not a Node mutex?* — Node is multi-process/multi-instance;
  only the database sees every contender, so only it can serialize correctly.
- *What happens without the lock?* — Run the stress test mentally: 100 racers × 10 seats
  oversells without `FOR UPDATE`; with it, exactly 10 win.
- *Banker's: avoidance vs prevention vs detection?* — We implement **avoidance**: the check
  simulates granting the request and refuses it if no safe sequence remains.
