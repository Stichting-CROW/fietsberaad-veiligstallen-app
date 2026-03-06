-- Analyse free/capacity diff for citycode 5304 (V3 citycodes/{citycode}/locations)
-- Old API: free=0, capacity omitted for some locations
-- New API: free=270, capacity=270 and free=90, capacity=90
-- ColdFusion: capacityForFree = fietsenstallingen.Capacity when "set and numeric", else sum(secties_fietstype)

-- 1. Locations for citycode 5304 with Capacity and section data
SELECT f.StallingsID, f.Title, f.Type, f.Capacity, f.BronBezettingsdata,
       (SELECT SUM(sf.Capaciteit) FROM fietsenstalling_sectie s
        JOIN sectie_fietstype sf ON sf.sectieID = s.sectieId
        WHERE s.fietsenstallingsId = f.ID) AS secties_capaciteit_sum
FROM fietsenstallingen f
JOIN contacts c ON c.ID = f.SiteID AND c.ZipID = '5304'
WHERE f.Status = '1'
ORDER BY f.StallingsID;

-- 2. Per-section: Capaciteit, Bezetting, bulkreservations for today
SELECT f.StallingsID, s.sectieId, s.titel, s.Bezetting,
       (SELECT SUM(sf.Capaciteit) FROM sectie_fietstype sf WHERE sf.sectieID = s.sectieId) AS sectie_capaciteit,
       (SELECT COALESCE(SUM(b.Aantal), 0) FROM bulkreservering b
        WHERE b.SectieID = s.sectieId
          AND DATE(b.Startdatumtijd) = CURDATE()
          AND b.Einddatumtijd >= NOW()
          AND b.ID NOT IN (SELECT BulkreservationID FROM bulkreserveringuitzondering WHERE datum = CURDATE())) AS bulk_vandaag
FROM fietsenstallingen f
JOIN contacts c ON c.ID = f.SiteID AND c.ZipID = '5304'
JOIN fietsenstalling_sectie s ON s.fietsenstallingsId = f.ID
WHERE f.Status = '1'
ORDER BY f.StallingsID, s.sectieId;

-- 3. Check: when fietsenstallingen.Capacity is 0 or set, old API uses it for capacityForFree
-- If Capacity=0: old API free = max(0, 0 - occupied) = 0
-- If Capacity NULL: old API uses sum(secties_fietstype)
SELECT StallingsID, Capacity,
       CASE WHEN Capacity IS NOT NULL AND Capacity = 0 THEN 'OLD: capacityForFree=0 -> free=0'
            WHEN Capacity IS NOT NULL AND Capacity > 0 THEN 'OLD: capacityForFree=Capacity'
            ELSE 'OLD: capacityForFree=sum(secties)'
       END AS old_api_behavior
FROM fietsenstallingen f
JOIN contacts c ON c.ID = f.SiteID AND c.ZipID = '5304'
WHERE f.Status = '1'
ORDER BY StallingsID;
