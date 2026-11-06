-- Production view definitions (Azure MySQL). Applied after `prisma db push` on local/acc-docker DBs.
-- DEFINER removed so views work with the docker `veiligstallen` user.
-- v_ds_surveyareas_parkinglocations omitted: ds_* tables are not in schema.prisma.

DROP VIEW IF EXISTS `transacties_view`;
CREATE VIEW `transacties_view` AS
SELECT
  1 AS `rowcount`,
  `transacties`.`ZipID` AS `ZipID`,
  `transacties`.`PasID` AS `pasID`,
  `transacties`.`FietsenstallingID` AS `FietsenstallingID`,
  `transacties`.`SectieID` AS `SectieID`,
  `transacties`.`Date_checkin` AS `Date_checkin`,
  `transacties`.`Date_checkout` AS `Date_checkout`,
  `transacties`.`Stallingsduur` AS `Stallingsduur`,
  `transacties`.`ClientTypeID` AS `Clienttype`,
  `transacties`.`Stallingskosten` AS `stallingskosten`,
  `transacties`.`BikeTypeID` AS `BikeTypeID`,
  `transacties`.`ExploitantID` AS `exploitantID`,
  `transacties`.`Type_checkin` AS `type_checkin`,
  `transacties`.`Type_checkout` AS `type_checkout`
FROM `transacties`;

DROP VIEW IF EXISTS `vw_fmsservice_errors`;
CREATE VIEW `vw_fmsservice_errors` AS
SELECT
  `webservice_log`.`ID` AS `ID`,
  `webservice_log`.`tijdstip` AS `tijdstip`,
  `webservice_log`.`method` AS `method`,
  `webservice_log`.`bikeparkID` AS `bikeparkID`,
  `webservice_log`.`logtekst` AS `logtekst`,
  `webservice_log`.`logtekst2` AS `logtekst2`,
  `webservice_log`.`ms` AS `ms`
FROM `webservice_log`
WHERE (`webservice_log`.`method` = 'ERROR')
ORDER BY `webservice_log`.`ID` DESC;

DROP VIEW IF EXISTS `vw_locations`;
CREATE VIEW `vw_locations` AS
SELECT
  `c`.`ZipID` AS `citycode`,
  `c`.`CompanyName` AS `name`,
  `f`.`StallingsID` AS `locationid`,
  `f`.`Title` AS `location_name`,
  `f`.`Type` AS `locationtype`,
  `f`.`BronBezettingsdata` AS `occupationsource`,
  `f`.`Coordinaten` AS `Coordinaten`,
  `f`.`Open_ma` AS `Open_ma`,
  `f`.`Dicht_ma` AS `Dicht_ma`,
  `f`.`Open_di` AS `Open_di`,
  `f`.`Dicht_di` AS `Dicht_di`,
  `f`.`Open_wo` AS `Open_wo`,
  `f`.`Dicht_wo` AS `Dicht_wo`,
  `f`.`Open_do` AS `Open_do`,
  `f`.`Dicht_do` AS `Dicht_do`,
  `f`.`Open_vr` AS `Open_vr`,
  `f`.`Dicht_vr` AS `Dicht_vr`,
  `f`.`Open_za` AS `Open_za`,
  `f`.`Dicht_za` AS `Dicht_za`,
  `f`.`Open_zo` AS `Open_zo`,
  `f`.`Dicht_zo` AS `Dicht_zo`,
  SUM(`s`.`capaciteit`) AS `capacity`,
  (
    CASE
      WHEN (
        (`f`.`BronBezettingsdata` = 'FMS')
        AND ((`f`.`Type` = 'buurtstalling') OR (`f`.`Type` = 'fietstrommel'))
      ) THEN (
        SELECT COUNT(1)
        FROM (
          (`fietsenstalling_plek` `p`
            JOIN `fietsenstalling_sectie` `s2` ON ((`s2`.`sectieId` = `p`.`sectie_id`)))
          JOIN `fietsenstalling_plek_bezetting` `pb` ON ((`p`.`id` = `pb`.`plek_id`))
        )
        WHERE (`s2`.`fietsenstallingsId` = `f`.`ID`)
      )
      WHEN ((`f`.`BronBezettingsdata` = 'FMS') AND (`f`.`Type` = 'fietskluizen')) THEN (
        SELECT COUNT(1)
        FROM (`fietsenstalling_plek` `p`
          JOIN `fietsenstalling_sectie` `s2` ON ((`s2`.`sectieId` = `p`.`sectie_id`)))
        WHERE ((`s2`.`fietsenstallingsId` = `f`.`ID`) AND (`p`.`status` <> 0))
      )
      ELSE SUM(`s`.`Bezetting`)
    END
  ) AS `occupied`
