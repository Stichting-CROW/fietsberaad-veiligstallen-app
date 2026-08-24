-- =============================================================================
-- Phase 3 — Acceptance (ACC) single Workbench script
-- =============================================================================
-- Run against the ACC database (confirm DATABASE() below before APPLY).
-- Safe to re-run: DROP IF EXISTS, ADD COLUMN / INDEX only when missing,
-- CREATE TABLE IF NOT EXISTS.
--
-- Does NOT drop live Next.js input queues:
--   new_wachtrij_pasids, new_wachtrij_betalingen, new_wachtrij_sync,
--   new_wachtrij_managed_transacties
-- Does NOT drop CF live tables: wachtrij_* (except unused wachtrij_managed_transacties),
--   bezettingsdata_tmp, transacties.
--
-- Order:
--   0) PREFLIGHT (read-only)
--   1) 20260622120000 managed transactions (only if missing on ACC)
--   2) 20260820120000 drop shadow output + mirror triggers
--   3) 20260821115200 drop new_wachtrij_transacties
--   4) 20260820130400 drop wachtrij_managed_transacties
--   5) 20260820134000 sim managed fields
--   6) 20260820142500 recreate new_bezettingsdata_tmp (input queue)
--   7) record _prisma_migrations
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 0) PREFLIGHT — review this result set before APPLY
-- -----------------------------------------------------------------------------
SELECT DATABASE() AS connected_database, NOW() AS ran_at;

SELECT TABLE_NAME,
       TABLE_ROWS AS approx_rows
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME IN (
    'transacties',
    'new_transacties',
    'new_transacties_archief',
    'new_financialtransactions',
    'new_accounts',
    'new_accounts_pasids',
    'new_bezettingsdata',
    'new_bezettingsdata_tmp',
    'new_wachtrij_transacties',
    'new_wachtrij_pasids',
    'new_wachtrij_betalingen',
    'new_wachtrij_sync',
    'new_wachtrij_managed_transacties',
    'wachtrij_managed_transacties',
    'wachtrij_transacties',
    'bezettingsdata_tmp',
    'parkingsimulation_section_assignments',
    '_prisma_migrations'
  )
ORDER BY TABLE_NAME;

SELECT TABLE_NAME, COLUMN_NAME
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND (
    (TABLE_NAME = 'transacties' AND COLUMN_NAME = 'ExternalTransactionID')
    OR (TABLE_NAME = 'parkingsimulation_section_assignments'
        AND COLUMN_NAME IN ('externalTransactionID', 'checkInDate'))
  )
ORDER BY TABLE_NAME, COLUMN_NAME;

SELECT TABLE_NAME, INDEX_NAME
FROM information_schema.STATISTICS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'transacties'
  AND INDEX_NAME IN ('uk_fietsenstalling_external_tx', 'ExternalTransactionID')
GROUP BY TABLE_NAME, INDEX_NAME;

SELECT TRIGGER_NAME
FROM information_schema.TRIGGERS
WHERE TRIGGER_SCHEMA = DATABASE()
  AND TRIGGER_NAME IN (
    'trg_wachtrij_transacties_mirror_to_new',
    'trg_wachtrij_pasids_mirror_to_new',
    'trg_wachtrij_betalingen_mirror_to_new',
    'trg_wachtrij_sync_mirror_to_new',
    'trg_bezettingsdata_tmp_mirror_insert',
    'trg_bezettingsdata_tmp_mirror_update'
  );

SELECT migration_name, finished_at
FROM `_prisma_migrations`
WHERE migration_name IN (
  '20260622120000_managed_transactions',
  '20260820120000_drop_new_fms_output_tables',
  '20260820130400_drop_wachtrij_managed_transacties',
  '20260820134000_sim_managed_transaction_fields',
  '20260820142500_add_new_bezettingsdata_tmp',
  '20260821115200_drop_new_wachtrij_transacties'
)
ORDER BY migration_name;

-- -----------------------------------------------------------------------------
-- APPLY
-- -----------------------------------------------------------------------------

DELIMITER $$

DROP PROCEDURE IF EXISTS `phase3_add_column_if_missing` $$
CREATE PROCEDURE `phase3_add_column_if_missing`(
  IN p_table VARCHAR(64),
  IN p_column VARCHAR(64),
  IN p_ddl TEXT
)
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = p_table
      AND COLUMN_NAME = p_column
  ) THEN
    SET @sql = p_ddl;
    PREPARE stmt FROM @sql;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;
  END IF;
END $$

