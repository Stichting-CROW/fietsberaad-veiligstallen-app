-- SQL Query to check consistency of isKluis in fietsenstalling_sectie 
-- vs the Type field in fietsenstallingen
--
-- Rule: isKluis should be:
-- - 1 (true) when fietsenstallingen.Type = 'fietskluizen'
-- - 0 (false) for all other types

SELECT 
    f.ID AS fietsenstalling_id,
    f.StallingsID,
    f.Title,
    f.Type AS fietsenstalling_type,
    COUNT(fs.sectieId) AS total_sections,
    SUM(CASE WHEN fs.isKluis = 1 THEN 1 ELSE 0 END) AS sections_with_isKluis_1,
    SUM(CASE WHEN fs.isKluis = 0 THEN 1 ELSE 0 END) AS sections_with_isKluis_0,
    COUNT(CASE 
        WHEN f.Type = 'fietskluizen' AND fs.isKluis != 1 THEN 1
        WHEN f.Type != 'fietskluizen' AND fs.isKluis != 0 THEN 1
    END) AS inconsistent_sections,
    CASE 
        WHEN f.Type = 'fietskluizen' THEN 'Should be 1'
        ELSE 'Should be 0'
    END AS expected_isKluis,
    CASE 
        WHEN f.Type = 'fietskluizen' AND COUNT(CASE WHEN fs.isKluis != 1 THEN 1 END) > 0 THEN 'INCONSISTENT - Some sections have isKluis != 1'
        WHEN f.Type != 'fietskluizen' AND COUNT(CASE WHEN fs.isKluis != 0 THEN 1 END) > 0 THEN 'INCONSISTENT - Some sections have isKluis != 0'
        WHEN COUNT(fs.sectieId) = 0 THEN 'No sections (OK)'
        ELSE 'Consistent'
    END AS status
FROM 
    fietsenstallingen f
LEFT JOIN 
    fietsenstalling_sectie fs ON f.ID = fs.fietsenstallingsId
GROUP BY 
    f.ID, f.StallingsID, f.Title, f.Type
HAVING 
    inconsistent_sections > 0
    OR (total_sections > 0 AND (
        (f.Type = 'fietskluizen' AND sections_with_isKluis_1 != total_sections) OR
        (f.Type != 'fietskluizen' AND sections_with_isKluis_0 != total_sections)
    ))
ORDER BY 
    inconsistent_sections DESC,
    total_sections DESC,
    f.Title;

-- Summary query: Count of inconsistencies
SELECT 
    COUNT(DISTINCT f.ID) AS total_fietsenstallingen_with_inconsistencies,
    SUM(CASE WHEN f.Type = 'fietskluizen' THEN 1 ELSE 0 END) AS fietskluizen_with_wrong_isKluis,
    SUM(CASE WHEN f.Type != 'fietskluizen' THEN 1 ELSE 0 END) AS non_fietskluizen_with_wrong_isKluis,
    SUM(total_inconsistent) AS total_inconsistent_sections
FROM (
    SELECT 
        f.ID,
        f.Type,
        COUNT(CASE 
            WHEN f.Type = 'fietskluizen' AND fs.isKluis != 1 THEN 1
            WHEN f.Type != 'fietskluizen' AND fs.isKluis != 0 THEN 1
        END) AS total_inconsistent
    FROM 
        fietsenstallingen f
    LEFT JOIN 
        fietsenstalling_sectie fs ON f.ID = fs.fietsenstallingsId
    GROUP BY 
        f.ID, f.Type
    HAVING 
        total_inconsistent > 0
) AS inconsistencies;

-- Detailed query: Show all inconsistent sections with details
SELECT 
    f.ID AS fietsenstalling_id,
    f.StallingsID,
    f.Title AS fietsenstalling_title,
    f.Type AS fietsenstalling_type,
    fs.sectieId,
    fs.externalId,
    fs.titel AS section_title,
    fs.isKluis AS current_isKluis,
    CASE 
        WHEN f.Type = 'fietskluizen' THEN 1
        ELSE 0
    END AS expected_isKluis,
    CASE 
        WHEN f.Type = 'fietskluizen' AND fs.isKluis != 1 THEN 'INCONSISTENT - Should be 1'
        WHEN f.Type != 'fietskluizen' AND fs.isKluis != 0 THEN 'INCONSISTENT - Should be 0'
        ELSE 'Consistent'
    END AS status
FROM 
    fietsenstallingen f
INNER JOIN 
    fietsenstalling_sectie fs ON f.ID = fs.fietsenstallingsId
WHERE 
    (f.Type = 'fietskluizen' AND fs.isKluis != 1)
    OR (f.Type != 'fietskluizen' AND fs.isKluis != 0)
ORDER BY 
    f.Title,
    fs.sectieId;

-- Fix query template (DO NOT RUN WITHOUT REVIEWING RESULTS FIRST)
-- Update all sections for fietskluizen type fietsenstallingen
-- UPDATE fietsenstalling_sectie fs
-- INNER JOIN fietsenstallingen f ON fs.fietsenstallingsId = f.ID
-- SET fs.isKluis = 1
-- WHERE f.Type = 'fietskluizen' AND fs.isKluis != 1;

-- Update all sections for non-fietskluizen type fietsenstallingen  
-- UPDATE fietsenstalling_sectie fs
-- INNER JOIN fietsenstallingen f ON fs.fietsenstallingsId = f.ID
-- SET fs.isKluis = 0
-- WHERE f.Type != 'fietskluizen' AND fs.isKluis != 0;

