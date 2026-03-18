-- FMS mirror triggers: copy testgemeente rows from wachtrij_* to new_wachtrij_*
-- Condition: bikeparkID (StallingsID) belongs to testgemeente via fietsenstallingen.SiteID -> contacts.CompanyName = 'testgemeente API'
-- No DELETE - rows remain in wachtrij_* for ColdFusion processor

-- Trigger 1: wachtrij_transacties -> new_wachtrij_transacties
DROP TRIGGER IF EXISTS `trg_wachtrij_transacties_mirror_to_new`;
DELIMITER $$
CREATE TRIGGER `trg_wachtrij_transacties_mirror_to_new`
AFTER INSERT ON `wachtrij_transacties`
FOR EACH ROW
BEGIN
  IF EXISTS (
    SELECT 1 FROM fietsenstallingen f
    INNER JOIN contacts c ON f.SiteID = c.ID
    WHERE f.StallingsID = NEW.bikeparkID AND c.CompanyName = 'testgemeente API'
  ) THEN
    INSERT INTO new_wachtrij_transacties (
      transactionDate, bikeparkID, sectionID, placeID, externalPlaceID,
      transactionID, passID, passtype, type, typeCheck, price, transaction,
      processed, processDate, error, dateCreated
    ) VALUES (
      NEW.transactionDate, NEW.bikeparkID, NEW.sectionID, NEW.placeID, NEW.externalPlaceID,
      NEW.transactionID, NEW.passID, NEW.passtype, NEW.type, NEW.typeCheck, NEW.price, NEW.transaction,
      NEW.processed, NEW.processDate, NEW.error, NEW.dateCreated
    );
  END IF;
END$$
DELIMITER ;

-- Trigger 2: wachtrij_pasids -> new_wachtrij_pasids
DROP TRIGGER IF EXISTS `trg_wachtrij_pasids_mirror_to_new`;
DELIMITER $$
CREATE TRIGGER `trg_wachtrij_pasids_mirror_to_new`
AFTER INSERT ON `wachtrij_pasids`
FOR EACH ROW
BEGIN
  IF EXISTS (
    SELECT 1 FROM fietsenstallingen f
    INNER JOIN contacts c ON f.SiteID = c.ID
    WHERE f.StallingsID = NEW.bikeparkID AND c.CompanyName = 'testgemeente API'
  ) THEN
    INSERT INTO new_wachtrij_pasids (
      transactionDate, bikeparkID, passID, barcode, RFID, RFIDBike, biketypeID, bike,
      processed, processDate, error, DateCreated
    ) VALUES (
      NEW.transactionDate, NEW.bikeparkID, NEW.passID, NEW.barcode, NEW.RFID, NEW.RFIDBike, NEW.biketypeID, NEW.bike,
      NEW.processed, NEW.processDate, NEW.error, NEW.DateCreated
    );
  END IF;
END$$
DELIMITER ;

-- Trigger 3: wachtrij_betalingen -> new_wachtrij_betalingen
DROP TRIGGER IF EXISTS `trg_wachtrij_betalingen_mirror_to_new`;
DELIMITER $$
CREATE TRIGGER `trg_wachtrij_betalingen_mirror_to_new`
AFTER INSERT ON `wachtrij_betalingen`
FOR EACH ROW
BEGIN
  IF EXISTS (
    SELECT 1 FROM fietsenstallingen f
    INNER JOIN contacts c ON f.SiteID = c.ID
    WHERE f.StallingsID = NEW.bikeparkID AND c.CompanyName = 'testgemeente API'
  ) THEN
    INSERT INTO new_wachtrij_betalingen (
      bikeparkID, passID, idtype, transactionDate, paymentTypeID, amount,
      processed, processDate, error, dateCreated
    ) VALUES (
      NEW.bikeparkID, NEW.passID, NEW.idtype, NEW.transactionDate, NEW.paymentTypeID, NEW.amount,
      NEW.processed, NEW.processDate, NEW.error, NEW.dateCreated
    );
  END IF;
END$$
DELIMITER ;

