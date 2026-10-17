# `src/os/` — Operating Systems concepts, as running code

Every file here implements one OS concept from the syllabus. Open any file: the top
comment states the concept, and the code is the demo.

| File | OS concept | Owner | Where it's used |
|---|---|---|---|
| `critical-section.js` | **Mutex + critical section.** Booking a seat serializes on a `SELECT … FOR UPDATE` row lock inside one transaction — the DB row is the mutex. | Trisha | `POST /api/bookings`, the pipeline's auto seat assignment, the stress test |
| `locks.js` | **Lock observability.** Every acquire / wait / release is recorded with wait times, powering the Live Monitor's activity feed. | Akshay | Called by `critical-section.js` |
| `cpu-scheduler.js` | **CPU scheduling.** FCFS and non-preemptive Priority simulators with waiting/turnaround analysis. (Round-robin removed: preemptive time-slicing makes no sense for interviews.) | Trisha | `POST /api/schedule/simulate`, `POST /api/schedule/auto`, Interview Scheduler UI |
| `banker.js` | **Banker's algorithm (deadlock avoidance).** Every resource booking runs the safe-sequence check; unsafe requests are refused with an explanation. | Ishika | `POST /api/allocations`, Resources page |
| `pipeline.js` | **Batch-job scheduling.** Applications queue up; the engine drains the queue as jobs — test sessions batched into labs, interviews timetabled rotating across panels × rooms. | Akansha | `POST /api/drives/:id/schedule-tests`, `POST /api/drives/:id/publish-results` |

**Viva one-liners:**
- *Why is the DB lock the mutex, not a Node mutex?* — Node is multi-process/multi-instance;
  only the database sees every contender, so only it can serialize correctly.
- *What happens without the lock?* — Run the stress test mentally: 100 racers × 10 seats
  oversells without `FOR UPDATE`; with it, exactly 10 win.
- *Banker's: avoidance vs prevention vs detection?* — We implement **avoidance**: the check
  simulates granting the request and refuses it if no safe sequence remains.
