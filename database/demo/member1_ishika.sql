-- ============================================================================
-- CampusFlow Viva SQL Evidence: Member 1 — Ishika Rawat
-- Modules Owned:
--   OS 4  : Deadlock Management (Banker's Algorithm, Safety Vectors)
--   OS 8  : Agent & Device Control (Windows Service, Session 0, Pipe IPC)
--   DBMS 1: Database Design & Schema Management (3NF, Integrity Constraints)
--   DBMS 2: Student & Company Management (RBAC, Profiles, Relations)
--
-- NOTICE: This script was NOT run by the assistant during documentation.
-- It is designed to be executed once by the member in MySQL Workbench or CLI.
-- All data-mutating demonstrations are wrapped in START TRANSACTION ... ROLLBACK
-- so your demo database remains clean and intact.
-- ============================================================================

/*
WHAT TO SAY:
"I am Ishika Rawat, lead on CampusFlow. I designed our 3NF relational schema,
its integrity constraints, and foreign key cascades, as well as the student and
company management layers. In this demonstration, I will prove that MySQL strictly
enforces our domain rules—preventing illegal CGPAs, duplicate student applications,
and orphan records—and explain how our composite indexes optimize lookup times."
*/

USE campusflow;

-- ============================================================================
-- SECTION 1: VERIFYING SCHEMA DDL AND REFERENTIAL ACTIONS
-- ============================================================================

-- Teacher will see: The real engine DDL with CHECK constraints, foreign keys,
-- cascading delete actions, and index definitions for students and users.
SHOW CREATE TABLE users\G
SHOW CREATE TABLE students\G


-- ============================================================================
-- SECTION 2: CHECK CONSTRAINT ENFORCEMENT (CGPA DOMAIN INTEGRITY)
-- ============================================================================

-- Explanation:
-- Students must have CGPA between 0.00 and 10.00 (`CHECK (cgpa BETWEEN 0 AND 10)`).
-- Inserting an illegal CGPA of 11.50 or -0.50 must be rejected by MySQL InnoDB.

START TRANSACTION;

-- Expected result: Error 3819 (HY000): Check constraint 'students_chk_1' is violated.
-- The teacher will see MySQL immediately reject the query.
INSERT INTO students (
    user_id, roll_no, branch, cgpa, backlogs, graduation_year
) VALUES (
    1, 'DEMO-ROLL-999', 'CSE', 11.50, 0, 2026
);

ROLLBACK;


-- ============================================================================
-- SECTION 3: CANDIDATE KEY & UNIQUE CONSTRAINT ENFORCEMENT
-- ============================================================================

-- Explanation:
-- A student can apply to a placement drive at most once (`UNIQUE KEY uq_application (drive_id, student_id)`).
-- Attempting to submit a second application must trigger a duplicate key violation.

START TRANSACTION;

-- We find a student and drive that already has an application:
SELECT id, drive_id, student_id, status FROM applications LIMIT 1;

-- Now deliberately attempt to insert the same (drive_id, student_id) pair:
-- Expected result: Error 1062 (23000): Duplicate entry '...-...' for key 'applications.uq_application'
INSERT INTO applications (drive_id, student_id, status)
SELECT drive_id, student_id, 'applied' 
FROM applications 
LIMIT 1;

ROLLBACK;


-- ============================================================================
-- SECTION 4: FOREIGN KEY ENFORCEMENT (REFERENTIAL INTEGRITY)
-- ============================================================================

-- Explanation:
-- The `students` table has `FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE`.
-- Inserting a student with a nonexistent `user_id` (e.g. 999999) must be rejected.

START TRANSACTION;

-- Expected result: Error 1452 (23000): Cannot add or update a child row: a foreign key constraint fails
INSERT INTO students (
    user_id, roll_no, branch, cgpa, backlogs, graduation_year
) VALUES (
    999999, 'ORPHAN-ROLL-01', 'IT', 8.40, 0, 2026
);

ROLLBACK;


-- ============================================================================
-- SECTION 5: INDEX USAGE & QUERY OPTIMIZATION (EXPLAIN PLAN)
-- ============================================================================

-- Explanation:
-- Recruiters frequently search students by branch and minimum CGPA.
-- We created a composite index: `INDEX idx_students_branch_cgpa (branch, cgpa)`.
-- The teacher will see the query optimizer perform an index range scan using this key.

EXPLAIN
SELECT user_id, roll_no, branch, cgpa
FROM students
WHERE branch = 'CSE' AND cgpa >= 8.00;

-- What the teacher will see in EXPLAIN output:
--   table: students
--   type: ref or range
--   possible_keys: idx_students_branch_cgpa
--   key: idx_students_branch_cgpa
--   ref: const
--   Extra: Using index condition

