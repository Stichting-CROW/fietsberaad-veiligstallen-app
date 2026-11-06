-- Flyway's first script alters fietsenstallingen. The catalog row is created by the main app in production.
CREATE TABLE IF NOT EXISTS fietsenstallingen (
  id CHAR(35) NOT NULL,
  title VARCHAR(255) NULL,
  PRIMARY KEY (id)
);

-- V1.0.0.2 alters this column. The shared catalog creates the table; this suite only needs the column the script changes.
CREATE TABLE IF NOT EXISTS fietsenstalling_sectie (
  sectieId INT NOT NULL AUTO_INCREMENT,
  fietsenstallingsId VARCHAR(35) NULL,
  PRIMARY KEY (sectieId)
);
