-- ============================================================================
-- CampusFlow Viva SQL Evidence: Member 4 — Akshay Singh Gusain
-- Modules Owned:
--   OS 5  : Resource Allocation (First Fit, Best Fit in pc-allocator.js)
--   OS 6  : Resource Utilization (Utilization Numbers, Capacity Strips)
--   DBMS 5: Test & Interview Management (Questions, Results, Slots, Grading)
--   DBMS 6: Resource Management (Resources, Computers, Audit Triggers)
--
-- NOTICE: This script was NOT run by the assistant during documentation.
-- It is designed to be executed once by the member in MySQL Workbench or CLI.
-- All data-mutating demonstrations are wrapped in START TRANSACTION ... ROLLBACK.
-- ============================================================================

/*
WHAT TO SAY:
"I am Akshay Singh Gusain. I designed CampusFlow's resource allocation and test
management subsystems. In this demonstration, I will show how our database audit triggers
automatically capture every state mutation into an immutable log, demonstrate how our
virtual stored column prevents double-booking a physical lab PC, execute an allocation
overlap collision detector, and calculate real-time hardware utilization."
*/

USE campusflow;

-- ============================================================================
-- SECTION 1: DATABASE AUDIT TRIGGER IN ACTION
-- ============================================================================

-- Explanation:
-- Our database uses triggers (e.g. `trg_applications_audit_au`, `trg_bookings_audit_ai`)
-- that fire automatically inside MySQL whenever records are inserted, updated, or deleted.
-- The teacher will see an audit row created with the old/new values serialized as JSON.

START TRANSACTION;

-- Step 1.1: Capture count of audit records before mutation
SELECT COUNT(*) AS audit_records_before FROM audit_log;

-- Step 1.2: Perform an application status change
UPDATE applications 
SET status = 'selected' 
WHERE id = 1;

-- Step 1.3: Query the audit log immediately
-- The teacher will see an 'UPDATE' action for entity 'application' with old and new status:
SELECT 
    id, 
    action, 
    entity, 
    entity_id, 
    details, 
    created_at 
FROM audit_log 
WHERE entity = 'application' 
ORDER BY id DESC 
LIMIT 1;

-- Step 1.4: Revert transaction
ROLLBACK;


-- ============================================================================
-- SECTION 2: SINGLE ACTIVE EXAM SESSION ENFORCEMENT
-- ============================================================================

-- Explanation:
-- In `exam_sessions`, column `active_computer_id` is a STORED generated column:
--   `active_computer_id INT GENERATED ALWAYS AS (IF(status IN ('scheduled', 'active'), computer_id, NULL)) STORED`
-- with a `UNIQUE KEY uq_active_computer_session (active_computer_id)`.
-- If a PC already has an 'active' or 'scheduled' session, any second attempt to schedule
-- an active session for that PC must fail at the database constraint level!

START TRANSACTION;

-- Step 2.1: Find an available computer:
SELECT id, pc_code, status FROM computers WHERE status = 'available' LIMIT 1;

-- Step 2.2: Insert first active session for this computer (succeeds):
INSERT INTO exam_sessions (
    computer_id, student_id, drive_id, status, exam_window_keyword
) VALUES (
    1, 1, 1, 'active', 'CampusFlow'
);

-- Step 2.3: Attempt to insert a SECOND active session on the EXACT SAME computer:
-- Expected result: Error 1062 (23000): Duplicate entry '1' for key 'exam_sessions.uq_active_computer_session'
INSERT INTO exam_sessions (
    computer_id, student_id, drive_id, status, exam_window_keyword
) VALUES (
    1, 2, 1, 'active', 'CampusFlow'
);

ROLLBACK;


-- ============================================================================
-- SECTION 3: TIME-INTERVAL ALLOCATION OVERLAP DETECTOR
-- ============================================================================

-- Explanation:
-- Checks for temporal collisions in lab or room bookings where two allocations
-- overlap in time on the same resource ($A_{start} < B_{end} \land B_{start} < A_{end}$).

SELECT 
    a1.id AS allocation_1_id,
    a2.id AS allocation_2_id,
    r.name AS resource_name,
    r.type AS resource_type,
    a1.starts_at AS alloc1_start,
    a1.ends_at AS alloc1_end,
    a2.starts_at AS alloc2_start,
    a2.ends_at AS alloc2_end,
    a1.purpose AS alloc1_purpose,
    a2.purpose AS alloc2_purpose
FROM allocations a1
JOIN allocations a2 ON a1.resource_id = a2.resource_id AND a1.id < a2.id
JOIN resources r ON r.id = a1.resource_id
WHERE a1.starts_at < a2.ends_at 
  AND a2.starts_at < a1.ends_at;

-- What the teacher will see:
-- If Banker's safety check works properly, this returns 0 rows (no collisions exist).


-- ============================================================================
-- SECTION 4: HARDWARE CAPACITY & UTILIZATION AGGREGATE
-- ============================================================================

-- Explanation:
-- Computes real-time capacity metrics across computer labs: total physical machines,
-- machines currently allocated or online, and computed utilization percentages.

SELECT 
    r.id AS lab_id,
    r.name AS lab_name,
    r.capacity AS total_seat_capacity,
    COUNT(c.id) AS registered_pcs,
    SUM(c.status = 'allocated') AS allocated_pcs,
    SUM(c.status = 'available') AS available_pcs,
    SUM(c.status = 'maintenance') AS maintenance_pcs,
    IF(COUNT(c.id) = 0, 0,
       ROUND((SUM(c.status = 'allocated') / COUNT(c.id)) * 100, 2)) AS utilization_pct
FROM resources r
LEFT JOIN computers c ON c.resource_id = r.id
WHERE r.type = 'lab'
GROUP BY r.id, r.name, r.capacity
ORDER BY utilization_pct DESC;

-- What the teacher will see:
-- A dashboard summary row per lab showing real-time utilization % and seat counts.

