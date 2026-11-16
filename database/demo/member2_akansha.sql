-- ============================================================================
-- CampusFlow Viva SQL Evidence: Member 2 — Akansha Parley
-- Modules Owned:
--   OS 2  : Queue Management (Batch Scheduling & Test Pipeline in pipeline.js)
--   OS 7  : Exam Environment Monitoring (Agent Telemetry & Review Flow)
--   DBMS 3: Placement Drive Management (Drives, Applications, Offers Workflow)
--   DBMS 4: Eligibility & Application Management (JSON Queries, Stored Procedure)
--
-- NOTICE: This script was NOT run by the assistant during documentation.
-- It is designed to be executed once by the member in MySQL Workbench or CLI.
-- All data-mutating demonstrations are wrapped in START TRANSACTION ... ROLLBACK
-- so your demo database remains clean and intact.
-- ============================================================================

/*
WHAT TO SAY:
"I am Akansha Parley. I built the recruitment pipeline and eligibility engine,
including candidate qualification evaluation and applicant tracking. Today I will
demonstrate our high-performance eligibility matching using MySQL's native JSON
containment functions, execute our batch shortlisting stored procedure sp_generate_shortlist
inside a safe transaction, and demonstrate analytics aggregation using GROUP BY and HAVING."
*/

USE campusflow;

-- ============================================================================
-- SECTION 1: NATIVE JSON ELIGIBILITY QUERY & EXPLAIN PLAN
-- ============================================================================

-- Explanation:
-- Each drive defines allowed engineering branches as a native JSON array
-- (e.g., '["CSE", "IT"]'). A student is eligible if:
--   1. student.cgpa >= drive.min_cgpa
--   2. student.backlogs <= drive.max_backlogs
--   3. student.graduation_year = drive.graduation_year
--   4. JSON_CONTAINS(drive.allowed_branches, JSON_QUOTE(student.branch)) = 1

-- First, let's run the actual query to see matching eligible students for Drive #1:
SELECT 
    d.id AS drive_id,
    d.title AS drive_title,
    d.allowed_branches,
    d.min_cgpa,
    s.user_id,
    s.roll_no,
    s.branch,
    s.cgpa,
    s.backlogs,
    s.graduation_year
FROM drives d
JOIN students s ON s.graduation_year = d.graduation_year
WHERE d.id = 1
  AND s.cgpa >= d.min_cgpa
  AND s.backlogs <= d.max_backlogs
  AND JSON_CONTAINS(d.allowed_branches, JSON_QUOTE(s.branch)) = 1;

-- Now show the execution plan to the examiner:
-- The teacher will see the join order and filtering steps chosen by the optimizer.
EXPLAIN
SELECT 
    s.user_id, s.roll_no, s.branch, s.cgpa
FROM drives d
JOIN students s ON s.graduation_year = d.graduation_year
WHERE d.id = 1
  AND s.cgpa >= d.min_cgpa
  AND s.backlogs <= d.max_backlogs
  AND JSON_CONTAINS(d.allowed_branches, JSON_QUOTE(s.branch)) = 1;


-- ============================================================================
-- SECTION 2: BATCH SHORTLISTING STORED PROCEDURE (sp_generate_shortlist)
-- ============================================================================

-- Explanation:
-- Rather than looping through applications in Node.js, the system delegates
-- set-oriented qualification to `sp_generate_shortlist(p_drive_id, OUT p_count)`.
-- It updates all 'applied' rows to either 'shortlisted' or 'rejected' in one atomic step.

START TRANSACTION;

-- Step 2.1: Inspect current application statuses for Drive #1 before execution
SELECT id, drive_id, student_id, status 
FROM applications 
WHERE drive_id = 1;

-- Step 2.2: Execute the stored procedure
CALL sp_generate_shortlist(1, @updated_count);

-- Step 2.3: Display the OUT parameter count returned by the procedure
-- The teacher will see the exact count of modified rows.
SELECT @updated_count AS total_applications_evaluated;

-- Step 2.4: Verify the newly updated statuses in the database
SELECT id, drive_id, student_id, status 
FROM applications 
WHERE drive_id = 1;

-- Step 2.5: Revert all changes so test data remains untouched
ROLLBACK;

-- Verify statuses rolled back cleanly:
SELECT id, drive_id, student_id, status 
FROM applications 
WHERE drive_id = 1;


-- ============================================================================
-- SECTION 3: RECRUITMENT FUNNEL ANALYSIS WITH GROUP BY AND HAVING
-- ============================================================================

-- Explanation:
-- Demonstrates multi-table aggregation across companies, drives, and applications.
-- Computes the conversion funnel and filters for high-traction drives having
-- more than a specified volume of candidates.

SELECT 
    d.id AS drive_id,
    d.title AS drive_title,
    c.name AS company_name,
    COUNT(a.id) AS total_applicants,
    SUM(a.status = 'shortlisted') AS shortlisted_count,
    SUM(a.status = 'selected') AS selected_count,
    ROUND(SUM(a.status = 'selected') / COUNT(a.id) * 100, 2) AS selection_rate_pct
FROM drives d
JOIN companies c ON c.id = d.company_id
LEFT JOIN applications a ON a.drive_id = d.id
GROUP BY d.id, d.title, c.name
HAVING total_applicants >= 1
ORDER BY total_applicants DESC;

-- What the teacher will see:
-- A summary table showing company name, drive title, total applicants,
-- shortlisted count, selected count, and the computed percentage, filtered by HAVING.

