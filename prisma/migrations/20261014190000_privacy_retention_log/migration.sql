-- Audit log for the production privacy retention job.
-- The application also creates these tables on first use (CREATE TABLE IF NOT EXISTS).

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
