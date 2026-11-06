-- Database changes for the experiments/transactions-finish release.
-- Run by hand in MySQL Workbench on the target database (acceptance first, then production).
-- Not a Prisma migration. Safe to run more than once: every change checks information_schema first.
--
-- Workbench:
--   * Select the target schema first (double-click it), the script uses DATABASE().
--   * Keep "Stop Script Execution on Errors" on.
--   * Edit > Preferences > SQL Editor > "DBMS connection read timeout": set to 3600.
--     Section 4 builds an index on bezettingsdata_day_hour_cache (millions of rows); online, but slow.
--
-- Sections:
--   1. Pre-checks (stops on the wrong database)
--   2. Tables the app needs: privacy_retention_*, background_*
--   3. financialtransactions.mollieTransactionID VARCHAR(32)
--   4. Indexes
--   5. transacties_archief.externaltransactionid cleanup (only on databases that had the column)
--   6. Drop parkingsimulation_* tables
--   7. Views (end-user accounts need vw_stallingstegoeden and vw_stallingstegoedenexploitant)

-- ---------------------------------------------------------------------------
-- 1. Pre-checks
-- ---------------------------------------------------------------------------

SELECT DATABASE() AS target_database, VERSION() AS mysql_version, CURRENT_USER() AS run_as;

-- Stops here (error "Table ... __wrong_database__stop_here doesn't exist") when no veiligstallen schema is selected.
SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN ('fietsenstallingen', 'transacties_archief', 'accounts')) = 3,
  'SELECT ''ok: veiligstallen schema'' AS precheck',
  'SELECT * FROM `__wrong_database__stop_here`'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SELECT t.name AS table_name, IF(i.TABLE_NAME IS NULL, 'missing', 'exists') AS state, i.TABLE_ROWS AS approx_rows
FROM (
  SELECT 'privacy_retention_runs' AS name UNION ALL SELECT 'privacy_retention_actions'
  UNION ALL SELECT 'background_schedules' UNION ALL SELECT 'background_tasks' UNION ALL SELECT 'background_settings'
  UNION ALL SELECT 'parkingsimulation_section_assignments' UNION ALL SELECT 'parkingsimulation_bicycles'
  UNION ALL SELECT 'parkingsimulation_simulation_config'
) t
LEFT JOIN information_schema.TABLES i ON i.TABLE_SCHEMA = DATABASE() AND i.TABLE_NAME = t.name;

