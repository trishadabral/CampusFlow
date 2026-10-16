# API Contract v2 (Phase 1)

Base URL: `http://localhost:5000/api`. Auth: `Authorization: Bearer <JWT>`.
All errors: `{ "error": "human-readable sentence" }` with proper status codes (400/401/403/404/409/422).

**v2 pipeline model:** drives flow `open → testing → interviews → closed`. Recruiters configure
(drive → test questions → interview params); the pipeline engine (`server/src/lib/pipeline.js`)
schedules test sessions, grades, shortlists by score, and timetables interviews. Students never book.

## Auth — `server/src/routes/auth.js`
- `POST /auth/register` `{name,email,password,role,roll_no?,branch?,cgpa?,backlogs?,graduation_year?}`
  → `201 {token, user:{id,name,email,role}}`. Role must be `student|recruiter|admin`.
  If role=student, creates `students` row too.
- `POST /auth/login` `{email,password}` → `200 {token, user}`
- `GET /auth/me` → `200 {user}` (auth required)

## Drives — `server/src/routes/drives.js`
- `GET /drives?status=open` → `200 [{id,title,description,company:{id,name},min_cgpa,allowed_branches[],max_backlogs,graduation_year,application_deadline,test_date,interview_date,test_duration_min,interview_duration_min,num_interviewers,min_test_score,max_shortlist,status,counts:{applied,shortlisted}}]`
- `POST /drives` (recruiter) `{company_id,title,description,min_cgpa,allowed_branches[],max_backlogs,graduation_year,application_deadline,test_date,interview_date?,test_duration_min?,interview_duration_min?,num_interviewers?,min_test_score?,max_shortlist?}` → `201 {drive}`
- `POST /drives/preview-eligibility` (recruiter) `{min_cgpa,allowed_branches[],max_backlogs,graduation_year}` → `200 {count, sample:[names]}` — wizard step 4
- `GET /drives/:id` → `200 {drive, criteria, counts, questions_count}`; for a logged-in student also
  `eligibility:{eligible,reasons[]}`, `my_application`, `my_result:{score,total,percentage}|null`, `my_sessions:[{type,title,starts_at,ends_at,venue}]`
- `POST /drives/:id/apply` (student) → eligibility checked; `201 {application}` or `422 {error, reasons[]}`; `400` if drive not open
- `GET /drives/:id/applications` (recruiter) → `200 [{id, student:{...}, status, eligible, fail_reasons[], test_percentage|null}]`
- `GET /drives/:id/eligible-students` (recruiter) → `200 {count, students:[...]}` — everyone passing the criteria
- `GET /drives/:id/pipeline` (recruiter) → `200 {stage, applied, test_sessions, seats_assigned, tests_taken, avg_score, shortlisted, interviews, selected, questions}`
- `POST /drives/:id/questions` (recruiter) `{questions:[{text, options[], correct_index, marks}]}` → replaces the set → `200 {saved: n}` (only before testing stage)
- `GET /drives/:id/questions` (recruiter) → `200 [{id,text,options[],correct_index,marks}]`
- `POST /drives/:id/schedule-tests` (recruiter/admin) → engine batches applicants into lab sessions, books seats via the serialized `bookSeat()` critical section, notifies students → `200 {sessions, assigned}`; drive → `testing`
- `POST /drives/:id/publish-results` (recruiter/admin) → shortlists `percentage >= min_test_score`, top `max_shortlist`; builds interview timetable (round-robin panels × rooms); notifies everyone → `200 {shortlisted, interviews}`; drive → `interviews`
- `POST /drives/:id/select` (recruiter) `{student_id}` → marks a shortlisted student `selected` → `200 {ok:true}`

## Test taking — `server/src/routes/drives.js`, `lib/pipeline.js`
- `GET /drives/:id/test` (student, must have applied) → `200 {drive:{id,title,test_duration_min}, questions:[{id,text,options[],marks}] (answers stripped), session:{title,starts_at,ends_at,venue}|null, result:{score,total,percentage,submitted_at}|null}`
- `POST /drives/:id/test/submit` (student) `{answers: {questionId: chosenIndex}}` → one attempt, auto-graded → `200 {score,total,percentage}`; `409` if already submitted

## Student journey — `server/src/routes/student.js`
- `GET /student/journey` (student) → `200 [{application:{id,status,applied_at}, drive:{id,title,company,status}, testSession|null, result:{score,total,percentage}|null, interview:{title,starts_at,ends_at,venue,panel}|null, steps:[{key,label,state:done|current|todo,detail}]}]`

