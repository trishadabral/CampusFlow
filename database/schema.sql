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
  role          ENUM('student','recruiter','admin') NOT NULL,
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
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_students_branch_cgpa (branch, cgpa)
);

-- ------------------------------------------------------------ companies --
CREATE TABLE companies (
  id      INT AUTO_INCREMENT PRIMARY KEY,
  name    VARCHAR(120) NOT NULL,
  website VARCHAR(200),
  sector  VARCHAR(80)
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
  status               ENUM('draft','open','closed') NOT NULL DEFAULT 'open',
  created_by           INT NOT NULL,
  created_at           TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (company_id) REFERENCES companies(id),
  FOREIGN KEY (created_by) REFERENCES users(id),
  INDEX idx_drives_status_deadline (status, application_deadline)
);

-- --------------------------------------------------------- applications --
CREATE TABLE applications (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  drive_id   INT NOT NULL,
  student_id INT NOT NULL,                      -- FK -> students.user_id
  status     ENUM('applied','shortlisted','rejected','selected') NOT NULL DEFAULT 'applied',
  applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_application (drive_id, student_id),
  FOREIGN KEY (drive_id)   REFERENCES drives(id)   ON DELETE CASCADE,
  FOREIGN KEY (student_id) REFERENCES students(user_id) ON DELETE CASCADE,
  INDEX idx_applications_drive (drive_id, status)
);

-- ---------------------------------------------------------------- slots --
-- Test / interview slots = schedulable resources with finite capacity.
CREATE TABLE slots (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  drive_id     INT NOT NULL,
  type         ENUM('test','interview') NOT NULL,
  title        VARCHAR(150) NOT NULL,
  starts_at    DATETIME NOT NULL,
  ends_at      DATETIME NOT NULL,
  capacity     INT NOT NULL CHECK (capacity > 0),
  booked_count INT NOT NULL DEFAULT 0 CHECK (booked_count >= 0),
  CHECK (booked_count <= capacity),
  CHECK (ends_at > starts_at),
  FOREIGN KEY (drive_id) REFERENCES drives(id) ON DELETE CASCADE,
  INDEX idx_slots_drive (drive_id, starts_at)
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

CREATE TRIGGER trg_bookings_audit_ai AFTER INSERT ON bookings FOR EACH ROW BEGIN
  INSERT INTO audit_log (action, entity, entity_id, details)
  VALUES ('INSERT', 'booking', NEW.id,
          JSON_OBJECT('slot_id', NEW.slot_id, 'student_id', NEW.student_id, 'status', NEW.status));
END$$

CREATE TRIGGER trg_bookings_audit_au AFTER UPDATE ON bookings FOR EACH ROW BEGIN
  INSERT INTO audit_log (action, entity, entity_id, details)
  VALUES ('UPDATE', 'booking', NEW.id,
          JSON_OBJECT('old_status', OLD.status, 'new_status', NEW.status));
END$$

CREATE TRIGGER trg_bookings_audit_ad AFTER DELETE ON bookings FOR EACH ROW BEGIN
  INSERT INTO audit_log (action, entity, entity_id, details)
  VALUES ('DELETE', 'booking', OLD.id,
          JSON_OBJECT('slot_id', OLD.slot_id, 'student_id', OLD.student_id));
END$$

CREATE TRIGGER trg_applications_audit_au AFTER UPDATE ON applications FOR EACH ROW BEGIN
  INSERT INTO audit_log (action, entity, entity_id, details)
  VALUES ('UPDATE', 'application', NEW.id,
          JSON_OBJECT('old_status', OLD.status, 'new_status', NEW.status, 'drive_id', NEW.drive_id));
END$$

CREATE TRIGGER trg_allocations_audit_ai AFTER INSERT ON allocations FOR EACH ROW BEGIN
  INSERT INTO audit_log (action, entity, entity_id, details)
  VALUES ('INSERT', 'allocation', NEW.id,
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
