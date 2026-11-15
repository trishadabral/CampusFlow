-- ============================================================================
-- migrate_v6.sql — coding questions + test mode (Wave 6)
-- Fresh installs don't need this file — database/schema.sql already includes
-- it. Existing installs:  mysql -u root -p campusflow < migrate_v6.sql
-- (or run: npm run db:migrate).
-- ============================================================================

USE campusflow;

-- test_questions: coding questions sit in the same table as aptitude MCQs.
-- Aptitude rows keep their options/correct_index; coding rows store NULL
-- there and carry language, starter code and the expected program output.
-- Existing rows are all aptitude, so the new columns default safely.
ALTER TABLE test_questions
  ADD COLUMN type ENUM('aptitude', 'coding') NOT NULL DEFAULT 'aptitude',
  ADD COLUMN language VARCHAR(20) NULL,
  ADD COLUMN starter_code TEXT NULL,
  ADD COLUMN expected_output TEXT NULL,
  MODIFY COLUMN options JSON NULL,
  MODIFY COLUMN correct_index TINYINT NULL;

-- drives: what the test includes — aptitude only, coding only, or both.
-- Existing drives stay 'aptitude' — nothing already published changes.
ALTER TABLE drives
  ADD COLUMN test_mode ENUM('aptitude', 'coding', 'both') NOT NULL DEFAULT 'aptitude';

-- test_results: how many times the student left the test tab (tab switch /
-- window blur while the test was in progress). Counted by TestTaker, sent
-- with the submission, shown to the recruiter next to the score.
-- Existing rows are 0.
ALTER TABLE test_results
  ADD COLUMN tab_switches INT NOT NULL DEFAULT 0;
