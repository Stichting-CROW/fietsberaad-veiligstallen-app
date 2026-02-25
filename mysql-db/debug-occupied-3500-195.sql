-- Debug occupied for location 3500_195 (old: 235, new: 236 - we overcount by 1)
-- ColdFusion: when status is SET (e.g. 10), getCurrentStatus() returns getStatus() MOD 10 = 0 (FREE), never checks open tx.
-- Open tx only applies when status is empty (null).

-- 1. Sections for 3500_195
SELECT fs.sectieId, fs.externalId, fs.Bezetting
FROM fietsenstalling_sectie fs
JOIN fietsenstallingen f ON f.ID = fs.fietsenstallingsId
WHERE f.StallingsID = '3500_195';

-- 2. Lockers with status=10 (or 20,100) - MOD 10 = 0 = FREE, but with open transaction
-- These we were incorrectly counting; ColdFusion does NOT count them
SELECT fp.id, fp.sectie_id, fp.status, fp.status % 10 AS mod10, t.ID AS transactie_id
FROM fietsenstalling_plek fp
JOIN transacties t ON t.PlaceID = fp.id AND t.Date_checkout IS NULL
JOIN fietsenstalling_sectie fs ON fs.sectieId = fp.sectie_id
JOIN fietsenstallingen f ON f.ID = fs.fietsenstallingsId
WHERE f.StallingsID = '3500_195'
  AND fp.status IS NOT NULL
  AND (fp.status % 10) = 0;

-- 3. Status distribution for lockers in 3500_195
SELECT fp.status, fp.status % 10 AS mod10, COUNT(*) AS cnt
FROM fietsenstalling_plek fp
JOIN fietsenstalling_sectie fs ON fs.sectieId = fp.sectie_id
JOIN fietsenstallingen f ON f.ID = fs.fietsenstallingsId
WHERE f.StallingsID = '3500_195'
GROUP BY fp.status, fp.status % 10
ORDER BY fp.status;
