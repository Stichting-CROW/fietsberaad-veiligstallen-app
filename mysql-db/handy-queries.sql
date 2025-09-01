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
