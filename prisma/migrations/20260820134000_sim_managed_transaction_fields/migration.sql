-- Persist FMS v4 upsert key + check-in time on simulation occupation
-- so checkout can POST the same managed transaction.

ALTER TABLE `parkingsimulation_section_assignments`
  ADD COLUMN `externalTransactionID` VARCHAR(100) NULL AFTER `passID`,
  ADD COLUMN `checkInDate` DATETIME(0) NULL AFTER `externalTransactionID`;
