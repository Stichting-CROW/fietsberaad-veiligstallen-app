-- Background task scheduler and queue (src/server/background).
-- The application also creates these tables on first use (CREATE TABLE IF NOT EXISTS).

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

INSERT IGNORE INTO `background_settings` (`key`, `value`, `updated_at`) VALUES ('claim_lock', NULL, NOW(3));
