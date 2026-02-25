-- Debug capacity for location 3500_142 (old API: 0, new API: 192)
-- Run this to inspect bulkreservation data. Capacity 0 when bulkreservation = full capacity.

-- 1. Sections for 3500_142
SELECT fs.sectieId, fs.externalId, fs.titel, fs.Bezetting
FROM fietsenstalling_sectie fs
JOIN fietsenstallingen f ON f.ID = fs.fietsenstallingsId
WHERE f.StallingsID = '3500_142';

-- 2. secties_fietstype capacity per section
SELECT fs.sectieId, fs.externalId, sf.Capaciteit,
       (SELECT SUM(Capaciteit) FROM sectie_fietstype WHERE sectieID = fs.sectieId) AS section_capacity
FROM fietsenstalling_sectie fs
JOIN fietsenstallingen f ON f.ID = fs.fietsenstallingsId
LEFT JOIN sectie_fietstype sf ON sf.sectieID = fs.sectieId
WHERE f.StallingsID = '3500_142';

-- 3. Bulkreservations for these sections (any date) - ColdFusion uses SectieID only
SELECT b.ID, b.SectieID, b.SectionExternalID, b.Aantal, b.Startdatumtijd, b.Einddatumtijd
FROM bulkreservering b
WHERE b.SectieID IN (SELECT fs.sectieId FROM fietsenstalling_sectie fs JOIN fietsenstallingen f ON f.ID = fs.fietsenstallingsId WHERE f.StallingsID = '3500_142');

-- 4. Bulkreservations for today (Einddatumtijd >= now)
SELECT b.ID, b.SectieID, b.Aantal, b.Startdatumtijd, b.Einddatumtijd,
       DATE(b.Startdatumtijd) AS start_date,
       CURDATE() AS today
FROM bulkreservering b
WHERE b.SectieID IN (SELECT fs.sectieId FROM fietsenstalling_sectie fs JOIN fietsenstallingen f ON f.ID = fs.fietsenstallingsId WHERE f.StallingsID = '3500_142')
  AND DATE(b.Startdatumtijd) = CURDATE()
  AND b.Einddatumtijd >= NOW();
