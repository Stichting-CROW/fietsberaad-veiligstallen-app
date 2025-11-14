select UserID FROM security_users where UserName="mosbuma@bumos.nl" into @marc;
select ID From fietsenstallingen where Title like "%Marktstraat%" AND Plaats="Apeldoorn" INTO @stalling;
select @marc, @stalling;
INSERT INTO security_users_sites(UserID, SiteID, isContact) VALUES(@marc, @stalling, 0);

select fs.title
from security_users_sites sus
JOIN fietsenstallingen fs ON (fs.ID=sus.SiteID) 
where sus.UserID=@marc;

Select * from fietsenstallingen_services where FietsenstallingID="0066B68F-6F95-4C42-BACF7B44C50FA061";
Select * from fietsenstallingen where ID="0066B68F-6F95-4C42-BACF7B44C50FA061";

select ID, Title, Beheerder, BeheerderContact, Capacity from fietsenstallingen WHERE IsStationsstalling;
select * from fietsenstallingen WHERE ID="0066B68F-6F95-4C42-BACF7B44C50FA061";

select * from security_users_sites where UserID="D4351342-685D-D17A-B3617EEBBF39451C";
select * from security_users_sites where UserID = @marc;

select * from fietsenstalling_sectie where fietsenstallingsId=@SiteID;

select fs.ID, fs.Title, fs.Plaats, fs.Capacity, count(fss.sectieId), sum(fss.capaciteit)
from fietsenstalling_sectie fss
left join fietsenstallingen fs ON fs.id=fss.fietsenstallingsId
WHERE fs.ID="0066B68F-6F95-4C42-BACF7B44C50FA061"
group by fs.ID
having count(fss.sectieId)>1
order by fs.Plaats, fs.Title


CREATE USER 'veiligstallen_read'@'localhost' IDENTIFIED BY 'xxxxxx';
GRANT SELECT ON veiligstallen.* TO 'veiligstallen_read'@'localhost';

CREATE USER 'veiligstallen_readwrite'@'localhost' IDENTIFIED BY 'xxxxx';
GRANT ALL PRIVILEGES ON veiligstallen.* TO 'veiligstallen_readwrite'@'localhost';

FLUSH PRIVILEGES;

ALTER USER 'veiligstallen_readwrite'@'localhost' IDENTIFIED WITH 'caching_sha2_password' BY 'xxxxx';
FLUSH PRIVILEGES;


-- articles 
select Title, Abstract, DisplayTitle, Article 
From articles 
where 
	NOT (isnull(article) OR article="") AND 
    NOT (isnull(abstract) OR abstract="") 
ORDER BY Title ASC;

select * from articles where abstract='main';

select a.Title, a.System from articles a where a.navigation<>'main' group by a.Title, a.System;


-- Find all users missing security_users_sites records (required for ColdFusion login)
-- Users without at least one entry in security_users_sites cannot log in to ColdFusion backend
SELECT 
    su.UserID,
    su.UserName,
    su.DisplayName,
    su.Status,
    su.RoleID,
    su.GroupID,
    su.SiteID,
    su.ParentID,
    su.LastLogin
FROM security_users su
LEFT JOIN security_users_sites sus ON su.UserID = sus.UserID
WHERE sus.UserID IS NULL
  AND su.Status = '1'  -- Only active users
  AND su.RoleID <> 7   -- Exclude role 7 (Beheerder)
ORDER BY su.UserName;

-- Generate INSERT statements to fix users missing security_users_sites records
-- Priority: 1) User's SiteID, 2) user_contact_role for extern users, 3) Parent's SiteID, 4) Default to Fietsberaad for intern
-- IsContact is set to 0 (false) for regular users
-- REVIEW THE PREVIEW QUERY ABOVE BEFORE RUNNING THESE INSERT STATEMENTS
-- NOTE: Extern users without a valid SiteID will generate a comment instead of INSERT - review these manually
SELECT 
    CASE 
        -- Skip extern users without a valid SiteID (they need manual review)
        WHEN su.GroupID = 'extern' 
            AND su.SiteID IS NULL 
            AND (SELECT ContactID FROM user_contact_role WHERE UserID = su.UserID AND isOwnOrganization = 1 LIMIT 1) IS NULL
        THEN CONCAT('-- SKIPPED: Extern user without SiteID - needs manual review: ', su.UserName, ' (', su.DisplayName, ')')
        -- Generate INSERT for all other cases
        ELSE CONCAT(
            'INSERT INTO security_users_sites (UserID, SiteID, IsContact) VALUES (',
            QUOTE(su.UserID), ', ',
            CASE 
                -- First priority: Use SiteID from security_users if available
                WHEN su.SiteID IS NOT NULL AND su.SiteID != '' THEN QUOTE(su.SiteID)
                -- Second priority: For extern users, try to get from user_contact_role
                WHEN su.GroupID = 'extern' THEN 
                    (SELECT QUOTE(ContactID) FROM user_contact_role WHERE UserID = su.UserID AND isOwnOrganization = 1 LIMIT 1)
                -- Third priority: Use parent's SiteID if user has a parent
                WHEN su.ParentID IS NOT NULL AND su.ParentID != '' THEN 
                    (SELECT QUOTE(COALESCE(parent.SiteID, '1')) FROM security_users parent WHERE parent.UserID = su.ParentID LIMIT 1)
                -- Fourth priority: Intern users default to Fietsberaad
                WHEN su.GroupID = 'intern' THEN QUOTE('1')  -- Fietsberaad for intern users
                -- Last resort: Default to Fietsberaad
                ELSE QUOTE('1')
            END, ', ',
            'b\'0\');  -- User: ', su.UserName, ' (', su.DisplayName, ') GroupID: ', COALESCE(su.GroupID, 'NULL')
        )
    END AS 'INSERT Statement'