FROM (
  (`contacts` `c`
    JOIN `fietsenstallingen` `f` ON ((`f`.`SiteID` = `c`.`ID`)))
  LEFT JOIN `fietsenstalling_sectie` `s` ON ((`f`.`ID` = `s`.`fietsenstallingsId`))
)
WHERE (`f`.`Status` = '1')
GROUP BY `f`.`ID`;

DROP VIEW IF EXISTS `vw_lopende_transacties`;
CREATE VIEW `vw_lopende_transacties` AS
SELECT
  1 AS `rowcount`,
  `accounts_pasids`.`PasID` AS `pasID`,
  `accounts_pasids`.`huidigeFietsenstallingId` AS `FietsenstallingID`,
  `accounts_pasids`.`huidigeSectieId` AS `SectieID`,
  `accounts_pasids`.`dateLastCheck` AS `Date_checkin`,
  NULL AS `Date_checkout`,
  NULL AS `Stallingsduur`,
  HOUR(`accounts_pasids`.`dateLastCheck`) AS `checkinHour`,
  DAYOFWEEK(`accounts_pasids`.`dateLastCheck`) AS `checkinDayOfWeek`,
  MONTH(`accounts_pasids`.`dateLastCheck`) AS `checkinMonth`,
  WEEK(`accounts_pasids`.`dateLastCheck`, 2) AS `checkinWeekOfYear`,
  YEAR(`accounts_pasids`.`dateLastCheck`) AS `checkinYear`,
  HOUR(`accounts_pasids`.`dateLastCheck`) AS `checkoutHour`,
  NULL AS `checkoutDayOfWeek`,
  NULL AS `checkoutMonth`,
  NULL AS `checkoutWeekOfYear`,
  NULL AS `checkoutYear`,
  `accounts_pasids`.`huidigeStallingskosten` AS `stallingskosten`
FROM `accounts_pasids`
WHERE (
  (`accounts_pasids`.`huidigeFietsenstallingId` <> '')
  AND (`accounts_pasids`.`huidigeFietsenstallingId` IS NOT NULL)
);

DROP VIEW IF EXISTS `vw_pasids`;
CREATE VIEW `vw_pasids` AS
SELECT
  `a`.`Email` AS `email`,
  `c`.`CompanyName` AS `companyName`,
  `ap`.`PasID` AS `pasID`,
  `ap`.`RFID` AS `RFID`,
  `ap`.`Pastype` AS `pastype`,
  `ap`.`barcodeFiets` AS `barcodeFiets`,
  `g`.`SiteID` AS `SiteID`,
  `ap`.`SiteID` AS `SiteID_ap`,
  `a`.`account_type` AS `account_type`,
  `a`.`ID` AS `accountID`,
  `a`.`saldo` AS `saldo`,
  `g`.`ID` AS `gemeenteaccountID`,
  `ap`.`ID` AS `bikepassID`