DROP PROCEDURE IF EXISTS `phase3_add_index_if_missing` $$
CREATE PROCEDURE `phase3_add_index_if_missing`(
  IN p_table VARCHAR(64),
  IN p_index VARCHAR(64),
  IN p_ddl TEXT
)
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = p_table
      AND INDEX_NAME = p_index
  ) THEN
    SET @sql = p_ddl;
    PREPARE stmt FROM @sql;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;
  END IF;
END $$

DROP PROCEDURE IF EXISTS `phase3_record_prisma_migration` $$
CREATE PROCEDURE `phase3_record_prisma_migration`(
  IN p_name VARCHAR(255),
  IN p_checksum VARCHAR(64)
)
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = '_prisma_migrations'
  ) AND NOT EXISTS (
    SELECT 1 FROM `_prisma_migrations` WHERE `migration_name` = p_name
  ) THEN
    INSERT INTO `_prisma_migrations` (
      `id`, `checksum`, `finished_at`, `migration_name`,
      `logs`, `rolled_back_at`, `started_at`, `applied_steps_count`
    ) VALUES (
      REPLACE(UUID(), '-', ''),
      p_checksum,
      NOW(3),
      p_name,
      NULL,
      NULL,
      NOW(3),
      1
    );
  END IF;
END $$

DELIMITER ;

-- 1) 20260622120000_managed_transactions (skip new_transacties — dropped in step 2)
--    Do not CREATE wachtrij_managed_transacties — dropped in step 4.
CALL phase3_add_column_if_missing(
  'transacties',
  'ExternalTransactionID',
  'ALTER TABLE `transacties` ADD COLUMN `ExternalTransactionID` VARCHAR(100) NULL DEFAULT NULL AFTER `ExternalPlaceID`'
);
CALL phase3_add_index_if_missing(
  'transacties',
  'uk_fietsenstalling_external_tx',
  'ALTER TABLE `transacties` ADD UNIQUE INDEX `uk_fietsenstalling_external_tx` (`FietsenstallingID`, `ExternalTransactionID`)'
);
CALL phase3_add_index_if_missing(
  'transacties',
  'ExternalTransactionID',
  'ALTER TABLE `transacties` ADD INDEX `ExternalTransactionID` (`ExternalTransactionID`)'
);

CREATE TABLE IF NOT EXISTS `new_wachtrij_managed_transacties` (
  `ID` INT NOT NULL AUTO_INCREMENT,
  `bikeparkID` VARCHAR(8) NOT NULL,
  `externalTransactionID` VARCHAR(100) NOT NULL,
  `payload` TEXT NOT NULL,
  `processed` TINYINT(1) NOT NULL DEFAULT 0,
  `processDate` TIMESTAMP(0) NULL,
  `error` TEXT NULL,
  `dateCreated` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
  PRIMARY KEY (`ID`),
  INDEX `new_wmt_bikeparkID` (`bikeparkID`),
  INDEX `new_wmt_externalTransactionID` (`externalTransactionID`),
  INDEX `new_wmt_processed` (`processed`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 2) 20260820120000_drop_new_fms_output_tables
DROP TRIGGER IF EXISTS `trg_wachtrij_transacties_mirror_to_new`;
DROP TRIGGER IF EXISTS `trg_wachtrij_pasids_mirror_to_new`;
DROP TRIGGER IF EXISTS `trg_wachtrij_betalingen_mirror_to_new`;
DROP TRIGGER IF EXISTS `trg_wachtrij_sync_mirror_to_new`;
DROP TRIGGER IF EXISTS `trg_bezettingsdata_tmp_mirror_insert`;
DROP TRIGGER IF EXISTS `trg_bezettingsdata_tmp_mirror_update`;

DROP TABLE IF EXISTS `new_financialtransactions`;
DROP TABLE IF EXISTS `new_accounts_pasids`;
DROP TABLE IF EXISTS `new_accounts`;
DROP TABLE IF EXISTS `new_transacties_archief`;
DROP TABLE IF EXISTS `new_transacties`;
DROP TABLE IF EXISTS `new_bezettingsdata`;
DROP TABLE IF EXISTS `new_bezettingsdata_tmp`;

-- 3) 20260821115200_drop_new_wachtrij_transacties
DROP TABLE IF EXISTS `new_wachtrij_transacties`;

-- 4) 20260820130400_drop_wachtrij_managed_transacties
DROP TABLE IF EXISTS `wachtrij_managed_transacties`;

