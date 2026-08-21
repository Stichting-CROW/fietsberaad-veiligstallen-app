-- Next.js FMS occupation input queue. ColdFusion keeps bezettingsdata_tmp.
-- Next.js rollup copies new_bezettingsdata_tmp → bezettingsdata.

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
