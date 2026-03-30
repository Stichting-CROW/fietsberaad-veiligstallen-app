-- Analyse biketypes insertion order for V3 sections API
-- Use for manual execution in MySQL Workbench to verify sectie_fietstype order.
-- SectionBiketypeID is auto-increment; ORDER BY SectionBiketypeID = insertion order.

-- =============================================================================
-- 1. Set parameters (edit these for your case)
-- =============================================================================
SET @citycode = '7300';
SET @locationid = '7300_111';
SET @sectionid = '7300_111_1';

-- =============================================================================
-- 2. Section-level biketypes (sectie_fietstype with sectieID set)
--    This is what the API returns for sections with per-section biketypes.
--    Ordered by SectionBiketypeID = insertion order (matches ColdFusion).
-- =============================================================================
SELECT
    f.StallingsID,
    s.sectieId,
    s.externalId AS section_externalId,
    s.titel AS section_titel,
    sf.SectionBiketypeID,
    sf.BikeTypeID,
    ft.Name AS biketype_name,
    sf.Capaciteit,
    sf.Toegestaan,
    'section-level (sectieID set)' AS source
FROM fietsenstallingen f
JOIN contacts c ON c.ID = f.SiteID AND c.ZipID = @citycode
JOIN fietsenstalling_sectie s ON s.fietsenstallingsId = f.ID
JOIN sectie_fietstype sf ON sf.sectieID = s.sectieId
LEFT JOIN fietstypen ft ON ft.ID = sf.BikeTypeID
WHERE f.StallingsID = @locationid
  AND f.Status = '1'
  AND (s.externalId = @sectionid OR @sectionid = '')
ORDER BY s.sectieId, sf.SectionBiketypeID ASC;

-- =============================================================================
-- 3. Stalling-level biketypes (sectie_fietstype with StallingsID set, sectieID null)
--    Used when hasUniSectionPrices=1; same biketypes for all sections in location.
--    sectie_fietstype.StallingsID references fietsenstallingen.ID (UUID), not StallingsID (short).
-- =============================================================================
SELECT
    f.StallingsID,
    f.hasUniSectionPrices,
    sf.SectionBiketypeID,
    sf.BikeTypeID,
    ft.Name AS biketype_name,
    sf.Capaciteit,
    sf.Toegestaan,
    'stalling-level (StallingsID set, sectieID null)' AS source
FROM fietsenstallingen f
JOIN sectie_fietstype sf ON sf.StallingsID = f.ID AND sf.sectieID IS NULL
LEFT JOIN fietstypen ft ON ft.ID = sf.BikeTypeID
WHERE f.StallingsID = @locationid
  AND f.Status = '1'
ORDER BY sf.SectionBiketypeID ASC;

-- =============================================================================
-- 4. Location metadata: which source is used for biketypes?
-- =============================================================================
SELECT
    f.StallingsID,
    f.Title,
    f.hasUniSectionPrices,
    f.hasUniBikeTypePrices,
    CASE
        WHEN f.hasUniSectionPrices = 1 AND (f.hasUniBikeTypePrices = 0 OR f.hasUniBikeTypePrices IS NULL)
        THEN 'Use stalling-level sectie_fietstype (query 3)'
        ELSE 'Use section-level sectie_fietstype (query 2)'
    END AS biketypes_source
FROM fietsenstallingen f
WHERE f.StallingsID = @locationid
  AND f.Status = '1';

-- =============================================================================
-- 5. All sectie_fietstype for a location (both section + stalling level)
--    Quick overview of insertion order across the whole location.
--    sectie_fietstype.StallingsID references fietsenstallingen.ID (UUID).
-- =============================================================================
SELECT
    sf.SectionBiketypeID,
    sf.sectieID,
    s.externalId AS section_externalId,
    sf.StallingsID,
    sf.BikeTypeID,
    ft.Name AS biketype_name,
    sf.Capaciteit,
    sf.Toegestaan,
    CASE WHEN sf.sectieID IS NOT NULL THEN 'section' ELSE 'stalling' END AS level
FROM sectie_fietstype sf
LEFT JOIN fietsenstalling_sectie s ON s.sectieId = sf.sectieID
LEFT JOIN fietstypen ft ON ft.ID = sf.BikeTypeID
LEFT JOIN fietsenstallingen f ON f.ID = COALESCE(s.fietsenstallingsId, sf.StallingsID)
WHERE (sf.sectieID IS NULL AND f.StallingsID = @locationid AND f.Status = '1')
   OR (sf.sectieID IS NOT NULL AND f.StallingsID = @locationid AND f.Status = '1')
ORDER BY sf.SectionBiketypeID ASC;
