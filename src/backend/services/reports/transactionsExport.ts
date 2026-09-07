import { prisma } from "~/server/db";
import {
  assembleCfCsv,
  cfDecimal,
  cfTransactionType,
  dutchMonthName,
  dutchWeekdayName,
  twoDigits,
} from "~/backend/services/reports/csvExportFormat";
import {
  CsvExportLookups,
  getGemeenteExportContext,
} from "~/backend/services/reports/csvExportLookups";
import { resolveCsvExportFilename } from "~/backend/services/reports/csvExportFilename";

/**
 * Port of reports_csv.cfc transacties() and ruweData().
 *
 * ColdFusion queried `transacties_view`, a 1:1 projection of the live
 * `transacties` table. That table only holds a rolling window of roughly the
 * last 18 months, so reporting on an earlier year silently returned a partial
 * file. Every completed transaction is also present in `transacties_archief`,
 * which reaches back to 2015 and which the chart reports already use, so both
 * exports read the archive and alias its columns to the names the ColdFusion
 * query used.
 */

export type CsvExportResult = {
  filename: string;
  csv: string;
};

export type TransactiesExportParams = {
  gemeenteID: string;
  stallingsID?: string;
  jaar: number;
};

export type RuweDataExportParams = {
  gemeenteID: string;
  stallingsID?: string;
  jaar: number;
  maand?: number;
};

const TRANSACTIES_HEADERS_ALLE_STALLINGEN = [
  "Stalling",
  "Datum",
  "Jaar",
  "Kwartaal",
  "Maand",
  "Week",
  "Weekdag",
  "Type tweewieler",
  "Transacties totaal",
  "Zonder abonnement",
  "Met abonnement",
  "Inkomsten transacties",
];

const TRANSACTIES_HEADERS_PER_STALLING = [
  "Stalling",
  "Sectie",
  "Datum",
  "Jaar",
  "Kwartaal",
  "Maand",
  "Week",
  "Weekdag",
  "Type tweewieler",
  "Transacties totaal",
  "Zonder abonnement",
  "Met abonnement",
  "Inkomsten transacties",
];

const RUWEDATA_HEADERS = [
  "Stalling",
  "Sectie",
  "Stallingsduur (min)",
  "Check-in tijd",
  "Check-in datum",
  "Check-out tijd",
  "Check-out datum",
  "Check-out jaar",
  "Check-out kwartaal",
  "Check-out maand",
  "Check-out week",
  "Check-out weekdag",
  "Gecorrigeerde check-out weekdag",
  "Check-out uur",
  "Stallingskosten",
  "Type fiets",
  "Abonnement",
  "Type checkin",
  "Type checkout",
];

const assertValidYear = (jaar: number) => {
  if (!Number.isInteger(jaar) || jaar < 2000 || jaar > 2100) {
    throw new Error(`Ongeldig jaar: ${jaar}`);
  }
};

const assertValidMonth = (maand: number) => {
  if (!Number.isInteger(maand) || maand < 1 || maand > 12) {
    throw new Error(`Ongeldige maand: ${maand}`);
  }
};

type TransactiesRow = {
  FietsenstallingID: string | null;
  SectieID: string | null;
  BikeTypeID: number | null;
  totalTransactions: string | null;
  totalAbonnementen_nee: string | null;
  totalAbonnementen_ja: string | null;
  totalInkomsten: string | null;
  checkout_Date_formatted: string | null;
  week_first_day: string | null;
  week_last_day: string | null;
  checkout_Year: number | null;
  checkout_Quarter: number | null;
  checkout_Month: number | null;
  checkout_Week: number | null;
  checkout_Weekday: number | null;
};

/**
 * `transacties_archief` has no stored parking duration, so it is derived the
 * same way the stallingsduur report derives it. That fills in the rows where
 * `transacties.Stallingsduur` was null, and it deviates by an hour for stays
 * spanning a daylight saving transition, because the stored value counted
 * elapsed time while this counts the difference between two wall clocks.
 *
 * MySQL merges this derived table into the outer query, so the index and the
 * partition pruning on `checkoutdate` stay effective.
 */
const TRANSACTIES_FROM = `
  (
    SELECT
      citycode AS zipID
      , locationid AS FietsenstallingID
      , sectionid AS SectieID
      , checkindate AS Date_checkin
      , checkoutdate AS Date_checkout
      , TIMESTAMPDIFF(MINUTE, checkindate, checkoutdate) AS Stallingsduur
      , clienttypeid AS Clienttype
      , price AS Stallingskosten
      , biketypeid AS BikeTypeID
      , exploitantid AS exploitantID
      , checkintype AS Type_checkin
      , checkouttype AS Type_checkout
    FROM transacties_archief
  ) AS transacties_view
`;

