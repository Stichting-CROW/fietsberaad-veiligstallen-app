import { prisma } from "~/server/db";
import { assembleCfCsv } from "~/backend/services/reports/csvExportFormat";
import {
  CsvExportLookups,
  getDatabaseNow,
  getGemeenteExportContext,
} from "~/backend/services/reports/csvExportLookups";
import { resolveCsvExportFilename } from "~/backend/services/reports/csvExportFilename";
import { type CsvExportResult } from "~/backend/services/reports/transactionsExport";

/**
 * Port of reports_csv.cfc createCsvStallingsduur() combined with
 * reports.cfc getReportStallingsduur(). Reads from transacties_archief and
 * reports one row per duration bucket per klanttype, for every completed
 * quarter of the requested year.
 */

export type StallingsduurExportParams = {
  gemeenteID: string;
  jaar: number;
};

const HEADERS = [
  "Stalling",
  "StallingsID",
  "SectieID",
  "Jaar",
  "Kwartaal",
  "Stallingsduur",
  "Aantal",
  "Klanttype",
];

/** Bucket 1..10 as produced by the CASE expression below. */
const BUCKET_LABELS = [
  "<30m",
  "30-60m",
  "1-2h",
  "2-4h",
  "4-8h",
  "8-24h",
  "1-2d",
  "2-7d",
  "7-14d",
  ">14d",
];

/** getReportStallingsduur() labels, indexed by clienttypeid 1 and 2. */
const KLANTTYPE_LABELS = ["Dagstaller", "Abonnement"];

const BUCKET_CASE = `
  CASE WHEN timestampdiff(MINUTE, checkindate, checkoutdate) > 14*24*60 THEN 10
  WHEN timestampdiff(MINUTE, checkindate, checkoutdate) <= 14*24*60 AND timestampdiff(MINUTE, checkindate, checkoutdate) > 7*24*60 THEN 9
  WHEN timestampdiff(MINUTE, checkindate, checkoutdate) <= 7*24*60 AND timestampdiff(MINUTE, checkindate, checkoutdate) > 2*24*60 THEN 8
  WHEN timestampdiff(MINUTE, checkindate, checkoutdate) <= 2*24*60 AND timestampdiff(MINUTE, checkindate, checkoutdate) > 1*24*60 THEN 7
  WHEN timestampdiff(MINUTE, checkindate, checkoutdate) <= 24*60 AND timestampdiff(MINUTE, checkindate, checkoutdate) > 8*60 THEN 6
  WHEN timestampdiff(MINUTE, checkindate, checkoutdate) <= 8*60 AND timestampdiff(MINUTE, checkindate, checkoutdate) > 4*60 THEN 5
  WHEN timestampdiff(MINUTE, checkindate, checkoutdate) <= 4*60 AND timestampdiff(MINUTE, checkindate, checkoutdate) > 2*60 THEN 4
  WHEN timestampdiff(MINUTE, checkindate, checkoutdate) <= 2*60 AND timestampdiff(MINUTE, checkindate, checkoutdate) > 1*60 THEN 3
  WHEN timestampdiff(MINUTE, checkindate, checkoutdate) <= 60 AND timestampdiff(MINUTE, checkindate, checkoutdate) > 30 THEN 2
  WHEN timestampdiff(MINUTE, checkindate, checkoutdate) <= 30 THEN 1
  ELSE 'Unknown' END
`;

type LocationRow = {
  bikeparkID: string | null;
  sectionID: string | null;
};

type BucketRow = {
  bucket: string | null;
  clienttypeid: number | null;
  n: bigint | number | null;
};

const quarterStart = (jaar: number, quarter: number): string => {
  const month = String((quarter - 1) * 3 + 1).padStart(2, "0");
  return `${jaar}-${month}-01 00:00:00`;
};

/** CF getLastDayOfQuarter() returns the first day of the following quarter. */
const quarterEnd = (jaar: number, quarter: number): string =>
  quarter === 4 ? quarterStart(jaar + 1, 1) : quarterStart(jaar, quarter + 1);

export const createStallingsduurExport = async ({
  gemeenteID,
  jaar,
}: StallingsduurExportParams): Promise<CsvExportResult> => {
  if (!Number.isInteger(jaar) || jaar < 2000 || jaar > 2100) {
    throw new Error(`Ongeldig jaar: ${jaar}`);
  }

  const { zipID } = await getGemeenteExportContext(gemeenteID);

  const locations = await prisma.$queryRaw<LocationRow[]>`
    SELECT DISTINCT locationid as bikeparkID, sectionID
    FROM transacties_archief
    WHERE Year(checkoutdate) = ${jaar}
    AND citycode = ${zipID}
  `;

  const databaseNow = await getDatabaseNow();
  const lookups = new CsvExportLookups();
  const rows: unknown[][] = [];

  for (let quarter = 1; quarter <= 4; quarter++) {
    const startDate = quarterStart(jaar, quarter);
    const endDate = quarterEnd(jaar, quarter);

    // CF only reports quarters that have completely passed.
    if (endDate >= databaseNow) continue;

    // getReportStallingsduur() filters on citycode and ignores the bikeparkIDs
    // and sectionID it is given, so every location of this gemeente receives
    // the same gemeente-wide numbers. Querying once per quarter reproduces that
    // output without repeating the query for each location.
    const bucketRows = await prisma.$queryRawUnsafe<BucketRow[]>(
      `
        SELECT bucket
          , clienttypeid
          , COUNT(*) as n
        FROM
          (SELECT
            ${BUCKET_CASE} as bucket,
            clienttypeid
          FROM transacties_archief
          WHERE
            citycode = ?
          AND
            checkoutdate BETWEEN ? AND ?
          AND checkintype = 'user'
          AND checkouttype = 'user'
          ) AS x
        GROUP BY bucket, clienttypeid
        ORDER BY bucket, clienttypeid
      `,
      zipID,
      startDate,
      endDate
    );

    const counts = new Map<string, number>();
    for (const row of bucketRows) {
      counts.set(`${row.bucket ?? ""}|${row.clienttypeid ?? ""}`, Number(row.n ?? 0));
    }

    for (const location of locations) {
      const stallingsNaam = await lookups.getStallingsNaam(location.bikeparkID);

      for (let klanttypeIndex = 0; klanttypeIndex < KLANTTYPE_LABELS.length; klanttypeIndex++) {
        const clienttypeid = klanttypeIndex + 1;

        for (let bucket = 1; bucket <= BUCKET_LABELS.length; bucket++) {
          rows.push([
            stallingsNaam,
            location.bikeparkID,
            location.sectionID,
            jaar,
            quarter,
            BUCKET_LABELS[bucket - 1],
            counts.get(`${bucket}|${clienttypeid}`) ?? 0,
            KLANTTYPE_LABELS[klanttypeIndex],
          ]);
        }
      }
    }
  }

  return {
    filename: resolveCsvExportFilename("stallingsduur", { jaar }),
    csv: assembleCfCsv(HEADERS, rows, "append"),
  };
};
