# Work Log — fill weekly, 5 lines each. Maps effort → syllabus for the report.

## Week of ____ — Ishika (M1)
- Built:
- OS concept shown:
- DBMS concept shown:

## Week of ____ — Trisha (M2)
- Built:
- OS concept shown:
- DBMS concept shown:

## Week of ____ — Akansha (M3)
- Built:
- OS concept shown:
- DBMS concept shown:

## Week of ____ — Akshay (M4)
- Built:
- OS concept shown:
- DBMS concept shown:

## 2026-10-16 — System-managed pipeline redesign (v2)
**Driver:** Recruiter should only create drive → upload questions → set 3 interview numbers; system schedules everything. Student sees a visual journey. Admin gets full control.

**Backend:**
- `database/migrate_v2.sql` + `schema.sql`: drives gain test_date, interview_date, durations, num_interviewers, min_test_score, max_shortlist; status → open/testing/interviews/closed; applications gain `test_taken`; slots gain `resource_id`; new tables test_questions, test_results, notifications.
- `server/src/lib/pipeline.js` (new): scheduleTestSessions (batch applicants into labs, seat booking via serialized `bookSeat()` critical section → M3 locks story intact), publishResults (score cutoff + top-N shortlist, round-robin panel×room interview timetable, notifications), submitTest (auto-grade, one attempt), eligibleStudents.
- Routes: drives.js extended (wizard create, preview-eligibility, questions CRUD, schedule-tests, publish-results, select, pipeline summary, student test get/submit); new student.js (/student/journey), notifications.js, admin.js (overview, schedule, roster).

**Frontend:**
- Design system (`cf-card`, `cf-btn-*`, `cf-input`, `cf-hero`, steppers, entrance animations).
- Recruiter: 4-step NewDriveWizard (details → questions → interview setup → review+publish with live eligible-student preview); drive detail = pipeline command view (stage stepper, 2 action buttons, tabs).
- Student: dashboard = journey cards with vertical steppers; drives = eligible-only with 1-click apply; TestTaker (timed, one-by-one, auto-submit, instant result); My Schedule (auto-assigned sessions).
- Admin: Control Center (per-drive funnel + next-action buttons + master timetable); Resources adds "add lab/room" form feeding the auto-scheduler.
- Header notification bell with unread badge + dropdown.

**OS concepts shown:** critical sections & row-level locks (unchanged, now system-driven), transactions, Banker's safety (unchanged).
**DBMS concepts shown:** 3NF schema, FK cascades, JSON columns, stored procedure (kept), triggers (kept), new migration discipline.
