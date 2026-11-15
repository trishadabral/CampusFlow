-- ============================================================================
-- migrate_v5.sql — offer accept / decline (Wave 5)
-- Fresh installs don't need this file — database/schema.sql already includes
-- it. Existing installs:  mysql -u root -p campusflow < migrate_v5.sql
-- (or run: npm run db:migrate).
-- ============================================================================

USE campusflow;

-- --------------------------------------------------------- offer_letters --
-- The student's answer to their offer. 'pending' until they accept or
-- decline from their dashboard; responded_at records when they answered.
-- Existing letters stay 'pending' — nobody's answer is invented.
ALTER TABLE offer_letters
  ADD COLUMN status ENUM('pending', 'accepted', 'declined') NOT NULL DEFAULT 'pending',
  ADD COLUMN responded_at TIMESTAMP NULL;
