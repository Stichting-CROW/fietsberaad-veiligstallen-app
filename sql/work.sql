-- Active: 1764679981156@@127.0.0.1@5555@veiligstallen

select f.Title, f.type, f.plaats, f.status
from fietsenstallingen f    
where f.ExploitantID is null;