-- Debug occupied for section 3500_005_1 (old: 562, new: 559)
-- ColdFusion: status MOD 10 != 0 OR has open transaction (transacties Date_checkout null)

-- 1. Section ID for 3500_005_1
SELECT fs.sectieId, fs.externalId, fs.Bezetting
FROM fietsenstalling_sectie fs
JOIN fietsenstallingen f ON f.ID = fs.fietsenstallingsId
WHERE fs.externalId = '3500_005_1';

-- 2. Occupied by status != 0 (current logic)
SELECT COUNT(*) AS occupied_by_status
FROM fietsenstalling_plek fp
JOIN fietsenstalling_sectie fs ON fs.sectieId = fp.sectie_id
WHERE fs.externalId = '3500_005_1'
  AND fp.status IS NOT NULL
  AND fp.status != 0;

-- 3. Occupied by status MOD 10 != 0 (ColdFusion getCurrentStatus)
SELECT COUNT(*) AS occupied_by_status_mod10
FROM fietsenstalling_plek fp
JOIN fietsenstalling_sectie fs ON fs.sectieId = fp.sectie_id
WHERE fs.externalId = '3500_005_1'
  AND fp.status IS NOT NULL
  AND (fp.status % 10) != 0;

-- 4. Lockers with open transaction (PlaceID) but status 0 or null
SELECT COUNT(*) AS extra_from_open_tx
FROM fietsenstalling_plek fp
JOIN transacties t ON t.PlaceID = fp.id AND t.Date_checkout IS NULL
JOIN fietsenstalling_sectie fs ON fs.sectieId = fp.sectie_id
WHERE fs.externalId = '3500_005_1'
  AND (fp.status IS NULL OR fp.status = 0);

-- 5. Status value distribution for lockers in this section
SELECT fp.status, COUNT(*) AS cnt
FROM fietsenstalling_plek fp
JOIN fietsenstalling_sectie fs ON fs.sectieId = fp.sectie_id
WHERE fs.externalId = '3500_005_1'
GROUP BY fp.status
ORDER BY fp.status;

-- 6. Total occupied = (status mod 10 != 0) OR (has open tx by PlaceID) - ColdFusion logic
SELECT COUNT(DISTINCT fp.id) AS total_occupied
FROM fietsenstalling_plek fp
JOIN fietsenstalling_sectie fs ON fs.sectieId = fp.sectie_id
LEFT JOIN transacties t ON t.PlaceID = fp.id AND t.Date_checkout IS NULL
WHERE fs.externalId = '3500_005_1'
  AND (
    (fp.status IS NOT NULL AND (fp.status % 10) != 0)
    OR t.ID IS NOT NULL
  );
