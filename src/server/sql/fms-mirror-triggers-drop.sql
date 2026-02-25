-- Drop FMS mirror triggers (run before dropping new_* tables)
DROP TRIGGER IF EXISTS `trg_wachtrij_transacties_mirror_to_new`;
DROP TRIGGER IF EXISTS `trg_wachtrij_pasids_mirror_to_new`;
DROP TRIGGER IF EXISTS `trg_wachtrij_betalingen_mirror_to_new`;
DROP TRIGGER IF EXISTS `trg_wachtrij_sync_mirror_to_new`;