FROM (
  ((`accounts_pasids` `ap`
    JOIN `gemeenteaccounts` `g` ON ((`ap`.`AccountID` = `g`.`ID`)))
  JOIN `accounts` `a` ON ((`a`.`ID` = `g`.`AccountID`)))
  JOIN `contacts` `c` ON ((`c`.`ID` = `g`.`SiteID`))
);

DROP VIEW IF EXISTS `vw_stallingstegoeden`;
CREATE VIEW `vw_stallingstegoeden` AS
SELECT
  `financialtransactions`.`accountID` AS `accountID`,
  (
    COALESCE(SUM(`financialtransactions`.`amount`), 0) + (
      SELECT COALESCE(SUM(`historischesaldos`.`saldo`), 0)
      FROM `historischesaldos`
      WHERE (`historischesaldos`.`accountID` = `financialtransactions`.`accountID`)
    )
  ) AS `stallingstegoed`,
  COALESCE(SUM(`financialtransactions`.`amount`), 0) AS `lopend_stallingstegoed`,
  (
    SELECT COALESCE(SUM(`historischesaldos`.`saldo`), 0)
    FROM `historischesaldos`
    WHERE (`historischesaldos`.`accountID` = `financialtransactions`.`accountID`)
  ) AS `historischsaldo`,
  MAX(`financialtransactions`.`transactionDate`) AS `dateLastTransaction`
FROM `financialtransactions`
WHERE (
  (`financialtransactions`.`code` <> 'overboeking')
  AND (`financialtransactions`.`status` = 'ok')
)
GROUP BY `financialtransactions`.`accountID`;

DROP VIEW IF EXISTS `vw_stallingstegoedenexploitant`;
CREATE VIEW `vw_stallingstegoedenexploitant` AS
SELECT
  `financialtransactions`.`accountID` AS `accountID`,
  COALESCE(
    `financialtransactions`.`paidToSiteID`,
    `financialtransactions`.`paidBySiteID`,
    `financialtransactions`.`sourceSiteID`
  ) AS `exploitantID`,
  `financialtransactions`.`siteID` AS `siteID`,
  (
    COALESCE(SUM(`financialtransactions`.`amount`), 0) + (
      SELECT COALESCE(SUM(`historischesaldos`.`saldo`), 0)
      FROM `historischesaldos`
      WHERE (
        (`historischesaldos`.`accountID` = `financialtransactions`.`accountID`)
        AND (
          `historischesaldos`.`exploitantID` = COALESCE(
            `financialtransactions`.`paidToSiteID`,
            `financialtransactions`.`paidBySiteID`,
            `financialtransactions`.`sourceSiteID`
          )
        )
      )
    )
  ) AS `stallingstegoed`,
  COALESCE(SUM(`financialtransactions`.`amount`), 0) AS `lopend_stallingstegoed`,
  (
    SELECT COALESCE(SUM(`historischesaldos`.`saldo`), 0)
    FROM `historischesaldos`
    WHERE (
      (`historischesaldos`.`accountID` = `financialtransactions`.`accountID`)
      AND (
        `historischesaldos`.`exploitantID` = COALESCE(
          `financialtransactions`.`paidToSiteID`,
          `financialtransactions`.`paidBySiteID`,
          `financialtransactions`.`sourceSiteID`
        )
      )
    )
  ) AS `historischsaldo`,
  MAX(`financialtransactions`.`transactionDate`) AS `dateLastTransaction`
FROM `financialtransactions`
WHERE (
  (
    COALESCE(
      `financialtransactions`.`paidToSiteID`,
      `financialtransactions`.`paidBySiteID`,
      `financialtransactions`.`sourceSiteID`
    ) <> '1'
  )
  AND (`financialtransactions`.`status` = 'ok')
)
GROUP BY
  `financialtransactions`.`accountID`,
  COALESCE(
    `financialtransactions`.`paidToSiteID`,
    `financialtransactions`.`paidBySiteID`,
    `financialtransactions`.`sourceSiteID`
  ),
  `financialtransactions`.`siteID`;
