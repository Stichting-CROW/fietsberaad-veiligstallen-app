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

-- List all tables in the database (excluding tables from TABLES_ALL)
SELECT TABLE_NAME 
FROM information_schema.TABLES 
WHERE TABLE_SCHEMA = 'veiligstallen' 
  AND TABLE_TYPE = 'BASE TABLE'
ORDER BY TABLE_NAME;

-- List all tables with row counts and disk sizes (data and indexes)
SELECT 
    TABLE_NAME AS 'Table',
    TABLE_ROWS AS 'Rows',
    ROUND((DATA_LENGTH / 1024 / 1024), 2) AS 'Data Size (MB)',
    ROUND((INDEX_LENGTH / 1024 / 1024), 2) AS 'Index Size (MB)',
    ROUND(((DATA_LENGTH + INDEX_LENGTH) / 1024 / 1024), 2) AS 'Total Size (MB)',
    ROUND((DATA_FREE / 1024 / 1024), 2) AS 'Free Space (MB)'
FROM information_schema.TABLES 
WHERE TABLE_SCHEMA = 'veiligstallen' 
  AND TABLE_TYPE = 'BASE TABLE'
ORDER BY (DATA_LENGTH + INDEX_LENGTH) DESC;

-- Transacties grouped by date_checkin (date only) and combination of Type_checkin and Type_checkout
-- Selects all dates after 1/9/2025 (September 1, 2025)
SELECT 
    fietsenstallingen.Title,
    DATE(Date_checkin) AS checkin_date,
    Type_checkin,
    Type_checkout,
    COUNT(*) AS transaction_count
FROM 
  transacties
  left join fietsenstallingen on fietsenstallingen.StallingsID = transacties.FietsenstallingID
WHERE DATE(Date_checkin) > '2025-09-01'
GROUP BY 
    fietsenstallingen.Title,
    DATE(Date_checkin),
    Type_checkin,
    Type_checkout
ORDER BY 
    fietsenstallingen.Title ASC,
    checkin_date ASC,
    Type_checkin ASC,
    Type_checkout ASC;

-- Check if MySQL restore/import operations are running
-- Shows all active connections and their current queries
SHOW FULL PROCESSLIST;

-- More detailed view of running processes (queryable)
SELECT 
    ID,
    USER,
    HOST,
    DB,
    COMMAND,
    TIME AS 'Time (sec)',
    STATE,
    LEFT(INFO, 100) AS 'Query (first 100 chars)',
    CASE 
        WHEN COMMAND = 'Query' AND (INFO LIKE '%INSERT%' OR INFO LIKE '%LOAD DATA%' OR INFO LIKE '%CREATE TABLE%') THEN 'Import/Restore'
        WHEN COMMAND = 'Sleep' THEN 'Idle'
        ELSE 'Other'
    END AS 'Operation Type'
FROM information_schema.PROCESSLIST
WHERE DB = 'veiligstallen' OR DB IS NULL
ORDER BY TIME DESC;

-- Check specifically for restore/import operations
SELECT 
    ID,
    USER,
    HOST,
    DB,
    TIME AS 'Duration (sec)',
    STATE,
    INFO AS 'Query'
FROM information_schema.PROCESSLIST
WHERE (
    INFO LIKE '%INSERT%' 
    OR INFO LIKE '%LOAD DATA%' 
    OR INFO LIKE '%CREATE TABLE%'
    OR INFO LIKE '%ALTER TABLE%'
    OR COMMAND = 'Query'
)
AND (DB = 'veiligstallen' OR DB IS NULL)
AND TIME > 0
ORDER BY TIME DESC;

-- Check for long-running queries (potential restore operations)
SELECT 
    ID,
    USER,
    HOST,
    DB,
    COMMAND,
    TIME AS 'Duration (sec)',
    ROUND(TIME / 60, 2) AS 'Duration (min)',
    STATE,
    LEFT(INFO, 200) AS 'Query'
