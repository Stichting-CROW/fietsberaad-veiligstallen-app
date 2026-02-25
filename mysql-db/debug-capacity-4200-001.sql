-- Debug capacity for location 4200_001 (old API: 10/10, new API: 90/90)
-- Check fietsenstallingen.Capacity and section-based capacity

-- 1. Location and fietsenstallingen.Capacity
SELECT f.StallingsID, f.Title, f.Capacity AS fietsenstalling_Capacity,
       f.SiteID
FROM fietsenstallingen f
WHERE f.StallingsID = '4200_001';

-- 2. Section capacity from sectie_fietstype (what we sum) - ALL rows
SELECT fs.sectieId, fs.externalId,
       COALESCE(SUM(sf.Capaciteit), 0) AS section_capacity_all,
       COALESCE(SUM(CASE WHEN sf.Toegestaan IS NULL OR sf.Toegestaan = 1 THEN sf.Capaciteit ELSE 0 END), 0) AS section_capacity_toegestaan_only
FROM fietsenstalling_sectie fs
JOIN fietsenstallingen f ON f.ID = fs.fietsenstallingsId
LEFT JOIN sectie_fietstype sf ON sf.sectieID = fs.sectieId
WHERE f.StallingsID = '4200_001'
GROUP BY fs.sectieId, fs.externalId;

-- 2b. Per sectie_fietstype row: Toegestaan and Capaciteit (ColdFusion sums all; check-capacity-consistency filters by Toegestaan)
SELECT sf.SectionBiketypeID, sf.sectieID, sf.BikeTypeID, sf.Capaciteit, sf.Toegestaan
FROM sectie_fietstype sf
JOIN fietsenstalling_sectie fs ON fs.sectieId = sf.sectieID
JOIN fietsenstallingen f ON f.ID = fs.fietsenstallingsId
WHERE f.StallingsID = '4200_001';

-- 3. Total section capacity
SELECT COALESCE(SUM(sf.Capaciteit), 0) AS total_section_capacity
FROM fietsenstalling_sectie fs
JOIN fietsenstallingen f ON f.ID = fs.fietsenstallingsId
LEFT JOIN sectie_fietstype sf ON sf.sectieID = fs.sectieId
WHERE f.StallingsID = '4200_001';

-- 4. Bulkreservations for section 774 (today, Einddatumtijd >= now) - ColdFusion subtracts from capacity
-- If Aantal=80: getNettoCapacity() = 90-80 = 10, free = getCapacity()-occupied = 90-80 = 10
SELECT b.ID, b.SectieID, b.Aantal, b.Startdatumtijd, b.Einddatumtijd,
       DATE(b.Startdatumtijd) AS start_date, CURDATE() AS today
FROM bulkreservering b
WHERE b.SectieID IN (SELECT fs.sectieId FROM fietsenstalling_sectie fs JOIN fietsenstallingen f ON f.ID = fs.fietsenstallingsId WHERE f.StallingsID = '4200_001')
  AND DATE(b.Startdatumtijd) = CURDATE()
  AND b.Einddatumtijd >= NOW();
