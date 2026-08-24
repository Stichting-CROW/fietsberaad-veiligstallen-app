-- Drop leftover FMS mirror triggers and output shadow tables.
-- Input queues (new_wachtrij_*) stay.

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
