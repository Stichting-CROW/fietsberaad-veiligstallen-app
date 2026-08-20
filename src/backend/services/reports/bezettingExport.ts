import { prisma } from "~/server/db";
import {
  assembleCfCsv,
  dutchPercentageOneDecimal,
  dutchWeekdayName,
} from "~/backend/services/reports/csvExportFormat";
import {
  CsvExportLookups,
  getGemeenteExportContext,
} from "~/backend/services/reports/csvExportLookups";
import { resolveCsvExportFilename } from "~/backend/services/reports/csvExportFilename";
import { type CsvExportResult } from "~/backend/services/reports/transactionsExport";

/**
 * Port of reports_csv.cfc bezetting(): the "Procentuele bezetting" export.
 * Reads the 15 minute interval records of bezettingsdata for one stalling and
 * one year. Note that the year, quarter and month columns use the gemeente day
 * offset while the date, week, weekday, hour and minute columns come from the
 * unshifted timestamp, exactly as ColdFusion does.
 */

export type BezettingExportParams = {
  gemeenteID: string;
  stallingsID: string;
  jaar: number;
};

const HEADERS = [
  "Stalling",
  "Sectie",
  "Jaar",
  "Kwartaal",
  "Maand",
  "Week",
  "Weekdag",
  "Gecorrigeerde weekdag",
  "Datum",
  "Uur",
  "Minuut",
  "Capaciteit",
  "Aantal bezette plaatsen",
  "Aantal vrije plaatsen",
  "Bezetting %",
  "Check-ins laatste kwartier",
  "Check-outs laatste kwartier",
  "open j/n",
];

type BezettingRow = {
  totalCheckins: string | null;
  totalCheckouts: string | null;
  sectionID: string | null;
  capacity: number | null;
  occupation: number | null;
  isOpen: string | null;
  timestamp_Year: number | null;
  timestamp_Quarter: number | null;
  timestamp_Month: number | null;
  timestamp_IsoWeek: number | null;
  timestamp_Weekday: number | null;
  corrected_Weekday: number | null;
  timestamp_Date_formatted: string | null;
  timestamp_Hour: number | null;
  timestamp_Minute: number | null;
};

const stallingExists = async (stallingsID: string): Promise<boolean> => {
  const rows = await prisma.$queryRaw<{ StallingsID: string | null }[]>`
    SELECT StallingsID FROM fietsenstallingen WHERE StallingsID = ${stallingsID} LIMIT 1
  `;
  return rows.length > 0;
};

export const createBezettingExport = async ({
  gemeenteID,
  stallingsID,
  jaar,
}: BezettingExportParams): Promise<CsvExportResult> => {
  if (!Number.isInteger(jaar) || jaar < 2000 || jaar > 2100) {
    throw new Error(`Ongeldig jaar: ${jaar}`);
  }
  if (!stallingsID) {
    throw new Error("stallingsID is verplicht voor de bezettingsexport");
  }

  const { timeShiftInMinutes } = await getGemeenteExportContext(gemeenteID);
  const filename = resolveCsvExportFilename("bezetting", { jaar, stallingsID });

  // CF aborts without writing a file when the stalling cannot be found.
  if (!(await stallingExists(stallingsID))) {
    return { filename, csv: "" };
  }

  const shifted = `DATE_ADD(\`timestamp\`, INTERVAL ${-timeShiftInMinutes} MINUTE)`;
  const startDate = `${jaar}-01-01 00:00:00`;
  const endDate = `${jaar + 1}-01-01 00:00:00`;

  // ANY_VALUE keeps the "arbitrary row of the group" semantics that the
  // ColdFusion query relies on while staying valid under ONLY_FULL_GROUP_BY.
  const sql = `
    SELECT
      totalCheckins
      , totalCheckouts
      , sectionID
      , capacity
      , occupation
      , isOpen
      , YEAR(DATE_ADD(raw_ts, INTERVAL ${-timeShiftInMinutes} MINUTE)) AS timestamp_Year
      , QUARTER(DATE_ADD(raw_ts, INTERVAL ${-timeShiftInMinutes} MINUTE)) AS timestamp_Quarter
      , MONTH(DATE_ADD(raw_ts, INTERVAL ${-timeShiftInMinutes} MINUTE)) AS timestamp_Month
      , WEEKOFYEAR(raw_ts) AS timestamp_IsoWeek
      , DAYOFWEEK(raw_ts) AS timestamp_Weekday
      , DAYOFWEEK(DATE_ADD(raw_ts, INTERVAL ${-timeShiftInMinutes} MINUTE)) AS corrected_Weekday
      , DATE_FORMAT(raw_ts, '%d-%m-%y') AS timestamp_Date_formatted
      , HOUR(raw_ts) AS timestamp_Hour
      , MINUTE(raw_ts) AS timestamp_Minute
    FROM (
      SELECT
        CAST(SUM(checkins) AS CHAR) AS totalCheckins
        , CAST(SUM(checkouts) AS CHAR) AS totalCheckouts
        , sectionID
        , ANY_VALUE(capacity) AS capacity
        , ANY_VALUE(occupation) AS occupation
        , CAST(ANY_VALUE(\`open\`) = 1 AS CHAR) AS isOpen
        , MIN(\`timestamp\`) AS raw_ts
      FROM bezettingsdata
      WHERE 0 = 0
      AND \`bikeparkID\` = ?
      AND \`interval\` = 15
      AND \`timestamp\` > ?
      AND \`timestamp\` <= ?
      GROUP BY
        sectionID
        , YEAR(${shifted})
        , MONTH(${shifted})
        , DAY(${shifted})
        , HOUR(\`timestamp\`)
        , MINUTE(\`timestamp\`)
    ) AS grouped
    ORDER BY raw_ts
  `;

  const data = await prisma.$queryRawUnsafe<BezettingRow[]>(
    sql,
    stallingsID,
    startDate,
    endDate
  );

  const lookups = new CsvExportLookups();
  const stallingsNaam = await lookups.getStallingsNaam(stallingsID);
  const rows: unknown[][] = [];

  for (const record of data) {
    const free =
      record.capacity === null || record.occupation === null
        ? ""
        : record.capacity - record.occupation;
    const isOpen = record.isOpen === "1";

    rows.push([
      stallingsNaam,
      await lookups.getSectieNaam(record.sectionID),
      record.timestamp_Year,
      record.timestamp_Quarter,
      record.timestamp_Month,
      record.timestamp_IsoWeek,
      dutchWeekdayName(record.timestamp_Weekday),
      dutchWeekdayName(record.corrected_Weekday),
      record.timestamp_Date_formatted,
      record.timestamp_Hour,
      record.timestamp_Minute,
      record.capacity,
      record.occupation,
      free,
      dutchPercentageOneDecimal(record.occupation, record.capacity),
      record.totalCheckins,
      record.totalCheckouts,
      isOpen ? "j" : "n",
    ]);
  }

  return {
    filename,
    csv: assembleCfCsv(HEADERS, rows, "append"),
  };
};
