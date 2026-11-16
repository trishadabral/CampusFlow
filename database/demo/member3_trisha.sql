-- ============================================================================
-- CampusFlow Viva SQL Evidence: Member 3 — Trisha Dabral
-- Modules Owned:
--   OS 1  : Task Scheduling (FCFS, Priority, SJF, SRTF, RR in cpu-scheduler.js)
--   OS 3  : Process Synchronization (Critical Section, Row Locks, Stress Test)
--   DBMS 7: Transactions & Concurrency Control (ACID, FOR UPDATE, Isolation Levels)
--   DBMS 8: Queries, Reports & Analytics (Analytical Views & Placement Stats)
--
-- NOTICE: This script was NOT run by the assistant during documentation.
-- It is designed to be executed by the member in two separate MySQL client windows.
-- All data-mutating demonstrations are wrapped in START TRANSACTION ... ROLLBACK.
-- ============================================================================

/*
WHAT TO SAY:
"I am Trisha Dabral. I implemented the process synchronization and concurrency
control mechanisms in CampusFlow. Today I will demonstrate how our system guarantees
ACID properties under high concurrency: showing row-level locking with SELECT FOR UPDATE
to prevent overselling seats, demonstrating transaction isolation under REPEATABLE READ,
reproducing and resolving an InnoDB deadlock, and querying our database reporting views."
*/

USE campusflow;

-- ============================================================================
-- PART 1: TWO-SESSION CONCURRENCY EXPERIMENTS
-- (Open two terminal windows or workbench tabs: Session A and Session B)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- EXPERIMENT 1.1: ROW-LEVEL EXCLUSIVE LOCK (SELECT ... FOR UPDATE) BLOCKING
-- ----------------------------------------------------------------------------
-- Purpose: Prove that SELECT ... FOR UPDATE on a slot row creates an exclusive lock
-- that blocks concurrent transactions until the first transaction commits or rolls back.

-- [SESSION A — Run First]:
/*
    USE campusflow;
    START TRANSACTION;
    SELECT id, title, capacity, booked_count 
    FROM slots 
    WHERE id = 1 
    FOR UPDATE;
    -- Note: Keep this transaction open! Do not run COMMIT yet.
*/

-- [SESSION B — Run Second while Session A is still open]:
/*
    USE campusflow;
    START TRANSACTION;
    -- This statement will BLOCK (hang) waiting for Session A's lock:
    SELECT id, title, capacity, booked_count 
    FROM slots 
    WHERE id = 1 
    FOR UPDATE;
*/

-- [SESSION A — Finish]:
/*
    -- Execute ROLLBACK or COMMIT in Session A:
    ROLLBACK;
    -- As soon as Session A rolls back, observe Session B immediately UNBLOCKS!
*/

-- [SESSION B — Clean up]:
/*
    ROLLBACK;
*/


-- ----------------------------------------------------------------------------
-- EXPERIMENT 1.2: PREVENTING LOST UPDATES (THE CRITICAL SECTION)
-- ----------------------------------------------------------------------------
-- Purpose: Without locking, two transactions reading booked_count simultaneously
-- would both increment from the same base value, losing one student's booking.
-- CampusFlow uses SELECT ... FOR UPDATE so increments are serialized and capacity
-- is never exceeded.

-- [SESSION A]:
/*
    START TRANSACTION;
    SELECT capacity, booked_count FROM slots WHERE id = 1 FOR UPDATE;
    -- Suppose capacity is 30, booked_count is 12. Session A verifies 12 < 30.
    UPDATE slots SET booked_count = booked_count + 1 WHERE id = 1;
    -- Simulates booking insertion:
    -- INSERT INTO bookings (slot_id, student_id, status) VALUES (1, 991, 'confirmed');
    COMMIT;
*/


-- ----------------------------------------------------------------------------
-- EXPERIMENT 1.3: TRANSACTION ISOLATION — REPEATABLE READ VS READ COMMITTED
-- ----------------------------------------------------------------------------
-- Purpose: Demonstrates MySQL's default REPEATABLE READ isolation.
-- Under REPEATABLE READ, Session A sees a consistent snapshot taken at the first read,
-- even after Session B commits new rows!

-- [SESSION A]:
/*
    START TRANSACTION;
    -- Read count of current bookings:
    SELECT COUNT(*) AS initial_count FROM bookings WHERE slot_id = 1;
*/

-- [SESSION B — In Second Window]:
/*
    START TRANSACTION;
    INSERT INTO bookings (slot_id, student_id, status) VALUES (1, 992, 'confirmed');
    COMMIT;
    -- Session B has committed the new row!
*/

-- [SESSION A — Back in First Window]:
/*
    -- Under REPEATABLE READ (Default):
    -- This query STILL returns the initial_count! It does not see Session B's commit.
    SELECT COUNT(*) AS snapshot_count FROM bookings WHERE slot_id = 1;
    
    COMMIT;
    
    -- Now that Session A started a new transaction, it sees the committed change:
    SELECT COUNT(*) AS updated_count FROM bookings WHERE slot_id = 1;
*/


-- ----------------------------------------------------------------------------
-- EXPERIMENT 1.4: DEADLOCK REPRODUCTION & ENGINE STATUS
-- ----------------------------------------------------------------------------
-- Purpose: Reproduce a classic 2-resource circular wait deadlock.
-- Session A locks Slot 1, then wants Slot 2.
-- Session B locks Slot 2, then wants Slot 1.
-- InnoDB detects the cycle in its wait-for graph and rolls back one transaction!

-- [SESSION A]:
/*
    START TRANSACTION;
    UPDATE slots SET booked_count = booked_count + 1 WHERE id = 1;
*/

-- [SESSION B]:
/*
    START TRANSACTION;
    UPDATE slots SET booked_count = booked_count + 1 WHERE id = 2;
*/

-- [SESSION A]:
/*
    -- This blocks waiting for Session B's lock on Slot 2:
    UPDATE slots SET booked_count = booked_count + 1 WHERE id = 2;
*/

-- [SESSION B]:
/*
    -- This creates a circular wait!
    -- InnoDB detects deadlock immediately and prints:
    -- Error Code: 1213. Deadlock found when trying to get lock; try restarting transaction
    UPDATE slots SET booked_count = booked_count + 1 WHERE id = 1;
*/

-- [SESSION A]:
/*
    ROLLBACK;
*/

-- Teacher will see: The InnoDB deadlock log with transaction addresses and cycle details:
SHOW ENGINE INNODB STATUS\G


-- ============================================================================
-- PART 2: ANALYTICAL REPORTING VIEWS
-- ============================================================================

-- View 1: Recruiter Drive Funnel (v_drive_report)
-- Teacher will see: Drive title, company name, applied count, shortlisted, selected, and avg CGPA.
SELECT * FROM v_drive_report;

-- View 2: Branch-wise Placement Percentages (v_branch_placement)
-- Teacher will see: CSE, IT, ECE with total students, applicants, placed count, and placement_pct.
SELECT * FROM v_branch_placement;

-- View 3: Company Recruitment Performance (v_company_funnel)
-- Teacher will see: Company applicant volume and conversion through each funnel stage.
SELECT * FROM v_company_funnel;

-- View 4: Salary Package Statistics (v_package_stats)
-- Teacher will see: Minimum, maximum, and average CTC (in LPA) across drives.
SELECT * FROM v_package_stats;