-- ---------------------------------------------------------------------------
-- 2. Tables (same DDL as the app's CREATE TABLE IF NOT EXISTS)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS `privacy_retention_runs` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `mode` VARCHAR(16) NOT NULL,
  `status` VARCHAR(16) NOT NULL,
  `startedBy` VARCHAR(255) NULL,
  `startedAt` DATETIME(0) NOT NULL,
  `updatedAt` DATETIME(0) NOT NULL,
  `finishedAt` DATETIME(0) NULL,
  `currentAction` VARCHAR(64) NULL,
  `cursorId` VARCHAR(64) NULL,
  `logText` MEDIUMTEXT NULL,
  `errorText` TEXT NULL,
  PRIMARY KEY (`id`),
  INDEX `privacy_retention_runs_status` (`status`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `privacy_retention_actions` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `runId` INT NOT NULL,
  `actionKey` VARCHAR(64) NOT NULL,
  `heading` VARCHAR(255) NOT NULL,
  `rowsMatched` INT NOT NULL DEFAULT 0,
  `rowsChanged` INT NOT NULL DEFAULT 0,
  `status` VARCHAR(16) NOT NULL,
  `detail` TEXT NULL,
  PRIMARY KEY (`id`),
  INDEX `privacy_retention_actions_run` (`runId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `background_schedules` (
  `key` VARCHAR(64) NOT NULL,
  `task_type` VARCHAR(64) NOT NULL,
  `cron` VARCHAR(100) NOT NULL,
  `timezone` VARCHAR(64) NOT NULL DEFAULT 'Europe/Amsterdam',
  `enabled` TINYINT(1) NOT NULL DEFAULT 1,
  `payload` TEXT NULL,
  `next_run_at` DATETIME(3) NULL,
  `last_enqueued_at` DATETIME(3) NULL,
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `background_tasks` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `type` VARCHAR(64) NOT NULL,
  `payload` TEXT NULL,
  `status` VARCHAR(16) NOT NULL,
  `schedule_key` VARCHAR(64) NULL,
  `trigger_source` VARCHAR(16) NOT NULL,
  `triggered_by` VARCHAR(255) NULL,
  `run_after` DATETIME(3) NOT NULL,
  `attempts` INT NOT NULL DEFAULT 0,
  `max_attempts` INT NOT NULL DEFAULT 1,
  `locked_by` VARCHAR(128) NULL,
  `locked_until` DATETIME(3) NULL,
  `dedupe_key` VARCHAR(191) NULL,
  `result` MEDIUMTEXT NULL,
  `last_error` TEXT NULL,
  `created_at` DATETIME(3) NOT NULL,
  `started_at` DATETIME(3) NULL,
  `finished_at` DATETIME(3) NULL,
  `duration_ms` INT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `background_tasks_dedupe` (`dedupe_key`),
  INDEX `background_tasks_status_run_after` (`status`, `run_after`),
  INDEX `background_tasks_schedule_created` (`schedule_key`, `created_at`),
  INDEX `background_tasks_type_created` (`type`, `created_at`),
  INDEX `background_tasks_created` (`created_at`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `background_settings` (
  `key` VARCHAR(64) NOT NULL,
  `value` TEXT NULL,
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Row the task claimer locks with SELECT ... FOR UPDATE.
INSERT IGNORE INTO `background_settings` (`key`, `value`, `updated_at`) VALUES ('claim_lock', NULL, NOW(3));

-- ---------------------------------------------------------------------------
-- 3. financialtransactions.mollieTransactionID (Mollie ids such as tr_xxxxxxxxxx need 32)
-- ---------------------------------------------------------------------------

SET @sql = IF(
  (SELECT COALESCE(MAX(CHARACTER_MAXIMUM_LENGTH), 32) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'financialtransactions' AND COLUMN_NAME = 'mollieTransactionID') < 32,
  'ALTER TABLE `financialtransactions` MODIFY `mollieTransactionID` VARCHAR(32) NULL DEFAULT NULL',
  'SELECT ''skip: mollieTransactionID already VARCHAR(32) or wider'' AS info'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ---------------------------------------------------------------------------
-- 4. Indexes (online: ALGORITHM=INPLACE, LOCK=NONE)
-- ---------------------------------------------------------------------------

SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'bezettingsdata_day_hour_cache'
      AND INDEX_NAME = 'idx_bikeparkID_source_interval_timestamp') = 0
  AND (SELECT COUNT(*) FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'bezettingsdata_day_hour_cache') = 1,
  'ALTER TABLE `bezettingsdata_day_hour_cache` ADD INDEX `idx_bikeparkID_source_interval_timestamp` (`bikeparkID`, `source`, `interval`, `timestamp`), ALGORITHM=INPLACE, LOCK=NONE',
  'SELECT ''skip: idx_bikeparkID_source_interval_timestamp exists (or no cache table)'' AS info'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'bezettingsdata' AND INDEX_NAME = 'idx_bezettingcache_1') = 0,
  'ALTER TABLE `bezettingsdata` ADD INDEX `idx_bezettingcache_1` (`timestamp`, `bikeparkID`, `sectionID`, `source`, `fillup`, `open`), ALGORITHM=INPLACE, LOCK=NONE',
  'SELECT ''skip: idx_bezettingcache_1 exists'' AS info'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'bezettingsdata' AND INDEX_NAME = 'idx_bezettingcache_2') = 0,
  'ALTER TABLE `bezettingsdata` ADD INDEX `idx_bezettingcache_2` (`bikeparkID`, `timestamp`), ALGORITHM=INPLACE, LOCK=NONE',
  'SELECT ''skip: idx_bezettingcache_2 exists'' AS info'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'transacties_archief' AND INDEX_NAME = 'idx_transactionscache_1') = 0,
  'ALTER TABLE `transacties_archief` ADD INDEX `idx_transactionscache_1` (`locationid`, `checkoutdate`, `checkintype`, `checkouttype`, `checkindate`), ALGORITHM=INPLACE, LOCK=NONE',
  'SELECT ''skip: idx_transactionscache_1 exists'' AS info'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'transacties_archief' AND INDEX_NAME = 'idx_transactionscache_2') = 0,
  'ALTER TABLE `transacties_archief` ADD INDEX `idx_transactionscache_2` (`sectionid`, `clienttypeid`), ALGORITHM=INPLACE, LOCK=NONE',
  'SELECT ''skip: idx_transactionscache_2 exists'' AS info'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'transacties_archief' AND INDEX_NAME = 'idx_stallingduurcache_1') = 0,
  'ALTER TABLE `transacties_archief` ADD INDEX `idx_stallingduurcache_1` (`locationid`, `checkoutdate`, `sectionid`, `clienttypeid`), ALGORITHM=INPLACE, LOCK=NONE',
  'SELECT ''skip: idx_stallingduurcache_1 exists'' AS info'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'transacties_archief' AND INDEX_NAME = 'idx_stallingduurcache_2') = 0,
  'ALTER TABLE `transacties_archief` ADD INDEX `idx_stallingduurcache_2` (`checkindate`, `checkoutdate`), ALGORITHM=INPLACE, LOCK=NONE',
  'SELECT ''skip: idx_stallingduurcache_2 exists'' AS info'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ---------------------------------------------------------------------------
-- 5. transacties_archief.externaltransactionid cleanup
--    Only databases that ran the (since reverted) externaltransactionid migration have the column.
--    Archive rows written in that period have their own id instead of transacties.ID; delete them.
--    Without the column nothing runs: fms-v4-managed rows written by this release stay.
-- ---------------------------------------------------------------------------

SET @has_ext = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'transacties_archief' AND COLUMN_NAME = 'externaltransactionid');

SET @sql = IF(@has_ext = 1,
  'DELETE FROM `transacties_archief` WHERE `source` = ''fms-v4-managed''',
  'SELECT ''skip: no externaltransactionid column, no archive cleanup'' AS info'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'transacties_archief' AND INDEX_NAME = 'uk_archief_location_external_tx') > 0,
  'ALTER TABLE `transacties_archief` DROP INDEX `uk_archief_location_external_tx`, ALGORITHM=INPLACE, LOCK=NONE',
  'SELECT ''skip: no uk_archief_location_external_tx'' AS info'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'transacties_archief' AND INDEX_NAME = 'idx_archief_externaltransactionid') > 0,
  'ALTER TABLE `transacties_archief` DROP INDEX `idx_archief_externaltransactionid`, ALGORITHM=INPLACE, LOCK=NONE',
  'SELECT ''skip: no idx_archief_externaltransactionid'' AS info'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(@has_ext = 1,
  'ALTER TABLE `transacties_archief` DROP COLUMN `externaltransactionid`',
  'SELECT ''skip: no externaltransactionid column'' AS info'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ---------------------------------------------------------------------------
-- 6. parkingsimulation_* (feature removed)
-- ---------------------------------------------------------------------------

DROP TABLE IF EXISTS `parkingsimulation_section_assignments`;
DROP TABLE IF EXISTS `parkingsimulation_bicycles`;
DROP TABLE IF EXISTS `parkingsimulation_simulation_config`;

-- ---------------------------------------------------------------------------
-- 7. Views
--    The definitions are unchanged in this release; this section only checks them.
--    A view reported 'MISSING' must be created from prisma/sql/mysql-views.sql
--    (run only the DROP/CREATE pair for that view).
-- ---------------------------------------------------------------------------

SELECT v.name AS view_name,
  IF(i.TABLE_NAME IS NULL, 'MISSING: create from prisma/sql/mysql-views.sql', 'ok') AS state,
  i.DEFINER AS definer, i.SECURITY_TYPE AS security_type
FROM (
  SELECT 'transacties_view' AS name UNION ALL SELECT 'vw_fmsservice_errors' UNION ALL SELECT 'vw_locations'
  UNION ALL SELECT 'vw_lopende_transacties' UNION ALL SELECT 'vw_pasids'
  UNION ALL SELECT 'vw_stallingstegoeden' UNION ALL SELECT 'vw_stallingstegoedenexploitant'
) v
LEFT JOIN information_schema.VIEWS i ON i.TABLE_SCHEMA = DATABASE() AND i.TABLE_NAME = v.name;

-- Each line fails when the view is missing, invalid or its DEFINER lacks rights. WHERE 1=0 keeps it fast.
SELECT COUNT(*) AS transacties_view FROM `transacties_view` WHERE 1 = 0;
SELECT COUNT(*) AS vw_fmsservice_errors FROM `vw_fmsservice_errors` WHERE 1 = 0;
SELECT COUNT(*) AS vw_locations FROM `vw_locations` WHERE 1 = 0;
SELECT COUNT(*) AS vw_lopende_transacties FROM `vw_lopende_transacties` WHERE 1 = 0;
SELECT COUNT(*) AS vw_pasids FROM `vw_pasids` WHERE 1 = 0;
SELECT COUNT(*) AS vw_stallingstegoeden FROM `vw_stallingstegoeden` WHERE 1 = 0;
SELECT COUNT(*) AS vw_stallingstegoedenexploitant FROM `vw_stallingstegoedenexploitant` WHERE 1 = 0;

-- End-user balance lookups as the app does them (filter on accountID).
SET @test_account = (SELECT `accountID` FROM `financialtransactions` WHERE `accountID` IS NOT NULL LIMIT 1);
SELECT @test_account AS test_account;
SELECT `accountID`, `stallingstegoed`, `dateLastTransaction` FROM `vw_stallingstegoeden` WHERE `accountID` = @test_account LIMIT 1;
SELECT `accountID`, `siteID`, `stallingstegoed` FROM `vw_stallingstegoedenexploitant` WHERE `accountID` = @test_account;

-- ---------------------------------------------------------------------------
-- Post-check: expected 'ok' everywhere
-- ---------------------------------------------------------------------------

SELECT 'privacy_retention_runs' AS item, IF(COUNT(*) = 1, 'ok', 'FAIL') AS state FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'privacy_retention_runs'
UNION ALL SELECT 'privacy_retention_actions', IF(COUNT(*) = 1, 'ok', 'FAIL') FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'privacy_retention_actions'
UNION ALL SELECT 'background_schedules', IF(COUNT(*) = 1, 'ok', 'FAIL') FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'background_schedules'
UNION ALL SELECT 'background_tasks', IF(COUNT(*) = 1, 'ok', 'FAIL') FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'background_tasks'
UNION ALL SELECT 'background_settings.claim_lock', IF(COUNT(*) = 1, 'ok', 'FAIL') FROM `background_settings` WHERE `key` = 'claim_lock'
UNION ALL SELECT 'mollieTransactionID >= 32', IF(MAX(CHARACTER_MAXIMUM_LENGTH) >= 32, 'ok', 'FAIL') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'financialtransactions' AND COLUMN_NAME = 'mollieTransactionID'
UNION ALL SELECT 'idx_bikeparkID_source_interval_timestamp', IF(COUNT(*) > 0, 'ok', 'FAIL') FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'bezettingsdata_day_hour_cache' AND INDEX_NAME = 'idx_bikeparkID_source_interval_timestamp'
UNION ALL SELECT 'cache indexes (6)', IF(COUNT(DISTINCT INDEX_NAME) = 6, 'ok', 'FAIL') FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND INDEX_NAME IN ('idx_bezettingcache_1', 'idx_bezettingcache_2', 'idx_transactionscache_1', 'idx_transactionscache_2', 'idx_stallingduurcache_1', 'idx_stallingduurcache_2')
UNION ALL SELECT 'no externaltransactionid', IF(COUNT(*) = 0, 'ok', 'FAIL') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'transacties_archief' AND COLUMN_NAME = 'externaltransactionid'
UNION ALL SELECT 'no parkingsimulation_*', IF(COUNT(*) = 0, 'ok', 'FAIL') FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME LIKE 'parkingsimulation\_%'
UNION ALL SELECT 'views (7)', IF(COUNT(*) = 7, 'ok', 'FAIL') FROM information_schema.VIEWS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN ('transacties_view', 'vw_fmsservice_errors', 'vw_locations', 'vw_lopende_transacties', 'vw_pasids', 'vw_stallingstegoeden', 'vw_stallingstegoedenexploitant');