-- Trigger 4: wachtrij_sync -> new_wachtrij_sync
DROP TRIGGER IF EXISTS `trg_wachtrij_sync_mirror_to_new`;
DELIMITER $$
CREATE TRIGGER `trg_wachtrij_sync_mirror_to_new`
AFTER INSERT ON `wachtrij_sync`
FOR EACH ROW
BEGIN
  IF EXISTS (
    SELECT 1 FROM fietsenstallingen f
    INNER JOIN contacts c ON f.SiteID = c.ID
    WHERE f.StallingsID = NEW.bikeparkID AND c.CompanyName = 'testgemeente API'
  ) THEN
    INSERT INTO new_wachtrij_sync (
      bikes, bikeparkID, sectionID, transactionDate, processed, processDate, error, dateCreated
    ) VALUES (
      NEW.bikes, NEW.bikeparkID, NEW.sectionID, NEW.transactionDate, NEW.processed, NEW.processDate, NEW.error, NEW.dateCreated
    );
  END IF;
END$$
DELIMITER ;

-- Trigger 5: bezettingsdata_tmp -> new_bezettingsdata_tmp (testgemeente only)
-- Mirrors occupation data for Lumiguide/external sources so update-bezettingsdata (useLocalProcessor) can read from new_*.
DROP TRIGGER IF EXISTS `trg_bezettingsdata_tmp_mirror_insert`;
DELIMITER $$
CREATE TRIGGER `trg_bezettingsdata_tmp_mirror_insert`
AFTER INSERT ON `bezettingsdata_tmp`
FOR EACH ROW
BEGIN
  IF NEW.bikeparkID IS NOT NULL AND EXISTS (
    SELECT 1 FROM fietsenstallingen f
    INNER JOIN contacts c ON f.SiteID = c.ID
    WHERE f.StallingsID = NEW.bikeparkID AND c.CompanyName = 'testgemeente API'
  ) THEN
    INSERT INTO new_bezettingsdata_tmp (
      timestampStartInterval, timestamp, `interval`, source, bikeparkID, sectionID,
      brutoCapacity, capacity, bulkreserveration, occupation, checkins, checkouts, open, rawData, dateModified
    ) VALUES (
      NEW.timestampStartInterval, NEW.timestamp, NEW.`interval`, NEW.source, NEW.bikeparkID, NEW.sectionID,
      NEW.brutoCapacity, NEW.capacity, NEW.bulkreserveration, NEW.occupation, NEW.checkins, NEW.checkouts, NEW.open, NEW.rawData, NEW.dateModified
    )
    ON DUPLICATE KEY UPDATE
      occupation = NEW.occupation,
      capacity = NEW.capacity,
      checkins = NEW.checkins,
      checkouts = NEW.checkouts,
      open = NEW.open,
      rawData = NEW.rawData,
      dateModified = NEW.dateModified;
  END IF;
END$$
DELIMITER ;

DROP TRIGGER IF EXISTS `trg_bezettingsdata_tmp_mirror_update`;
DELIMITER $$
CREATE TRIGGER `trg_bezettingsdata_tmp_mirror_update`
AFTER UPDATE ON `bezettingsdata_tmp`
FOR EACH ROW
BEGIN
  IF NEW.bikeparkID IS NOT NULL AND EXISTS (
    SELECT 1 FROM fietsenstallingen f
    INNER JOIN contacts c ON f.SiteID = c.ID
    WHERE f.StallingsID = NEW.bikeparkID AND c.CompanyName = 'testgemeente API'
  ) THEN
    INSERT INTO new_bezettingsdata_tmp (
      timestampStartInterval, timestamp, `interval`, source, bikeparkID, sectionID,
      brutoCapacity, capacity, bulkreserveration, occupation, checkins, checkouts, open, rawData, dateModified
    ) VALUES (
      NEW.timestampStartInterval, NEW.timestamp, NEW.`interval`, NEW.source, NEW.bikeparkID, NEW.sectionID,
      NEW.brutoCapacity, NEW.capacity, NEW.bulkreserveration, NEW.occupation, NEW.checkins, NEW.checkouts, NEW.open, NEW.rawData, NEW.dateModified
    )
    ON DUPLICATE KEY UPDATE
      occupation = NEW.occupation,
      capacity = NEW.capacity,
      checkins = NEW.checkins,
      checkouts = NEW.checkouts,
      open = NEW.open,
      rawData = NEW.rawData,
      dateModified = NEW.dateModified;
  END IF;
END$$
DELIMITER ;
