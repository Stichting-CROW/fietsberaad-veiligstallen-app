-- SQL Query to check consistency of Capacity in fietsenstallingen 
-- vs the calculated capacity from sections
--
-- This query identifies fietsenstallingen where:
-- - The Capacity field doesn't match the sum of capacities from active sections
-- - Sections exist but Capacity is NULL or 0
-- - Capacity is set but sections don't exist or have no capacity

SELECT 
    f.ID AS fietsenstalling_id,
    f.StallingsID,
    f.Title,
    f.Capacity AS stored_capacity,
    COALESCE(calculated_capacity.calculated_capacity, 0) AS calculated_capacity,
    COALESCE(calculated_capacity.calculated_capacity, 0) - COALESCE(f.Capacity, 0) AS difference,
    calculated_capacity.active_sections_count,
    calculated_capacity.sections_with_capacity_count,
    CASE 
        WHEN f.Capacity IS NULL AND calculated_capacity.calculated_capacity > 0 THEN 'NULL capacity but sections exist'
        WHEN f.Capacity = 0 AND calculated_capacity.calculated_capacity > 0 THEN 'Zero capacity but sections exist'
        WHEN f.Capacity IS NOT NULL AND f.Capacity != calculated_capacity.calculated_capacity THEN 'Mismatch'
        WHEN f.Capacity IS NOT NULL AND f.Capacity > 0 AND calculated_capacity.calculated_capacity = 0 THEN 'Has capacity but no sections'
        WHEN f.Capacity IS NULL AND calculated_capacity.calculated_capacity = 0 THEN 'Both NULL/zero (OK if no sections)'
        ELSE 'Consistent'
    END AS status
FROM 
    fietsenstallingen f
LEFT JOIN (
    -- Calculate capacity from active sections
    SELECT 
        fs.fietsenstallingsId,
        COALESCE(SUM(sft.Capaciteit), 0) AS calculated_capacity,
        COUNT(DISTINCT fs.sectieId) AS active_sections_count,
        COUNT(DISTINCT CASE WHEN sft.Capaciteit > 0 THEN fs.sectieId END) AS sections_with_capacity_count
    FROM 
        fietsenstalling_sectie fs
    INNER JOIN 
        sectie_fietstype sft ON fs.sectieId = sft.sectieID
    WHERE 
        fs.isactief = 1
        AND (sft.Toegestaan IS NULL OR sft.Toegestaan = 1)  -- Only count allowed bike types
    GROUP BY 
        fs.fietsenstallingsId
) calculated_capacity ON f.ID = calculated_capacity.fietsenstallingsId
WHERE 
    -- Only show inconsistent records
    f.Capacity IS NULL 
    OR calculated_capacity.calculated_capacity IS NULL
    OR f.Capacity != COALESCE(calculated_capacity.calculated_capacity, 0)
ORDER BY 
    ABS(COALESCE(calculated_capacity.calculated_capacity, 0) - COALESCE(f.Capacity, 0)) DESC,
    f.Title;

-- Summary query: Count of inconsistencies
SELECT 
    COUNT(*) AS total_inconsistencies,
    SUM(CASE WHEN f.Capacity IS NULL AND calculated_capacity.calculated_capacity > 0 THEN 1 ELSE 0 END) AS null_but_has_sections,
    SUM(CASE WHEN f.Capacity = 0 AND calculated_capacity.calculated_capacity > 0 THEN 1 ELSE 0 END) AS zero_but_has_sections,
    SUM(CASE WHEN f.Capacity IS NOT NULL AND f.Capacity != COALESCE(calculated_capacity.calculated_capacity, 0) THEN 1 ELSE 0 END) AS capacity_mismatches,
    SUM(CASE WHEN f.Capacity > 0 AND COALESCE(calculated_capacity.calculated_capacity, 0) = 0 THEN 1 ELSE 0 END) AS capacity_but_no_sections
FROM 
    fietsenstallingen f
LEFT JOIN (
    SELECT 
        fs.fietsenstallingsId,
        COALESCE(SUM(sft.Capaciteit), 0) AS calculated_capacity
    FROM 
        fietsenstalling_sectie fs
    INNER JOIN 
        sectie_fietstype sft ON fs.sectieId = sft.sectieID
    WHERE 
        fs.isactief = 1
        AND (sft.Toegestaan IS NULL OR sft.Toegestaan = 1)
    GROUP BY 
        fs.fietsenstallingsId
) calculated_capacity ON f.ID = calculated_capacity.fietsenstallingsId
WHERE 
    f.Capacity IS NULL 
    OR calculated_capacity.calculated_capacity IS NULL
    OR f.Capacity != COALESCE(calculated_capacity.calculated_capacity, 0);