FROM security_users su
LEFT JOIN security_users_sites sus ON su.UserID = sus.UserID
WHERE sus.UserID IS NULL
  AND su.Status = '1'  -- Only active users
  AND su.RoleID <> 7   -- Exclude role 7 (Beheerder)
ORDER BY su.GroupID, su.UserName;

-- ======================================================================
-- Inspect full security user context (security_users, security_users_sites, user_contact_role)
-- Usage:
--   1. Set the @lookupEmail (or @lookupUserID) variable(s) below
--   2. Run the SELECT statements to review all related records
-- ======================================================================
SET @lookupEmail := 'user@example.com';
SET @lookupUserID := NULL; -- Optionally set directly if the UserID is known

-- Resolve the user ID (prefers explicit @lookupUserID if provided)
SELECT
    @inspectedUserID := COALESCE(@lookupUserID,
        (SELECT UserID FROM security_users WHERE UserName = @lookupEmail LIMIT 1)
    ) AS InspectedUserID;

-- Primary user record
SELECT
    su.UserID,
    su.UserName,
    su.DisplayName,
    su.GroupID,
    su.RoleID,
    su.SiteID,
    su.Status,
    su.LastLogin,
    su.ParentID
FROM security_users su
WHERE su.UserID = @inspectedUserID;

-- ======================================================================
-- security_users_sites records (REQUIRED for ColdFusion login)
-- Users without at least one entry here cannot log in to ColdFusion backend
-- ======================================================================
SELECT
    sus.ID,
    sus.UserID,
    sus.SiteID,
    sus.IsContact,
    c.CompanyName AS SiteName,
    c.ItemType    AS SiteType,
    CASE 
        WHEN sus.IsContact = 1 THEN 'Yes (Contact person)'
        ELSE 'No (Regular user)'
    END AS ContactStatus
FROM security_users_sites sus
LEFT JOIN contacts c ON c.ID = sus.SiteID
WHERE sus.UserID = @inspectedUserID
ORDER BY sus.SiteID;

-- ======================================================================
-- user_contact_role records (defines user's roles in organizations)
-- ======================================================================
SELECT
    ucr.ID,
    ucr.UserID,
    ucr.ContactID,
    ucr.NewRoleID,
    ucr.isOwnOrganization,
    c.CompanyName AS ContactName,
    c.ItemType    AS ContactType,
    CASE 
        WHEN ucr.isOwnOrganization = 1 THEN 'Yes (Own Organization)'
        ELSE 'No (Managed Organization)'
    END AS OwnOrgStatus
FROM user_contact_role ucr
LEFT JOIN contacts c ON c.ID = ucr.ContactID
WHERE ucr.UserID = @inspectedUserID
ORDER BY ucr.isOwnOrganization DESC, ucr.ContactID;

-- ======================================================================
-- Combined overview: All relationships in one view
-- ======================================================================
SELECT
    'security_users_sites' AS SourceTable,
    sus.SiteID AS OrganizationID,
    c.CompanyName AS OrganizationName,
    c.ItemType AS OrganizationType,
    sus.IsContact AS IsContact,
    NULL AS RoleID,
    NULL AS isOwnOrganization,
    'Required for ColdFusion login' AS Notes
FROM security_users_sites sus
LEFT JOIN contacts c ON c.ID = sus.SiteID
WHERE sus.UserID = @inspectedUserID

UNION ALL

SELECT
    'user_contact_role' AS SourceTable,
    ucr.ContactID AS OrganizationID,
    c.CompanyName AS OrganizationName,
    c.ItemType AS OrganizationType,
    NULL AS IsContact,
    ucr.NewRoleID AS RoleID,
    ucr.isOwnOrganization AS isOwnOrganization,
    CASE 
        WHEN ucr.isOwnOrganization = 1 THEN 'User''s own organization'
        ELSE 'Managed organization'
    END AS Notes
FROM user_contact_role ucr
LEFT JOIN contacts c ON c.ID = ucr.ContactID
WHERE ucr.UserID = @inspectedUserID

ORDER BY SourceTable, OrganizationID;

-- ======================================================================
-- Summary counts and validation checks
-- ======================================================================
SELECT
    (SELECT COUNT(*) FROM security_users_sites WHERE UserID = @inspectedUserID) AS security_users_sites_count,
    (SELECT COUNT(*) FROM user_contact_role    WHERE UserID = @inspectedUserID) AS user_contact_role_count,
    CASE 
        WHEN (SELECT COUNT(*) FROM security_users_sites WHERE UserID = @inspectedUserID) = 0 
        THEN 'WARNING: No security_users_sites records - user cannot log in to ColdFusion!'
        WHEN (SELECT COUNT(*) FROM security_users_sites WHERE UserID = @inspectedUserID) > 0 
        THEN 'OK: Has security_users_sites records'
        ELSE 'Unknown'
    END AS coldfusion_login_status,
    CASE 
        WHEN (SELECT COUNT(*) FROM user_contact_role WHERE UserID = @inspectedUserID AND isOwnOrganization = 1) = 0 
        THEN 'WARNING: No own organization role defined!'
        WHEN (SELECT COUNT(*) FROM user_contact_role WHERE UserID = @inspectedUserID AND isOwnOrganization = 1) = 1 
        THEN 'OK: Has own organization role'
        ELSE 'WARNING: Multiple own organization roles (should be exactly 1)'
    END AS own_org_status;