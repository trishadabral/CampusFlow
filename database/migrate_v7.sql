-- Migration v7: merge Ishika's CampusFlow functionality (2026-11-16).
--
-- For existing databases (created before this merge): adds the exam
-- monitoring tables, the OS-lab run/demo tables, the extra report views,
-- the account-active flag, student profile fields, company profile fields,
-- and the 'withdrawn' status on applications and offer letters.
-- Fresh installs get all of this from schema.sql directly, and seed.js
-- records this file as applied on a fresh db:reset.
--
-- Re-running is safe: ADD COLUMN failures for existing columns are
-- skipped by the migration runner (errno 1060), and the views use
-- CREATE OR REPLACE.

USE campusflow;

-- 1. Account activation (admin can deactivate accounts; login + token
--    checks reject deactivated users).
ALTER TABLE users ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT 1;

-- 2. Student profile fields (phone, projects, certifications).
ALTER TABLE students ADD COLUMN phone VARCHAR(20) NULL;
ALTER TABLE students ADD COLUMN projects JSON NULL;
ALTER TABLE students ADD COLUMN certifications JSON NULL;

-- 3. Company profile fields (recruiter-editable).
ALTER TABLE companies ADD COLUMN description TEXT NULL;
ALTER TABLE companies ADD COLUMN location VARCHAR(120) NULL;
ALTER TABLE companies ADD COLUMN industry VARCHAR(80) NULL;
ALTER TABLE companies ADD COLUMN hr_contact_email VARCHAR(255) NULL;

-- 4. Application withdrawal.
ALTER TABLE applications MODIFY COLUMN status ENUM('applied','test_taken','shortlisted','rejected','selected','withdrawn') NOT NULL DEFAULT 'applied';

-- 5. Offer withdrawal.
ALTER TABLE offer_letters MODIFY COLUMN status ENUM('pending', 'accepted', 'declined', 'withdrawn') NOT NULL DEFAULT 'pending';

-- 6. Exam monitoring tables (physical PCs, agent fleet, sessions, events).
CREATE TABLE IF NOT EXISTS computers (
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

CREATE TABLE IF NOT EXISTS agent_devices (
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

CREATE TABLE IF NOT EXISTS exam_sessions (
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

CREATE TABLE IF NOT EXISTS prohibited_processes (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  process_name VARCHAR(100) NOT NULL UNIQUE,
  added_by     INT NULL,
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (added_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS monitoring_events (
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

-- 7. OS-lab run log + race-demo scratch table.
CREATE TABLE IF NOT EXISTS os_runs (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  module VARCHAR(64) NOT NULL,
  algorithm VARCHAR(32) NOT NULL,
  input_json JSON NOT NULL,
  result_json JSON NOT NULL,
  created_by INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS demo_seats (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  capacity INT NOT NULL,
  confirmed INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- 8. Extra report views (read offer_letters; placed = accepted letter).
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

CREATE OR REPLACE VIEW v_package_stats AS
SELECT d.id AS drive_id,
       d.title,
       MIN(o.package_lpa) AS min_package,
       MAX(o.package_lpa) AS max_package,
       AVG(o.package_lpa) AS avg_package
FROM drives d
LEFT JOIN offer_letters o ON o.drive_id = d.id
GROUP BY d.id, d.title;
