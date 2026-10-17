-- ============================================================================
-- CampusFlow OS — database/migrate_v3.sql
-- Adds the auto_scheduled flag to slots (set by POST /schedule/auto when the
-- interview timetable is generated from a drive's shortlist).
-- Fresh installs don't need this file — database/schema.sql already includes
-- it. Existing installs:  mysql -u root -p campusflow < migrate_v3.sql
-- (or run: npm run db:migrate).
-- ============================================================================

USE campusflow;

ALTER TABLE slots
  ADD COLUMN auto_scheduled TINYINT(1) NOT NULL DEFAULT 0 AFTER booked_count,
  ADD INDEX idx_slots_auto (drive_id, auto_scheduled);