FROM information_schema.PROCESSLIST
WHERE TIME > 10  -- Running for more than 10 seconds
AND (DB = 'veiligstallen' OR DB IS NULL)
ORDER BY TIME DESC;

-- Show all sleeping/idle processes
SELECT 
    ID,
    USER,
    HOST,
    DB,
    COMMAND,
    TIME AS 'Idle Time (sec)',
    ROUND(TIME / 60, 2) AS 'Idle Time (min)',
    STATE
FROM information_schema.PROCESSLIST
WHERE COMMAND = 'Sleep'
AND (DB = 'veiligstallen' OR DB IS NULL)
ORDER BY TIME DESC;

-- Generate KILL commands for all sleeping processes
-- Copy the output and execute the KILL commands
SELECT CONCAT('KILL ', ID, ';') AS 'KILL Command'
FROM information_schema.PROCESSLIST
WHERE COMMAND = 'Sleep'
AND (DB = 'veiligstallen' OR DB IS NULL)
AND ID != CONNECTION_ID()  -- Don't kill your own connection
ORDER BY TIME DESC;

-- Kill sleeping processes for a specific user (e.g., veiligstallen_readwrite)
SELECT CONCAT('KILL ', ID, ';') AS 'KILL Command'
FROM information_schema.PROCESSLIST
WHERE COMMAND = 'Sleep'
AND USER = 'veiligstallen_web'
AND ID != CONNECTION_ID()
ORDER BY TIME DESC;

-- Kill sleeping processes that have been idle for more than X seconds (example: 300 = 5 minutes)
-- Adjust the TIME value as needed
SELECT CONCAT('KILL ', ID, ';') AS 'KILL Command'
FROM information_schema.PROCESSLIST
WHERE COMMAND = 'Sleep'
AND TIME > 300  -- Idle for more than 5 minutes
AND (DB = 'veiligstallen' OR DB IS NULL)
AND ID != CONNECTION_ID()
ORDER BY TIME DESC;

-- List fietsenstalling details with source and record counts from transacties_archief
SELECT 
    f.Title AS 'Fietsenstalling',
    f.Plaats AS 'Plaats',
    ta.locationid AS 'StallingsID',
    ta.source AS 'Source',
    COUNT(*) AS 'Aantal Records'
FROM transacties_archief ta
LEFT JOIN fietsenstallingen f ON ta.locationid = f.StallingsID
WHERE ta.source IS NOT NULL
GROUP BY f.Title, f.Plaats, ta.locationid, ta.source
ORDER BY f.Plaats, f.Title, ta.source;

-- Update table statistics in information_schema.TABLES
-- Note: You cannot directly UPDATE information_schema.TABLES
-- Instead, use ANALYZE TABLE to refresh statistics for a specific table
ANALYZE TABLE table_name;

-- Update statistics for all tables in the database
-- Generate ANALYZE TABLE commands for all tables
SELECT CONCAT('ANALYZE TABLE ', TABLE_NAME, ';') AS 'ANALYZE Command'
FROM information_schema.TABLES 
WHERE TABLE_SCHEMA = 'veiligstallen' 
  AND TABLE_TYPE = 'BASE TABLE'
ORDER BY TABLE_NAME;

-- Alternative: Use OPTIMIZE TABLE (also updates statistics and rebuilds indexes)
OPTIMIZE TABLE table_name;

-- Generate OPTIMIZE TABLE commands for all tables
SELECT CONCAT('OPTIMIZE TABLE ', TABLE_NAME, ';') AS 'OPTIMIZE Command'
FROM information_schema.TABLES 
WHERE TABLE_SCHEMA = 'veiligstallen' 
  AND TABLE_TYPE = 'BASE TABLE'
ORDER BY TABLE_NAME;

-- Note: For InnoDB tables, ANALYZE TABLE updates:
-- - TABLE_ROWS (approximate row count)
-- - DATA_LENGTH, INDEX_LENGTH, DATA_FREE (size information)
-- These values are used by the optimizer for query planning