-- ============================================================================
-- CampusFlow OS — database/migrate_v2.sql
-- Upgrades a v1 database to the system-managed pipeline:
--   * drives gain test/interview configuration + a pipeline stage
--   * applications gain the 'test_taken' state
--   * slots gain a direct venue link (resource_id)
--   * new tables: test_questions, test_results, notifications
-- Fresh installs don't need this file — database/schema.sql already includes
-- everything. Existing installs:  mysql -u root -p campusflow < migrate_v2.sql
-- (or re-run: npm run db:reset — the seed rebuilds from schema.sql).
-- ============================================================================

USE campusflow;

-- ------------------------------------------------- drives: pipeline config --
ALTER TABLE drives
  ADD COLUMN test_date            DATE          NULL     AFTER application_deadline,
  ADD COLUMN interview_date       DATE          NULL     AFTER test_date,
  ADD COLUMN test_duration_min    INT           NOT NULL DEFAULT 60 AFTER interview_date,
  ADD COLUMN interview_duration_min INT         NOT NULL DEFAULT 20 AFTER test_duration_min,
  ADD COLUMN num_interviewers      INT           NOT NULL DEFAULT 2  AFTER interview_duration_min,
  ADD COLUMN min_test_score        DECIMAL(5,2)  NOT NULL DEFAULT 50.00 AFTER num_interviewers,
  ADD COLUMN max_shortlist        INT           NOT NULL DEFAULT 20 AFTER min_test_score,
  MODIFY COLUMN status ENUM('draft','open','testing','interviews','closed')
    NOT NULL DEFAULT 'open';

-- ------------------------------------------- applications: test_taken state --
ALTER TABLE applications
  MODIFY COLUMN status ENUM('applied','test_taken','shortlisted','rejected','selected')
    NOT NULL DEFAULT 'applied';

-- ------------------------------------------------ slots: direct venue link --
-- The auto-scheduler pins each test/interview session to a lab or room.
ALTER TABLE slots
  ADD COLUMN resource_id INT NULL AFTER drive_id,
  ADD CONSTRAINT fk_slots_resource FOREIGN KEY (resource_id)
    REFERENCES resources(id) ON DELETE SET NULL,
  ADD INDEX idx_slots_resource (resource_id);

-- ------------------------------------------------------- test_questions --
-- Recruiter-uploaded MCQs for a drive's aptitude test.
CREATE TABLE test_questions (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  drive_id      INT NOT NULL,
  question_text TEXT NOT NULL,
  options       JSON NOT NULL,                 -- ["opt A","opt B","opt C","opt D"]
  correct_index TINYINT NOT NULL,              -- 0..3
  marks         INT NOT NULL DEFAULT 1,
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
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
  answers     JSON NULL,                       -- {question_id: chosen_index}
  submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_test_result (drive_id, student_id),
  FOREIGN KEY (drive_id)   REFERENCES drives(id)   ON DELETE CASCADE,
  FOREIGN KEY (student_id) REFERENCES students(user_id) ON DELETE CASCADE,
  INDEX idx_tr_drive (drive_id, percentage)
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