export const createTransactiesExport = async ({
  gemeenteID,
  stallingsID,
  jaar,
}: TransactiesExportParams): Promise<CsvExportResult> => {
  assertValidYear(jaar);

  const { zipID, timeShiftInMinutes } = await getGemeenteExportContext(gemeenteID);
  const perStalling = !!stallingsID;

  const shifted = `DATE_ADD(Date_checkout, INTERVAL ${-timeShiftInMinutes} MINUTE)`;
  const shiftedDate = `DATE(${shifted})`;
  const weekFirstDay = `DATE_SUB(${shiftedDate}, INTERVAL WEEKDAY(${shiftedDate}) DAY)`;
  const startDate = `DATE_ADD('${jaar}-01-01 00:00:00', INTERVAL ${timeShiftInMinutes} MINUTE)`;
  const endDate = `DATE_ADD(${startDate}, INTERVAL 1 YEAR)`;

  const sql = `
    SELECT
      FietsenstallingID
      ${perStalling ? ", SectieID" : ""}
      , BikeTypeID
      , CAST(COUNT(*) AS CHAR) AS totalTransactions
      , CAST(SUM(Clienttype = 1) AS CHAR) AS totalAbonnementen_nee
      , CAST(SUM(Clienttype = 2) AS CHAR) AS totalAbonnementen_ja
      , CAST(SUM(Stallingskosten) AS CHAR) AS totalInkomsten
      , ${shiftedDate} AS checkout_Date
      , ANY_VALUE(DATE_FORMAT(${shiftedDate}, '%d-%m-%y')) AS checkout_Date_formatted
      , ANY_VALUE(DATE_FORMAT(${weekFirstDay}, '%d-%m-%Y')) AS week_first_day
      , ANY_VALUE(DATE_FORMAT(DATE_ADD(${weekFirstDay}, INTERVAL 6 DAY), '%d-%m-%Y')) AS week_last_day
      , ANY_VALUE(YEAR(${shifted})) AS checkout_Year
      , ANY_VALUE(QUARTER(${shifted})) AS checkout_Quarter
      , ANY_VALUE(MONTH(${shifted})) AS checkout_Month
      , ANY_VALUE(WEEK(${shifted}, 1)) AS checkout_Week
      , ANY_VALUE(DAYOFWEEK(${shifted})) AS checkout_Weekday
    FROM ${TRANSACTIES_FROM}
    WHERE 0 = 0
    AND Type_checkin != 'sync' AND Type_checkout != 'sync'
    AND zipID = ?
    ${perStalling ? "AND FietsenstallingID = ?" : ""}
    AND Date_checkout > ${startDate}
    AND Date_checkout <= ${endDate}
    AND Date_checkout IS NOT NULL
    GROUP BY
      ${shiftedDate}
      , FietsenstallingID
      ${perStalling ? ", SectieID" : ""}
      , BikeTypeID
    ORDER BY
      ${shiftedDate}
      , FietsenstallingID
      ${perStalling ? ", SectieID" : ""}
      , BikeTypeID
  `;

  const params: string[] = perStalling ? [zipID, stallingsID!] : [zipID];
  const data = await prisma.$queryRawUnsafe<TransactiesRow[]>(sql, ...params);

  const lookups = new CsvExportLookups();
  const rows: unknown[][] = [];

  for (const record of data) {
    const weekLabel = `${twoDigits(record.checkout_Week)} (${record.week_first_day ?? ""} t/m ${
      record.week_last_day ?? ""
    })`;

    const values: unknown[] = [await lookups.getStallingsNaam(record.FietsenstallingID)];
    if (perStalling) {
      values.push(await lookups.getSectieNaam(record.SectieID));
    }
    values.push(
      record.checkout_Date_formatted,
      record.checkout_Year,
      record.checkout_Quarter,
      dutchMonthName(record.checkout_Month),
      weekLabel,
      dutchWeekdayName(record.checkout_Weekday),
      await lookups.getBikeTypeName(record.BikeTypeID),
      record.totalTransactions,
      record.totalAbonnementen_nee,
      record.totalAbonnementen_ja,
      cfDecimal(record.totalInkomsten)
    );

    rows.push(values);
  }

  const headers = perStalling
    ? TRANSACTIES_HEADERS_PER_STALLING
    : TRANSACTIES_HEADERS_ALLE_STALLINGEN;

  return {
    filename: resolveCsvExportFilename("transacties", { jaar, stallingsID }),
    csv: assembleCfCsv(headers, rows, "append"),
  };
};

type RuweDataRow = {
  FietsenstallingID: string | null;
  SectieID: string | null;
  type_checkin: string | null;
  type_checkout: string | null;
  Stallingsduur: string | null;
  stallingskosten: string | null;
  Clienttype: number | null;
  BikeTypeID: number | null;
  checkin_Date_formatted: string | null;
  checkin_Time_formatted: string | null;
  checkout_Date_formatted: string | null;
  checkout_Time_formatted: string | null;
  checkout_Year: number | null;
  checkout_Quarter: number | null;
  checkout_Month: number | null;
  checkout_IsoWeek: number | null;
  checkout_Hour: number | null;
  checkout_Weekday: number | null;
  corrected_checkout_Weekday: number | null;
};

