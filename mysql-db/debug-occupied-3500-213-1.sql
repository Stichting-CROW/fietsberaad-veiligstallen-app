-- Debug occupied for section 3500_213_1 (old: 381, new: 380)
-- ColdFusion: place.getCurrentStatus() neq place.FREE. getCurrentStatus() = getStatus() MOD 10 when set; when empty, calculateStatus() returns OCCUPIED when getBikeParked() (transacties PlaceID, Date_checkout null).

-- 1. Section ID for 3500_213_1
SELECT fs.sectieId, fs.externalId, fs.Bezetting
FROM fietsenstalling_sectie fs
JOIN fietsenstallingen f ON f.ID = fs.fietsenstallingsId
WHERE fs.externalId = '3500_213_1';

-- 2. Locker count by status (status MOD 10 != 0) - ColdFusion getCurrentStatus
SELECT COUNT(*) AS occupied_by_status_mod10
FROM fietsenstalling_plek fp
JOIN fietsenstalling_sectie fs ON fs.sectieId = fp.sectie_id
WHERE fs.externalId = '3500_213_1'
  AND fp.status IS NOT NULL
  AND (fp.status % 10) != 0;

-- 3. Lockers with open transaction but status NULL (ColdFusion: only when status empty does it check getBikeParked)
SELECT fp.id, fp.sectie_id, fp.status, t.ID AS transactie_id, t.Date_checkin, t.Date_checkout
FROM fietsenstalling_plek fp
JOIN transacties t ON t.PlaceID = fp.id AND t.Date_checkout IS NULL
JOIN fietsenstalling_sectie fs ON fs.sectieId = fp.sectie_id
WHERE fs.externalId = '3500_213_1'
  AND fp.status IS NULL;

-- 4. Total occupied = (status MOD 10 != 0) OR (has open tx by PlaceID)
-- Count distinct places that are occupied by either criterion
SELECT COUNT(DISTINCT fp.id) AS total_occupied
FROM fietsenstalling_plek fp
JOIN fietsenstalling_sectie fs ON fs.sectieId = fp.sectie_id
LEFT JOIN transacties t ON t.PlaceID = fp.id AND t.Date_checkout IS NULL
WHERE fs.externalId = '3500_213_1'
  AND (
    (fp.status IS NOT NULL AND (fp.status % 10) != 0)
    OR (fp.status IS NULL AND t.ID IS NOT NULL)
  );
