-- Debug location 3500_213 (old: 368 occupied, new: 370 - we overcount by 2)
-- ColdFusion: occupied = sum section occupied; capacity = getNettoCapacity(); free = getCapacity() - occupied

-- 1. Location and sections
SELECT f.StallingsID, f.Capacity AS fietsenstalling_Capacity,
       fs.sectieId, fs.externalId, fs.Bezetting AS sectie_Bezetting
FROM fietsenstallingen f
JOIN fietsenstalling_sectie fs ON fs.fietsenstallingsId = f.ID
WHERE f.StallingsID = '3500_213';

-- 2. Per-section: locker occupied (status MOD 10 != 0) OR (status null AND open tx)
SELECT fs.externalId, COUNT(DISTINCT fp.id) AS occupied
FROM fietsenstalling_sectie fs
JOIN fietsenstallingen f ON f.ID = fs.fietsenstallingsId
JOIN fietsenstalling_plek fp ON fp.sectie_id = fs.sectieId
LEFT JOIN transacties t ON t.PlaceID = fp.id AND t.Date_checkout IS NULL
WHERE f.StallingsID = '3500_213'
  AND ((fp.status IS NOT NULL AND (fp.status % 10) != 0)
       OR (fp.status IS NULL AND t.ID IS NOT NULL))
GROUP BY fs.sectieId, fs.externalId;

-- 3. Lockers we might overcount: status=10/20/100 (MOD 10=0) with open tx - we DON'T count these (correct)
--    OR status null with open tx - we count, ColdFusion counts. Same.
--    Find lockers with status MOD 10 = 0 that have open tx (we shouldn't count, verify we don't)
SELECT fp.id, fp.sectie_id, fp.status, fp.status % 10 AS mod10, t.ID AS transactie_id
FROM fietsenstalling_plek fp
JOIN transacties t ON t.PlaceID = fp.id AND t.Date_checkout IS NULL
JOIN fietsenstalling_sectie fs ON fs.sectieId = fp.sectie_id
JOIN fietsenstallingen f ON f.ID = fs.fietsenstallingsId
WHERE f.StallingsID = '3500_213'
  AND fp.status IS NOT NULL
  AND (fp.status % 10) = 0;

-- 4. Places with isActief=0 - if ColdFusion excludes these, we should too
SELECT fp.id, fp.sectie_id, fp.status, fp.isActief
FROM fietsenstalling_plek fp
JOIN fietsenstalling_sectie fs ON fs.sectieId = fp.sectie_id
JOIN fietsenstallingen f ON f.ID = fs.fietsenstallingsId
WHERE f.StallingsID = '3500_213'
  AND fp.isActief = 0;

-- 5. Per-section: capacity from secties_fietstype, bulkreservation
SELECT fs.externalId,
       COALESCE(SUM(sf.Capaciteit), 0) AS capacity_raw,
       COALESCE(MAX(b.Aantal), 0) AS bulkreservation,
       COALESCE(SUM(sf.Capaciteit), 0) - COALESCE(MAX(b.Aantal), 0) AS capacity_netto
FROM fietsenstalling_sectie fs
JOIN fietsenstallingen f ON f.ID = fs.fietsenstallingsId
LEFT JOIN sectie_fietstype sf ON sf.sectieID = fs.sectieId
LEFT JOIN bulkreservering b ON b.SectieID = fs.sectieId
  AND DATE(b.Startdatumtijd) = CURDATE()
  AND b.Einddatumtijd >= NOW()
WHERE f.StallingsID = '3500_213'
GROUP BY fs.sectieId, fs.externalId;