export const createRuweDataExport = async ({
  gemeenteID,
  stallingsID,
  jaar,
  maand,
}: RuweDataExportParams): Promise<CsvExportResult> => {
  assertValidYear(jaar);
  if (maand !== undefined) {
    assertValidMonth(maand);
  }

  const { zipID, timeShiftInMinutes } = await getGemeenteExportContext(gemeenteID);
  const perStalling = !!stallingsID;

  const shiftedIn = `DATE_ADD(Date_checkin, INTERVAL ${-timeShiftInMinutes} MINUTE)`;
  const shiftedOut = `DATE_ADD(Date_checkout, INTERVAL ${-timeShiftInMinutes} MINUTE)`;
  const startDate =
    maand === undefined
      ? `DATE_ADD('${jaar}-01-01 00:00:00', INTERVAL ${timeShiftInMinutes} MINUTE)`
      : `DATE_ADD('${jaar}-${String(maand).padStart(2, "0")}-01 00:00:00', INTERVAL ${timeShiftInMinutes} MINUTE)`;
  const endDate =
    maand === undefined
      ? `DATE_ADD(${startDate}, INTERVAL 1 YEAR)`
      : `DATE_ADD(${startDate}, INTERVAL 1 MONTH)`;

  const sql = `
    SELECT
      FietsenstallingID
      , SectieID
      , Type_checkin AS type_checkin
      , Type_checkout AS type_checkout
      , CAST(Stallingsduur AS CHAR) AS Stallingsduur
      , CAST(Stallingskosten AS CHAR) AS stallingskosten
      , Clienttype
      , BikeTypeID
      , DATE_FORMAT(DATE(${shiftedIn}), '%d-%m-%y') AS checkin_Date_formatted
      , DATE_FORMAT(Date_checkin, '%H:%i:%s') AS checkin_Time_formatted
      , DATE_FORMAT(DATE(${shiftedOut}), '%d-%m-%y') AS checkout_Date_formatted
      , DATE_FORMAT(Date_checkout, '%H:%i:%s') AS checkout_Time_formatted
      , YEAR(${shiftedOut}) AS checkout_Year
      , QUARTER(${shiftedOut}) AS checkout_Quarter
      , MONTH(${shiftedOut}) AS checkout_Month
      , WEEKOFYEAR(DATE(${shiftedOut})) AS checkout_IsoWeek
      , HOUR(Date_checkout) AS checkout_Hour
      , DAYOFWEEK(Date_checkout) AS checkout_Weekday
      , DAYOFWEEK(${shiftedOut}) AS corrected_checkout_Weekday
    FROM ${TRANSACTIES_FROM}
    WHERE 0 = 0
    AND zipID = ?
    ${perStalling ? "AND FietsenstallingID = ?" : ""}
    AND Date_checkout > ${startDate}
    AND Date_checkout <= ${endDate}
    AND Date_checkout IS NOT NULL
    ORDER BY
      Date_checkout
      , FietsenstallingID
      , SectieID
      , BikeTypeID
  `;

  const params: string[] = perStalling ? [zipID, stallingsID!] : [zipID];
  const data = await prisma.$queryRawUnsafe<RuweDataRow[]>(sql, ...params);

  const lookups = new CsvExportLookups();
  const rows: unknown[][] = [];

  // ColdFusion only reassigns "abonnement" for clienttype 1 and 2, so any other
  // clienttype repeats the value of the previous row. Kept for output parity.
  let abonnement = "";

  for (const record of data) {
    if (record.Clienttype === 1) {
      abonnement = "nee";
    } else if (record.Clienttype === 2) {
      abonnement = "ja";
    }

    rows.push([
      await lookups.getStallingsNaam(record.FietsenstallingID),
      await lookups.getSectieNaam(record.SectieID),
      record.Stallingsduur,
      record.checkin_Time_formatted,
      record.checkin_Date_formatted,
      record.checkout_Time_formatted,
      record.checkout_Date_formatted,
      record.checkout_Year,
      record.checkout_Quarter,
      record.checkout_Month,
      record.checkout_IsoWeek,
      dutchWeekdayName(record.checkout_Weekday),
      dutchWeekdayName(record.corrected_checkout_Weekday),
      record.checkout_Hour,
      cfDecimal(record.stallingskosten),
      await lookups.getBikeTypeName(record.BikeTypeID),
      abonnement,
      cfTransactionType(record.type_checkin),
      cfTransactionType(record.type_checkout),
    ]);
  }

  return {
    filename: resolveCsvExportFilename("ruwedata", { jaar, stallingsID, maand }),
    csv: assembleCfCsv(RUWEDATA_HEADERS, rows, "write"),
  };
};
