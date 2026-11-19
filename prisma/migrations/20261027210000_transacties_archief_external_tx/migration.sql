-- Idempotency key for archief rows written from managed transactions.
-- Legacy completed-transaction rows keep externaltransactionid NULL.
-- MySQL unique indexes allow multiple NULLs, so existing rows are unchanged.
--
-- The column add is INSTANT (MySQL 8.0.29+): no table copy.
-- The indexes scan the full table. On a large transacties_archief that is
-- online (LOCK=NONE) but can take a long time and extra disk.

ALTER TABLE `transacties_archief`
  ADD COLUMN `externaltransactionid` VARCHAR(100) NULL DEFAULT NULL,
  ALGORITHM=INSTANT;

ALTER TABLE `transacties_archief`
  ADD UNIQUE INDEX `uk_archief_location_external_tx` (`locationid`, `externaltransactionid`),
  ADD INDEX `idx_archief_externaltransactionid` (`externaltransactionid`),
  ALGORITHM=INPLACE, LOCK=NONE;