## Notifications — `server/src/routes/notifications.js`
- `GET /notifications` → `200 {unread, notifications:[{id,title,body,link,is_read,created_at}]}`
- `POST /notifications/read-all` → `200 {ok:true}`
- `PATCH /notifications/:id/read` → `200 {ok:true}`

## Admin control center — `server/src/routes/admin.js`
- `GET /admin/overview` (admin) → `200 [{id,title,company,stage,test_date,interview_date,config:{num_interviewers,min_test_score,max_shortlist},applied,tests_taken,shortlisted,selected,test_sessions,interview_slots,questions,next_action:schedule_tests|publish_results|null}]`
- `GET /admin/schedule` (admin) → `200 [{id,type,title,starts_at,ends_at,capacity,booked_count,drive_id,drive_title,company_name,venue}]` — master timetable
- `GET /admin/drive/:id/roster` (admin) → every applicant with session, venue, result in one row

## Slots & bookings — `server/src/routes/slots.js`, `bookings.js`, `lib/pipeline.js`
**v2: slots are system-created.** The pipeline engine creates `test` slots (batched into labs) and
`interview` slots (round-robin panels × rooms) and books every seat itself through the same
serialized critical section — students never book manually.
- `GET /slots?drive_id=` → `200 [{id,drive_id,resource_id,type,title,starts_at,ends_at,capacity,booked_count,seats_left}]`
  (`drive_id` optional — omit to list all slots)
- `POST /slots` (recruiter) `{drive_id,type,title,starts_at,ends_at,capacity}` → `201 {slot}` (kept for manual use)
- `POST /bookings` (student) `{slot_id}` → **one transaction**: `SELECT … FOR UPDATE` on slot,
  insert booking, `booked_count+1`, audit. `201 {booking}` or `409 {error:"Slot is full"}` or
  `409 {error:"Already booked"}`. Writes a `lock_events` row (acquired/released with wait ms).
- `GET /bookings/me` (student) → `200 [{id, slot:{...}, status, booked_at}]` — now powers "My Schedule"
- `DELETE /bookings/:id` (student, own) → transaction: delete + `booked_count-1` → `200 {ok:true}`

## Resources & allocations — `server/src/routes/resources.js`
- `GET /resources` → `200 [{id,name,type,capacity,location,status}]`
- `POST /resources` (admin) `{name,type,capacity,location}` → `201`
- `POST /allocations` (admin/recruiter) `{resource_id,purpose,starts_at,ends_at,slot_id?}`
  → runs **Banker's safety check**; `201 {allocation}` or `409 {error, explanation}`
- `GET /allocations` → `200 [{id, resource:{...}, purpose, starts_at, ends_at, slot_id}]`

## Scheduling lab — `server/src/routes/schedule.js`
- `POST /schedule/simulate` `{algorithm: "fcfs"|"priority"|"rr", quantum?: number, interviews: [{id,label,burst,priority,arrival}]}` →
  `200 {order:[ids], gantt:[{id,label,start,end}], avg_waiting_time, avg_turnaround_time}`

## Monitor — `server/src/routes/monitor.js`
- `GET /monitor/locks?limit=50` → `200 [{id,lock_name,holder,action,wait_ms,created_at}]` newest first
- `GET /monitor/stats` → `200 {students, drives, applications, bookings, resources, active_locks}`
- `GET /monitor/activity?limit=50` → `200 [{id,action,entity,entity_id,details,created_at}]` newest first (reads `audit_log`)
- `POST /monitor/stress` (admin) `{slot_id, count}` → fires `count` concurrent booking attempts as
  distinct seeded students → `200 {attempted, confirmed, rejected, ms}`. Must satisfy
  `confirmed == min(count, seats_left)`.

## Reports — `server/src/routes/reports.js`
- `GET /reports/placement` → `200 [{drive_id, drive_title, company, applied, shortlisted, selected, avg_cgpa_shortlisted}]`

## Companies — `server/src/routes/companies.js`
- `GET /companies` → `200 [{id,name,website,sector}]`
- `POST /companies` (recruiter/admin) → `201`

## Users — `server/src/routes/users.js`
- `GET /users` (admin) → `200 [{id,name,email,role,roll_no,branch,cgpa,created_at}]`

## Conventions
- Dates: ISO 8601 strings. Money: none. Pagination: not needed in Phase 1 (seed-scale data).
- `allowed_branches`: JSON array stored as JSON column, e.g. `["CSE","IT"]`.
- Every write route appends to `audit_log` via trigger (DB-side) — routes don't write it manually.
