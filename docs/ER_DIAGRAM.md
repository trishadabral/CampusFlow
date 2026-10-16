# ER Diagram (textual — draw in dbdiagram.io / draw.io for the report)

```
users 1───0..1 students
  │             │
  │             │ 1───* applications *───1 drives ───1 companies
  │             │                                    │
  │             │ 1───* bookings *───1 slots ─────────┘
  │             │                         │
  │             └── created_by drives     └──0..1 allocations *───1 resources
  │
  └── allocated_by allocations
```

**Relationships:**
- `users` → `students`: 1:1 (PK is FK, `ON DELETE CASCADE`)
- `drives` → `companies`: N:1
- `applications`: N:1 to `drives`, N:1 to `students`; UNIQUE(`drive_id`,`student_id`)
- `slots`: N:1 to `drives`; `bookings`: N:1 to `slots`, N:1 to `students`; UNIQUE(`slot_id`,`student_id`)
- `resources` 1:N `allocations`; `allocations` N:1 to `slots` (nullable, `ON DELETE SET NULL`)
- `audit_log` / `lock_events`: append-only, no FKs back (history must survive deletes)

**Keys:** all tables surrogate PK (`id` AUTO_INCREMENT) except `students` (PK = `user_id`, natural 1:1).
**Constraints doing real work:** `CHECK (booked_count <= capacity)`, `CHECK (ends_at > starts_at)`,
UNIQUE pairs, ENUMs for state machines (application status, booking status, slot type).
**Indexes:** composite on hot filter paths — `(drive_id, status)`, `(drive_id, starts_at)`,
`(branch, cgpa)`, `(resource_id, starts_at, ends_at)`.
