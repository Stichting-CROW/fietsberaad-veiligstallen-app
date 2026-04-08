-- Count stalling-level vs section-level sectie_fietstype per stalling.
-- Stalling-level: sectieID null, StallingsID = fietsenstallingen.ID (UUID).
-- Section-level: sectieID set, via fietsenstalling_sectie.

SELECT
    f.StallingsID,
    f.Title,
    f.hasUniSectionPrices,
    f.hasUniBikeTypePrices,
    COALESCE(stalling_cnt.cnt, 0) AS stalling_level_count,
    COALESCE(section_cnt.cnt, 0) AS section_level_count
FROM fietsenstallingen f
LEFT JOIN (
    SELECT sf.StallingsID, COUNT(*) AS cnt
    FROM sectie_fietstype sf
    WHERE sf.sectieID IS NULL AND sf.StallingsID IS NOT NULL
    GROUP BY sf.StallingsID
) stalling_cnt ON stalling_cnt.StallingsID = f.ID
LEFT JOIN (
    SELECT s.fietsenstallingsId, COUNT(*) AS cnt
    FROM fietsenstalling_sectie s
    JOIN sectie_fietstype sf ON sf.sectieID = s.sectieId
    GROUP BY s.fietsenstallingsId
) section_cnt ON section_cnt.fietsenstallingsId = f.ID
WHERE f.Status = '1'
ORDER BY f.StallingsID;

-- Per biketype per stalling
SELECT
    f.StallingsID,
    all_sf.BikeTypeID,
    ft.Name AS biketype_name,
    all_sf.stalling_level_count,
    all_sf.section_level_count
FROM fietsenstallingen f
JOIN (
    SELECT StallingsID AS stalling_id, BikeTypeID,
           SUM(stalling_flg) AS stalling_level_count,
           SUM(section_flg) AS section_level_count
    FROM (
        SELECT sf.StallingsID, sf.BikeTypeID, 1 AS stalling_flg, 0 AS section_flg
        FROM sectie_fietstype sf
        WHERE sf.sectieID IS NULL AND sf.StallingsID IS NOT NULL
        UNION ALL
        SELECT s.fietsenstallingsId AS StallingsID, sf.BikeTypeID, 0, 1
        FROM fietsenstalling_sectie s
        JOIN sectie_fietstype sf ON sf.sectieID = s.sectieId
    ) u
    GROUP BY StallingsID, BikeTypeID
) all_sf ON all_sf.stalling_id = f.ID
LEFT JOIN fietstypen ft ON ft.ID = all_sf.BikeTypeID
WHERE f.Status = '1'
ORDER BY f.StallingsID, all_sf.BikeTypeID;
