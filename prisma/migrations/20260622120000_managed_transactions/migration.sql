-- Managed transactions: external upsert key on transacties + dedicated wachtrij tables.
-- Pattern follows 2020.07.08.externalPlaceID.sql (column on transacties, not a mapping table).

ALTER TABLE `transacties`
  ADD COLUMN `ExternalTransactionID` VARCHAR(100) NULL DEFAULT NULL AFTER `ExternalPlaceID`,
  ADD UNIQUE INDEX `uk_fietsenstalling_external_tx` (`FietsenstallingID`, `ExternalTransactionID`),
  ADD INDEX `ExternalTransactionID` (`ExternalTransactionID`);

ALTER TABLE `new_transacties`
  ADD COLUMN `ExternalTransactionID` VARCHAR(100) NULL DEFAULT NULL AFTER `ExternalPlaceID`,
  ADD UNIQUE INDEX `new_t_uk_fietsenstalling_external_tx` (`FietsenstallingID`, `ExternalTransactionID`),
  ADD INDEX `new_t_ExternalTransactionID` (`ExternalTransactionID`);

CREATE TABLE IF NOT EXISTS `wachtrij_managed_transacties` (
  `ID` INT NOT NULL AUTO_INCREMENT,
  `bikeparkID` VARCHAR(8) NOT NULL,
  `externalTransactionID` VARCHAR(100) NOT NULL,
  `payload` TEXT NOT NULL,
  `processed` TINYINT(1) NOT NULL DEFAULT 0,
  `processDate` TIMESTAMP(0) NULL,
  `error` TEXT NULL,
  `dateCreated` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
  PRIMARY KEY (`ID`),
  INDEX `wmt_bikeparkID` (`bikeparkID`),
  INDEX `wmt_externalTransactionID` (`externalTransactionID`),
  INDEX `wmt_processed` (`processed`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

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
