-- ============================================================================
-- CampusFlow OS — database/schema.sql
-- MySQL 8 / InnoDB. 3NF. Run:  mysql -u root -p < schema.sql
-- Creates database `campusflow` with all tables, indexes, triggers, procedures.
-- Seed data lives in server/src/seed.js (needs bcrypt for password hashes).
-- ============================================================================

CREATE DATABASE IF NOT EXISTS campusflow
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE campusflow;

-- ---------------------------------------------------------------- users --
-- One row per human. Role = privilege ring (admin > recruiter > student).
CREATE TABLE users (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  name          VARCHAR(100) NOT NULL,
  email         VARCHAR(150) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  reset_token VARCHAR(100) NULL,               -- password-reset token (Phase 2)
  reset_token_expires DATETIME NULL,           -- token expiry; NULL = no reset pending
  role          ENUM('student','recruiter','admin') NOT NULL,
  is_active     BOOLEAN NOT NULL DEFAULT 1,    -- admin can deactivate an account (merged 2026-11-16)
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ------------------------------------------------------------- students --
CREATE TABLE students (
  user_id         INT PRIMARY KEY,
  roll_no         VARCHAR(20) NOT NULL UNIQUE,
  branch          VARCHAR(10) NOT NULL,          -- CSE, IT, ECE, ME ...
  cgpa            DECIMAL(4,2) NOT NULL CHECK (cgpa BETWEEN 0 AND 10),
  backlogs        INT NOT NULL DEFAULT 0 CHECK (backlogs >= 0),
  graduation_year INT NOT NULL,
  photo_data MEDIUMTEXT NULL,                  -- base64 profile photo (no file storage)
  skills TEXT NULL,                            -- free-text skills, comma-separated
  resume_filename VARCHAR(255) NULL,           -- original uploaded file name
  resume_data MEDIUMTEXT NULL,                 -- base64 PDF resume (no file storage)
  phone VARCHAR(20) NULL,                      -- student phone (merged 2026-11-16)
  projects JSON NULL,                          -- [{title, desc?, link?}] (merged 2026-11-16)
  certifications JSON NULL,                    -- [{name, issuer?, year?}] (merged 2026-11-16)
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_students_branch_cgpa (branch, cgpa)
);

-- ------------------------------------------------------------ companies --
CREATE TABLE companies (
  id      INT AUTO_INCREMENT PRIMARY KEY,
  name    VARCHAR(120) NOT NULL,
  website VARCHAR(200),
  sector  VARCHAR(80),
  description      TEXT NULL,                  -- recruiter-editable company profile (merged 2026-11-16)
  location         VARCHAR(120) NULL,
  industry         VARCHAR(80) NULL,
  hr_contact_email VARCHAR(255) NULL
);

-- --------------------------------------------------------------- drives --
-- A placement drive = a "job" submitted to the system.
CREATE TABLE drives (
  id                   INT AUTO_INCREMENT PRIMARY KEY,
  company_id           INT NOT NULL,
  title                VARCHAR(150) NOT NULL,
  description          TEXT,
  min_cgpa             DECIMAL(4,2) NOT NULL DEFAULT 0,
  allowed_branches     JSON NOT NULL,           -- e.g. ["CSE","IT"]
  max_backlogs         INT NOT NULL DEFAULT 0,
  graduation_year      INT NOT NULL,
  application_deadline DATETIME NOT NULL,
  -- Pipeline configuration (v2): the system manages test & interview
  -- sessions from these settings — the recruiter never books rooms.
  test_date            DATE NULL,
  interview_date       DATE NULL,
  test_duration_min    INT NOT NULL DEFAULT 60,
  test_mode            ENUM('aptitude', 'coding', 'both') NOT NULL DEFAULT 'aptitude',  -- what the test includes
  interview_duration_min INT NOT NULL DEFAULT 20,
  num_interviewers     INT NOT NULL DEFAULT 2,
  min_test_score       DECIMAL(5,2) NOT NULL DEFAULT 50.00,  -- % needed to qualify
  max_shortlist        INT NOT NULL DEFAULT 20,              -- cap on interview shortlist
  package_lpa          DECIMAL(6,2) NULL,                  -- advertised package for the drive (LPA)
  status               ENUM('draft','open','testing','interviews','closed') NOT NULL DEFAULT 'open',
  created_by           INT NOT NULL,
  created_at           TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (company_id) REFERENCES companies(id),
  FOREIGN KEY (created_by) REFERENCES users(id),
  INDEX idx_drives_status_deadline (status, application_deadline)
);

-- ---------------------------------------------------------- drive_rounds --
-- Multi-round drives: each round has its own cutoff score and status.
CREATE TABLE drive_rounds (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  drive_id   INT NOT NULL,
  round_no   INT NOT NULL,
  name       VARCHAR(100) NOT NULL,
  cutoff     DECIMAL(5,2) NOT NULL DEFAULT 50.00,
  status     ENUM('pending','active','done') NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_round (drive_id, round_no),
  FOREIGN KEY (drive_id) REFERENCES drives(id) ON DELETE CASCADE,
  INDEX idx_rounds_drive (drive_id)
);

-- --------------------------------------------------------- applications --
CREATE TABLE applications (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  drive_id   INT NOT NULL,
  student_id INT NOT NULL,                      -- FK -> students.user_id
  status     ENUM('applied','test_taken','shortlisted','rejected','selected','withdrawn') NOT NULL DEFAULT 'applied',
  applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_application (drive_id, student_id),
  FOREIGN KEY (drive_id)   REFERENCES drives(id)   ON DELETE CASCADE,
  FOREIGN KEY (student_id) REFERENCES students(user_id) ON DELETE CASCADE,
  INDEX idx_applications_drive (drive_id, status)
);

-- ------------------------------------------------------------ resources --
-- Physical resources managed by the allocator (labs, rooms, interviewers).
CREATE TABLE resources (
  id       INT AUTO_INCREMENT PRIMARY KEY,
  name     VARCHAR(120) NOT NULL,
  type     ENUM('lab','room','interviewer') NOT NULL,
  capacity INT NOT NULL DEFAULT 1 CHECK (capacity > 0),  -- seats for labs, 1 for rooms/interviewers
  location VARCHAR(120),
  status   ENUM('available','maintenance') NOT NULL DEFAULT 'available',
  INDEX idx_resources_type (type, status)
);

-- ---------------------------------------------------------- lab_machines --
-- Live status of individual machines inside a lab resource, as reported
-- by the lab agent (see the C++ lab agent in Phase 2).
CREATE TABLE lab_machines (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  resource_id  INT NULL,
  machine_name VARCHAR(100) NOT NULL,
  status       ENUM('up','free','busy','down') NOT NULL DEFAULT 'up',
  last_seen    TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  reported_by  VARCHAR(100) NULL,
  UNIQUE KEY uq_machine (resource_id, machine_name),
  FOREIGN KEY (resource_id) REFERENCES resources(id) ON DELETE SET NULL
);

-- ---------------------------------------------------------------- slots --
-- Test / interview slots = schedulable resources with finite capacity.
CREATE TABLE slots (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  drive_id     INT NOT NULL,
  resource_id  INT NULL,                          -- venue: lab for tests, room for interviews
  type         ENUM('test','interview') NOT NULL,
  title        VARCHAR(150) NOT NULL,
  starts_at    DATETIME NOT NULL,
  ends_at      DATETIME NOT NULL,
  capacity     INT NOT NULL CHECK (capacity > 0),
  booked_count INT NOT NULL DEFAULT 0 CHECK (booked_count >= 0),
  auto_scheduled TINYINT(1) NOT NULL DEFAULT 0,  -- 1 = generated by POST /schedule/auto
  CHECK (booked_count <= capacity),
  CHECK (ends_at > starts_at),
  FOREIGN KEY (drive_id) REFERENCES drives(id) ON DELETE CASCADE,
  FOREIGN KEY (resource_id) REFERENCES resources(id) ON DELETE SET NULL,
  INDEX idx_slots_drive (drive_id, starts_at),
  INDEX idx_slots_resource (resource_id),
  INDEX idx_slots_auto (drive_id, auto_scheduled)
);

-- ------------------------------------------------------------- bookings --
-- Booking a seat = entering the critical section. One transaction in app code:
--   BEGIN; SELECT ... FOR UPDATE; INSERT; UPDATE booked_count; COMMIT;
CREATE TABLE bookings (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  slot_id    INT NOT NULL,
  student_id INT NOT NULL,
  status     ENUM('confirmed','cancelled','waitlist') NOT NULL DEFAULT 'confirmed',
  booked_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_booking (slot_id, student_id),
  FOREIGN KEY (slot_id)    REFERENCES slots(id) ON DELETE CASCADE,
  FOREIGN KEY (student_id) REFERENCES students(user_id) ON DELETE CASCADE,
  INDEX idx_bookings_slot (slot_id)
);


-- ---------------------------------------------------------- allocations --
CREATE TABLE allocations (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  resource_id  INT NOT NULL,
  slot_id      INT NULL,                          -- optional link to a test/interview slot
  purpose      VARCHAR(200) NOT NULL,
  seats_needed INT NOT NULL DEFAULT 1,           -- for labs: how many seats of capacity
  starts_at    DATETIME NOT NULL,
  ends_at      DATETIME NOT NULL,
  allocated_by INT NOT NULL,
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CHECK (ends_at > starts_at),
  FOREIGN KEY (resource_id)  REFERENCES resources(id),
  FOREIGN KEY (slot_id)      REFERENCES slots(id) ON DELETE SET NULL,
  FOREIGN KEY (allocated_by) REFERENCES users(id),
  INDEX idx_allocations_resource_time (resource_id, starts_at, ends_at)
);

-- ---------------------------------------------------------- manual_events --
-- Hand-added bookings on the resource calendar (e.g. a lab reserved for
-- a workshop). They sit alongside system-generated slots/allocations.
CREATE TABLE manual_events (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  resource_id INT NOT NULL,
  title       VARCHAR(200) NOT NULL,
  starts_at   DATETIME NOT NULL,
  ends_at     DATETIME NOT NULL,
  created_by  INT NULL,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CHECK (ends_at > starts_at),
  FOREIGN KEY (resource_id) REFERENCES resources(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by)  REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_events_resource (resource_id, starts_at, ends_at)
);

-- ------------------------------------------------------- test_questions --
-- Recruiter-built test questions: aptitude MCQs and coding questions share
-- this table. Aptitude rows carry options/correct_index; coding rows store
-- NULL there and carry language, starter code and the expected output.
CREATE TABLE test_questions (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  drive_id        INT NOT NULL,
  question_text   TEXT NOT NULL,
  type            ENUM('aptitude', 'coding') NOT NULL DEFAULT 'aptitude',
  options         JSON NULL,                   -- aptitude: ["opt A","opt B","opt C","opt D"]
  correct_index   TINYINT NULL,                -- aptitude: 0..3
  language        VARCHAR(20) NULL,            -- coding: 'javascript' | 'python'
  starter_code    TEXT NULL,                   -- coding: code students start from
  expected_output TEXT NULL,                   -- coding: exact expected stdout
  marks           INT NOT NULL DEFAULT 1,
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (drive_id) REFERENCES drives(id) ON DELETE CASCADE,
  INDEX idx_tq_drive (drive_id)
);

-- --------------------------------------------------------- test_results --
-- One row per student per drive: the auto-graded outcome.
CREATE TABLE test_results (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  drive_id    INT NOT NULL,
  student_id  INT NOT NULL,                    -- FK -> students.user_id
  score       DECIMAL(6,2) NOT NULL,
  total       DECIMAL(6,2) NOT NULL,
  percentage  DECIMAL(5,2) NOT NULL,
  answers     JSON NULL,                       -- {question_id: chosen_index | code}
  tab_switches INT NOT NULL DEFAULT 0,         -- times the student left the test tab
  submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_test_result (drive_id, student_id),
  FOREIGN KEY (drive_id)   REFERENCES drives(id)   ON DELETE CASCADE,
  FOREIGN KEY (student_id) REFERENCES students(user_id) ON DELETE CASCADE,
  INDEX idx_tr_drive (drive_id, percentage)
);

-- ----------------------------------------------------- interview_feedback --
-- One feedback row per interviewer per student per drive.
CREATE TABLE interview_feedback (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  drive_id       INT NOT NULL,
  student_id     INT NOT NULL,                      -- FK -> students.user_id
  interviewer_id INT NOT NULL,
  round_id       INT NULL,
  score          DECIMAL(5,2) NOT NULL,
  remarks        TEXT NULL,
  created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_feedback (drive_id, student_id, interviewer_id),
  FOREIGN KEY (drive_id)       REFERENCES drives(id) ON DELETE CASCADE,
  FOREIGN KEY (student_id)     REFERENCES students(user_id) ON DELETE CASCADE,
  FOREIGN KEY (interviewer_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (round_id)       REFERENCES drive_rounds(id) ON DELETE SET NULL
);

-- --------------------------------------------------------- offer_letters --
-- One generated offer letter per selected student per drive.
CREATE TABLE offer_letters (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  drive_id     INT NOT NULL,
  student_id   INT NOT NULL,                        -- FK -> students.user_id
  package_lpa  DECIMAL(6,2) NULL,
  joining_date DATE NULL,
  letter_text  TEXT NULL,
  generated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  status       ENUM('pending', 'accepted', 'declined', 'withdrawn') NOT NULL DEFAULT 'pending',
  responded_at TIMESTAMP NULL,
  UNIQUE KEY uq_offer (drive_id, student_id),
  FOREIGN KEY (drive_id)   REFERENCES drives(id) ON DELETE CASCADE,
  FOREIGN KEY (student_id) REFERENCES students(user_id) ON DELETE CASCADE
);

-- -------------------------------------------------------- notifications --
-- In-app inbox: the system tells students about test sessions, results,
-- and interview schedules. Links are client routes (e.g. /student/tests/3).
CREATE TABLE notifications (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  user_id    INT NOT NULL,
  title      VARCHAR(200) NOT NULL,
  body       TEXT,
  link       VARCHAR(200) NULL,
  is_read    TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_notif_user (user_id, is_read, created_at)
);

-- ------------------------------------------------------------ audit_log --
-- Written by triggers below. The DB telling on us: every mutation recorded.
CREATE TABLE audit_log (
  id         BIGINT AUTO_INCREMENT PRIMARY KEY,
  actor_id   INT NULL,
  action     VARCHAR(60) NOT NULL,               -- INSERT.booking, UPDATE.application ...
  entity     VARCHAR(60) NOT NULL,
  entity_id  INT NULL,
  details    JSON NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_audit_entity (entity, entity_id),
  INDEX idx_audit_time (created_at)
);

-- ---------------------------------------------------------- lock_events --
-- Written by the API's lock manager. Powers the Kernel Monitor's lock table.
CREATE TABLE lock_events (
  id         BIGINT AUTO_INCREMENT PRIMARY KEY,
  lock_name  VARCHAR(100) NOT NULL,              -- e.g. "slot:7"
  holder     VARCHAR(150) NOT NULL,              -- user email / "stress-test"
  action     ENUM('acquire','wait','release') NOT NULL,
  wait_ms    INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_lock_time (created_at),
  INDEX idx_lock_name (lock_name)
);

-- ============================================================ TRIGGERS ==
DELIMITER $$

-- Who acted is carried in the session variable @actor_id, set by the app
-- on the same connection that performs the write (see server/src/dbms/db.js
-- withActor/setActor). The scalar subquery validates it: an unset variable,
-- or an id that is not a user, records NULL ("System") instead of failing
-- the write on the audit_log.actor_id foreign key.
CREATE TRIGGER trg_bookings_audit_ai AFTER INSERT ON bookings FOR EACH ROW BEGIN
  INSERT INTO audit_log (actor_id, action, entity, entity_id, details)
  VALUES ((SELECT id FROM users WHERE id = @actor_id), 'INSERT', 'booking', NEW.id,
          JSON_OBJECT('slot_id', NEW.slot_id, 'student_id', NEW.student_id, 'status', NEW.status));
END$$

CREATE TRIGGER trg_bookings_audit_au AFTER UPDATE ON bookings FOR EACH ROW BEGIN
  INSERT INTO audit_log (actor_id, action, entity, entity_id, details)
  VALUES ((SELECT id FROM users WHERE id = @actor_id), 'UPDATE', 'booking', NEW.id,
          JSON_OBJECT('old_status', OLD.status, 'new_status', NEW.status));
END$$

CREATE TRIGGER trg_bookings_audit_ad AFTER DELETE ON bookings FOR EACH ROW BEGIN
  INSERT INTO audit_log (actor_id, action, entity, entity_id, details)
  VALUES ((SELECT id FROM users WHERE id = @actor_id), 'DELETE', 'booking', OLD.id,
          JSON_OBJECT('slot_id', OLD.slot_id, 'student_id', OLD.student_id));
END$$

CREATE TRIGGER trg_applications_audit_au AFTER UPDATE ON applications FOR EACH ROW BEGIN
  INSERT INTO audit_log (actor_id, action, entity, entity_id, details)
  VALUES ((SELECT id FROM users WHERE id = @actor_id), 'UPDATE', 'application', NEW.id,
          JSON_OBJECT('old_status', OLD.status, 'new_status', NEW.status, 'drive_id', NEW.drive_id));
END$$

CREATE TRIGGER trg_allocations_audit_ai AFTER INSERT ON allocations FOR EACH ROW BEGIN
  INSERT INTO audit_log (actor_id, action, entity, entity_id, details)
  VALUES ((SELECT id FROM users WHERE id = @actor_id), 'INSERT', 'allocation', NEW.id,
          JSON_OBJECT('resource_id', NEW.resource_id, 'purpose', NEW.purpose,
                      'seats_needed', NEW.seats_needed));
END$$

-- ============================================== STORED PROCEDURE: shortlist ==
-- The Eligibility Engine. One call shortlists a whole drive.
-- Usage: CALL sp_generate_shortlist(1, @n); SELECT @n;
CREATE PROCEDURE sp_generate_shortlist(IN p_drive_id INT, OUT p_count INT)
BEGIN
  UPDATE applications a
  JOIN students s ON s.user_id = a.student_id
  JOIN drives   d ON d.id = a.drive_id
  SET a.status = CASE
    WHEN s.cgpa >= d.min_cgpa
     AND s.backlogs <= d.max_backlogs
     AND s.graduation_year = d.graduation_year
     AND JSON_CONTAINS(d.allowed_branches, JSON_QUOTE(s.branch)) = 1
    THEN 'shortlisted' ELSE 'rejected'
  END
  WHERE a.drive_id = p_drive_id AND a.status = 'applied';

  SELECT ROW_COUNT() INTO p_count;
END$$

DELIMITER ;

-- ================================================================= VIEWS ==
-- Recruiter pipeline report: one row per drive.
CREATE OR REPLACE VIEW v_drive_report AS
SELECT d.id AS drive_id, d.title AS drive_title, c.name AS company,
       SUM(a.status='applied')     AS applied,
       SUM(a.status='shortlisted')  AS shortlisted,
       SUM(a.status='selected')     AS selected,
       ROUND(AVG(CASE WHEN a.status IN ('shortlisted','selected') THEN s.cgpa END), 2)
                                   AS avg_cgpa_shortlisted
FROM drives d
JOIN companies c ON c.id = d.company_id
LEFT JOIN applications a ON a.drive_id = d.id
LEFT JOIN students s ON s.user_id = a.student_id
GROUP BY d.id, d.title, c.name;

-- ============================================ EXAM MONITORING (merged 2026-11-16) ==
-- Physical exam PCs, the Windows agent fleet, proctoring sessions and
-- telemetry events. Merged from Ishika's repo; see docs/AGENT_API.md and
-- windows-agent/ for the agent that fills these tables.

-- ------------------------------------------------------------ computers --
-- One row per physical lab PC enrolled for proctored exams.
CREATE TABLE computers (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  resource_id     INT NOT NULL,
  pc_code         VARCHAR(50) NOT NULL UNIQUE,
  enrollment_code VARCHAR(64) NOT NULL UNIQUE,
  status          ENUM('available','allocated','maintenance') NOT NULL DEFAULT 'available',
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (resource_id) REFERENCES resources(id) ON DELETE CASCADE,
  INDEX idx_computers_resource (resource_id),
  INDEX idx_computers_status (status)
);

-- -------------------------------------------------------- agent_devices --
-- Windows agent installation instances authenticated via SHA-256 token hash.
CREATE TABLE agent_devices (
  id                 INT AUTO_INCREMENT PRIMARY KEY,
  computer_id        INT NOT NULL UNIQUE,
  token_hash         VARCHAR(64) NOT NULL,
  hostname           VARCHAR(150) NULL,
  agent_version      VARCHAR(50) NULL,
  status             ENUM('online','offline') NOT NULL DEFAULT 'offline',
  last_heartbeat_at      TIMESTAMP NULL,
  last_foreground_title  VARCHAR(255) NULL,
  last_foreground_process VARCHAR(255) NULL,
  registered_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (computer_id) REFERENCES computers(id) ON DELETE CASCADE,
  INDEX idx_agent_devices_heartbeat (status, last_heartbeat_at),
  INDEX idx_agent_devices_token (token_hash)
);

-- -------------------------------------------------------- exam_sessions --
-- PC-student exam allocations. Concurrency rule: at most one active session per PC.
CREATE TABLE exam_sessions (
  id                   INT AUTO_INCREMENT PRIMARY KEY,
  computer_id          INT NOT NULL,
  student_id           INT NOT NULL,
  drive_id             INT NULL,
  status               ENUM('scheduled','active','ended') NOT NULL DEFAULT 'scheduled',
  exam_window_keyword  VARCHAR(100) NOT NULL DEFAULT 'CampusFlow',
  starts_at            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ends_at              DATETIME NULL,
  ended_at             DATETIME NULL,
  created_by           INT NULL,
  active_computer_id   INT GENERATED ALWAYS AS (IF(status IN ('scheduled', 'active'), computer_id, NULL)) STORED,
  UNIQUE KEY uq_active_computer_session (active_computer_id),
  FOREIGN KEY (computer_id) REFERENCES computers(id),
  FOREIGN KEY (student_id)  REFERENCES students(user_id) ON DELETE CASCADE,
  FOREIGN KEY (drive_id)    REFERENCES drives(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by)  REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_exam_sessions_student (student_id),
  INDEX idx_exam_sessions_computer_status (computer_id, status)
);

-- ------------------------------------------------- prohibited_processes --
-- Blacklisted processes during exam sessions (communication/remote access apps).
CREATE TABLE prohibited_processes (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  process_name VARCHAR(100) NOT NULL UNIQUE,
  added_by     INT NULL,
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (added_by) REFERENCES users(id) ON DELETE SET NULL
);

-- ---------------------------------------------------- monitoring_events --
-- Agent-reported telemetry events (focus loss, window switch, forbidden process).
CREATE TABLE monitoring_events (
  id              BIGINT AUTO_INCREMENT PRIMARY KEY,
  exam_session_id INT NULL,
  computer_id     INT NOT NULL,
  event_type      ENUM('FOCUS_LOST','WINDOW_SWITCH','WINDOW_MINIMIZED','WINDOW_CLOSED','PROHIBITED_PROCESS','AGENT_DISCONNECTED','AGENT_RECONNECTED') NOT NULL,
  window_title    VARCHAR(255) NULL,
  process_name    VARCHAR(255) NULL,
  occurred_at     DATETIME(3) NOT NULL,
  received_at     TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP(3),
  review_status   ENUM('new','reviewed','dismissed') NOT NULL DEFAULT 'new',
  reviewed_by     INT NULL,
  review_note     TEXT NULL,
  FOREIGN KEY (exam_session_id) REFERENCES exam_sessions(id) ON DELETE SET NULL,
  FOREIGN KEY (computer_id)     REFERENCES computers(id) ON DELETE CASCADE,
  FOREIGN KEY (reviewed_by)     REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_events_session_occurred (exam_session_id, occurred_at),
  INDEX idx_events_computer_occurred (computer_id, occurred_at),
  INDEX idx_events_status (review_status)
);

-- -------------------------------------------------------------- os_runs --
-- One row per OS-lab scheduling run (single algorithm or compare).
CREATE TABLE os_runs (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  module VARCHAR(64) NOT NULL,          -- e.g. 'cpu-scheduler'
  algorithm VARCHAR(32) NOT NULL,       -- algorithm name or 'compare'
  input_json JSON NOT NULL,
  result_json JSON NOT NULL,
  created_by INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ----------------------------------------------------------- demo_seats --
-- Scratch table for the race-condition demo (isolated from real bookings).
CREATE TABLE demo_seats (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  capacity INT NOT NULL,
  confirmed INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- ============================================== EXTRA REPORT VIEWS (merged 2026-11-16) ==
-- Branch / company / package summaries for routes/reportsExtra.js. They
-- read `offer_letters` (this repo has no separate `offers` table): a
-- student counts as placed when their letter is accepted.

-- View: per-branch placement summary
CREATE OR REPLACE VIEW v_branch_placement AS
SELECT s.branch,
       COUNT(DISTINCT s.user_id) AS students,
       COUNT(DISTINCT a.id) AS applied,
       COUNT(DISTINCT o.id) AS placed,
       IF(COUNT(DISTINCT a.id) = 0, 0,
          ROUND(COUNT(DISTINCT o.id) / COUNT(DISTINCT a.id) * 100, 2)) AS placement_pct
FROM students s
LEFT JOIN applications a ON a.student_id = s.user_id
LEFT JOIN offer_letters o ON o.drive_id = a.drive_id AND o.student_id = a.student_id AND o.status = 'accepted'
GROUP BY s.branch;

-- View: company funnel summary
CREATE OR REPLACE VIEW v_company_funnel AS
SELECT c.id AS company_id,
       c.name,
       COUNT(DISTINCT d.id) AS drives,
       COUNT(DISTINCT a.id) AS applicants,
       COUNT(DISTINCT CASE WHEN a.status = 'shortlisted' THEN a.id END) AS shortlisted,
       COUNT(DISTINCT CASE WHEN a.status = 'selected' THEN a.id END) AS selected,
       COUNT(DISTINCT o.id) AS offers
FROM companies c
LEFT JOIN drives d ON d.company_id = c.id
LEFT JOIN applications a ON a.drive_id = d.id
LEFT JOIN offer_letters o ON o.drive_id = d.id
GROUP BY c.id, c.name;

-- View: package statistics per drive
CREATE OR REPLACE VIEW v_package_stats AS
SELECT d.id AS drive_id,
       d.title,
       MIN(o.package_lpa) AS min_package,
       MAX(o.package_lpa) AS max_package,
       AVG(o.package_lpa) AS avg_package
FROM drives d
LEFT JOIN offer_letters o ON o.drive_id = d.id
GROUP BY d.id, d.title;
