-- The archive row is keyed by transacties.ID again (same as the ColdFusion copy).
-- Rows written while externaltransactionid was the key have their own autoincrement id.
-- Remove those so a later copy under transacties.ID does not leave a second row.
-- Re-run scripts/backfill-transacties-archief.ts for closed visits that then have no archive row.
DELETE FROM `transacties_archief` WHERE `source` = 'fms-v4-managed';

ALTER TABLE `transacties_archief`
  DROP INDEX `uk_archief_location_external_tx`,
  DROP INDEX `idx_archief_externaltransactionid`,
  DROP COLUMN `externaltransactionid`,
  ALGORITHM=INPLACE, LOCK=NONE;
