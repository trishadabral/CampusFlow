-- ============================================================================
-- CampusFlow OS — database/migrate_v4.sql
-- Phase 2 foundation DDL:
--   * users gain password-reset columns (reset_token, reset_token_expires)
--   * students gain profile fields (photo, skills, resume as base64 in-DB)
--   * drives gain package_lpa (advertised package for the drive)
--   * new tables: drive_rounds, interview_feedback, offer_letters,
--     lab_machines, manual_events (resource calendar)
-- Fresh installs don't need this file — database/schema.sql already includes
-- it. Existing installs:  mysql -u root -p campusflow < migrate_v4.sql
-- (or run: npm run db:migrate).
-- ============================================================================

USE campusflow;

-- ------------------------------------------------- users: password reset --
ALTER TABLE users
  ADD COLUMN reset_token VARCHAR(100) NULL AFTER password_hash,
  ADD COLUMN reset_token_expires DATETIME NULL AFTER reset_token;

-- ------------------------------------------- students: profile + resume --
-- Photo and resume are stored as base64 text in the database (no file
-- storage to manage); resume_filename keeps the original file name.
ALTER TABLE students
  ADD COLUMN photo_data MEDIUMTEXT NULL AFTER graduation_year,
  ADD COLUMN skills TEXT NULL AFTER photo_data,
  ADD COLUMN resume_filename VARCHAR(255) NULL AFTER skills,
  ADD COLUMN resume_data MEDIUMTEXT NULL AFTER resume_filename;

-- ------------------------------------------------ drives: package (LPA) --
ALTER TABLE drives
  ADD COLUMN package_lpa DECIMAL(6,2) NULL AFTER max_shortlist;

-- ---------------------------------------------------------- drive_rounds --
-- Multi-round drives: each round has its own cutoff score and status.
CREATE TABLE IF NOT EXISTS drive_rounds (
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

-- ----------------------------------------------------- interview_feedback --
-- One feedback row per interviewer per student per drive.
CREATE TABLE IF NOT EXISTS interview_feedback (
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
CREATE TABLE IF NOT EXISTS offer_letters (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  drive_id     INT NOT NULL,
  student_id   INT NOT NULL,                        -- FK -> students.user_id
  package_lpa  DECIMAL(6,2) NULL,
  joining_date DATE NULL,
  letter_text  TEXT NULL,
  generated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_offer (drive_id, student_id),
  FOREIGN KEY (drive_id)   REFERENCES drives(id) ON DELETE CASCADE,
  FOREIGN KEY (student_id) REFERENCES students(user_id) ON DELETE CASCADE
);

-- ---------------------------------------------------------- lab_machines --
-- Live status of individual machines inside a lab resource, as reported
-- by the lab agent (see the C++ lab agent in Phase 2).
CREATE TABLE IF NOT EXISTS lab_machines (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  resource_id  INT NULL,
  machine_name VARCHAR(100) NOT NULL,
  status       ENUM('up','free','busy','down') NOT NULL DEFAULT 'up',
  last_seen    TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  reported_by  VARCHAR(100) NULL,
  UNIQUE KEY uq_machine (resource_id, machine_name),
  FOREIGN KEY (resource_id) REFERENCES resources(id) ON DELETE SET NULL
);

-- ---------------------------------------------------------- manual_events --
-- Hand-added bookings on the resource calendar (e.g. a lab reserved for
-- a workshop). They sit alongside system-generated slots/allocations.
CREATE TABLE IF NOT EXISTS manual_events (
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