-- 5) 20260820134000_sim_managed_transaction_fields
CALL phase3_add_column_if_missing(
  'parkingsimulation_section_assignments',
  'externalTransactionID',
  'ALTER TABLE `parkingsimulation_section_assignments` ADD COLUMN `externalTransactionID` VARCHAR(100) NULL AFTER `passID`'
);
CALL phase3_add_column_if_missing(
  'parkingsimulation_section_assignments',
  'checkInDate',
  'ALTER TABLE `parkingsimulation_section_assignments` ADD COLUMN `checkInDate` DATETIME(0) NULL AFTER `externalTransactionID`'
);

-- 6) 20260820142500_add_new_bezettingsdata_tmp  (recreate as Next.js occupation INPUT)
CREATE TABLE IF NOT EXISTS `new_bezettingsdata_tmp` (
  `ID` INT NOT NULL AUTO_INCREMENT,
  `timestampStartInterval` DATETIME(0) NULL,
  `timestamp` DATETIME(0) NULL,
  `interval` INT NOT NULL DEFAULT 1,
  `source` VARCHAR(25) NULL,
  `bikeparkID` VARCHAR(8) NULL,
  `sectionID` VARCHAR(13) NULL,
  `brutoCapacity` INT NULL,
  `capacity` INT NULL,
  `bulkreserveration` INT NOT NULL DEFAULT 0,
  `occupation` INT NULL,
  `checkins` INT NULL,
  `checkouts` INT NULL,
  `open` BIT(1) NULL,
  `rawData` TEXT NULL,
  `dateModified` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
  PRIMARY KEY (`ID`),
  UNIQUE INDEX `new_bdt_timestamp_2` (`timestamp`, `interval`, `source`, `bikeparkID`, `sectionID`),
  INDEX `new_bdt_bikeparkID` (`bikeparkID`),
  INDEX `new_bdt_dateModified` (`dateModified`),
  INDEX `new_bdt_interval` (`interval`),
  INDEX `new_bdt_sectionID` (`sectionID`),
  INDEX `new_bdt_source` (`source`),
  INDEX `new_bdt_timestamp` (`timestamp`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 7) _prisma_migrations (checksums = sha256 of each prisma/migrations/*/migration.sql)
CALL phase3_record_prisma_migration(
  '20260622120000_managed_transactions',
  '44429d34adc8a67806bba3c4c9b80f69c149bf163e2964c70e6286072398af5a'
);
CALL phase3_record_prisma_migration(
  '20260820120000_drop_new_fms_output_tables',
  '2033323a599bfd44c86bcf3b501232a52ef6bf4de1aac6bc25eb976746a29383'
);
CALL phase3_record_prisma_migration(
  '20260820130400_drop_wachtrij_managed_transacties',
  '146ac3ec1e82f46a9749d6b633413003a7dea36d1b3febd812ce1915c70f539f'
);
CALL phase3_record_prisma_migration(
  '20260820134000_sim_managed_transaction_fields',
  '2f141098a2a5b3db4950b3079f6ffa7e852bb575260849383efa54f5df2ec39f'
);
CALL phase3_record_prisma_migration(
  '20260820142500_add_new_bezettingsdata_tmp',
  'b0542e9f6d2b519c78f4022b7721b3778271a624d84fecf5489825794142a3eb'
);
CALL phase3_record_prisma_migration(
  '20260821115200_drop_new_wachtrij_transacties',
  '1160960b89fb652310a3c4357873d05eec5d00d386a180df37458e0a27cef32d'
);

DROP PROCEDURE IF EXISTS `phase3_add_column_if_missing`;
DROP PROCEDURE IF EXISTS `phase3_add_index_if_missing`;
DROP PROCEDURE IF EXISTS `phase3_record_prisma_migration`;

-- Post-check
SELECT DATABASE() AS connected_database;
SELECT TABLE_NAME
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME IN (
    'new_wachtrij_managed_transacties',
    'new_bezettingsdata_tmp',
    'new_wachtrij_pasids',
    'new_wachtrij_betalingen',
    'new_wachtrij_sync',
    'new_wachtrij_transacties',
    'wachtrij_managed_transacties',
    'new_transacties',
    'new_bezettingsdata'
  )
ORDER BY TABLE_NAME;

SELECT COLUMN_NAME
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'transacties'
  AND COLUMN_NAME = 'ExternalTransactionID';

SELECT migration_name, finished_at
FROM `_prisma_migrations`
WHERE migration_name LIKE '20260622%' OR migration_name LIKE '20260820%' OR migration_name LIKE '20260821%'
ORDER BY migration_name;
