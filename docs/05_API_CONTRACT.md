# API Contract v1 (Phase 1)

Base URL: `http://localhost:5000/api`. Auth: `Authorization: Bearer <JWT>`.
All errors: `{ "error": "human-readable sentence" }` with proper status codes (400/401/403/404/409/422).

## Auth — `server/src/routes/auth.js`
- `POST /auth/register` `{name,email,password,role,roll_no?,branch?,cgpa?,backlogs?,graduation_year?}`
  → `201 {token, user:{id,name,email,role}}`. Role must be `student|recruiter|admin`.
  If role=student, creates `students` row too.
- `POST /auth/login` `{email,password}` → `200 {token, user}`
- `GET /auth/me` → `200 {user}` (auth required)

## Drives — `server/src/routes/drives.js`
- `GET /drives?status=open` → `200 [{id,title,description,company:{id,name},min_cgpa,allowed_branches[],max_backlogs,graduation_year,application_deadline,status,counts:{applied,shortlisted}}]`
- `POST /drives` (recruiter) `{company_id,title,description,min_cgpa,allowed_branches[],max_backlogs,graduation_year,application_deadline}` → `201 {drive}`
- `GET /drives/:id` → `200 {drive, criteria, counts}`; when the caller is a logged-in student, also
  includes `eligibility: {eligible, reasons[]}` and `my_application: {id,status,applied_at} | null`
- `POST /drives/:id/shortlist` (recruiter) → runs `sp_generate_shortlist` → `200 {shortlisted: n}`
- `GET /drives/:id/applications` (recruiter) → `200 [{id, student:{...}, status, eligible, fail_reasons[]}]`
- `POST /drives/:id/apply` (student) → checks eligibility first; `201 {application}` or `422 {error, reasons[]}`

## Slots & bookings — `server/src/routes/slots.js`, `bookings.js`
- `GET /slots?drive_id=` → `200 [{id,drive_id,type,title,starts_at,ends_at,capacity,booked_count,seats_left}]`
  (`drive_id` optional — omit to list all slots)
- `POST /slots` (recruiter) `{drive_id,type,title,starts_at,ends_at,capacity}` → `201 {slot}`
- `POST /bookings` (student) `{slot_id}` → **one transaction**: `SELECT … FOR UPDATE` on slot,
  insert booking, `booked_count+1`, audit. `201 {booking}` or `409 {error:"Slot is full"}` or
  `409 {error:"Already booked"}`. Writes a `lock_events` row (acquired/released with wait ms).
- `GET /bookings/me` (student) → `200 [{id, slot:{...}, status, booked_at}]`
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
