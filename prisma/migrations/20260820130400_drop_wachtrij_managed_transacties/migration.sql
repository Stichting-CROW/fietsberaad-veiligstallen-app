-- CF will not implement V4 / managed transactions. Next.js only uses
-- new_wachtrij_managed_transacties, so the unused production twin can go.

DROP TABLE IF EXISTS `wachtrij_managed_transacties`;
