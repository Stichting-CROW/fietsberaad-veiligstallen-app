import { type ReportType } from "~/components/beheer/reports/ReportsFilter";
import {
  getFunctionForPeriod,
  interpolateSQL
} from "~/backend/services/reports/ReportFunctions";
import { getAdjustedStartEndDates } from "~/components/beheer/reports/ReportsDateFunctions";
import { getGemeenteExportContext } from "~/backend/services/reports/csvExportLookups";
import { prisma } from "~/server/db";
import moment from 'moment';

export type AvailableDataDetailedResult = {
  locationID: string;
  yearmonth: string;
  total: number;
}

export type AvailableDataPerStallingResult = {
  locationID: string;
  total: number;
}

export const getSQLDetailed = (reportType: ReportType, bikeparkIDs: string[], startDate: Date | undefined, endDate: Date | undefined, useCache = true): string | false => {

  const { timeIntervalInMinutes, adjustedStartDate, adjustedEndDate } = getAdjustedStartEndDates(startDate, endDate, undefined);

  if (adjustedStartDate === undefined || adjustedEndDate === undefined) {
    console.error(">>> getSQLDetailed ERROR Start or end date is undefined");
    return false;
  }

  if (timeIntervalInMinutes === undefined) {
    console.error(">>> getSQLDetailed ERROR Time interval is undefined");
    return false;
  }

  const idString = bikeparkIDs.length > 0 ? bikeparkIDs.map(bp => `'${bp}'`).join(',') : '""';

  switch (reportType) {
    case "inkomsten":
    case "stallingsduur":
    case "transacties_voltooid": {
      const functionForPeriod = getFunctionForPeriod("per_month", timeIntervalInMinutes, 'checkoutdate', useCache);
      if (functionForPeriod === undefined) {
        console.error(">>> getSQLDetailed ERROR Function for period is undefined");
        return false;
      }

      const sql =
        `SELECT ` +
        `locationID,` +
        `${functionForPeriod} AS yearmonth,` +
        `COUNT(*) AS total ` +
        `FROM ${false === useCache ? 'transacties_archief' : 'transacties_archief_day_cache'} ` +
        `WHERE locationID IN (${idString}) ` +
        `AND checkoutdate BETWEEN ? AND ? ` +
        `GROUP BY locationID, yearmonth ` +
        `ORDER BY locationID, yearmonth `

      const queryParams = [
        adjustedStartDate.format('YYYY-MM-DD 00:00:00'),
        adjustedEndDate.format('YYYY-MM-DD 23:59:59')
      ];

      const sqlfilledin = interpolateSQL(sql, queryParams);
      return sqlfilledin;
    }
    case "bezetting": {
      const functionForPeriod = getFunctionForPeriod("per_month", timeIntervalInMinutes, 'timestamp', useCache);
      if (functionForPeriod === undefined) {
        console.error(">>> getSQLDetailed ERROR Function for period is undefined");
        return false;
      }

      const sql =
        `SELECT ` +
        `bikeparkID as locationID,` +
        `${functionForPeriod} AS yearmonth,` +
        `COUNT(*) AS total ` +
        `FROM ${false === useCache ? 'bezettingsdata b' : 'bezettingsdata_day_hour_cache'} ` +
        `WHERE bikeparkID IN (${idString})` +
        `AND timestamp BETWEEN ? AND ? ` +
        `GROUP BY bikeparkID, yearmonth ` +
        `ORDER BY bikeparkID, yearmonth `

      const queryParams = [
        adjustedStartDate.format('YYYY-MM-DD 00:00:00'),
        adjustedEndDate.format('YYYY-MM-DD 23:59:59')
      ];

      const sqlfilledin = interpolateSQL(sql, queryParams);
      return sqlfilledin;
    }
    case "abonnementen":
    case "abonnementen_lopend":
    case "volmeldingen":
    case "gelijktijdig_vol":
    case "downloads":
    default: {
      return false;
    }
  }
}

export const getSQLPerBikepark = (reportType: ReportType, bikeparkIDs: string[], startDT: Date | undefined, endDT: Date | undefined, useCache = true): string | false => {

  const { adjustedStartDate, adjustedEndDate } = getAdjustedStartEndDates(startDT, endDT, undefined);

  const idString = bikeparkIDs.length > 0 ? bikeparkIDs.map(bp => `'${bp}'`).join(',') : '""';

  switch (reportType) {
    // one of "transacties_voltooid" | "inkomsten" | "abonnementen" | "abonnementen_lopend" | "bezetting" | "stallingsduur" | "volmeldingen" | "gelijktijdig_vol" | "downloads"
    case "inkomsten":
    case "stallingsduur":
    case "transacties_voltooid": {
      const sql =
        `SELECT ` +
        `locationID,` +
        `COUNT(*) AS total ` +
        `FROM ${false === useCache ? 'transacties_archief' : 'transacties_archief_day_cache'} ` +
        `WHERE locationID IN (${idString}) ` +
        `AND checkoutdate BETWEEN ? AND ? ` +
        `GROUP BY locationID ` +
        `ORDER BY locationID `

      const queryParams = [
        moment(adjustedStartDate).format('YYYY-MM-DD 00:00:00'),
        moment(adjustedEndDate).format('YYYY-MM-DD 23:59:59')
      ];

      const sqlfilledin = interpolateSQL(sql, queryParams);
      return sqlfilledin;
    }
    case "bezetting":
    case "absolute_bezetting": {
      const sql =
        `SELECT ` +
        `bikeparkID as locationID,` +
        `COUNT(*) AS total ` +
        `FROM ${false === useCache ? 'bezettingsdata b' : 'bezettingsdata_day_hour_cache b'} ` +
        `WHERE bikeparkID IN (${idString})` +
        `AND timestamp BETWEEN ? AND ?` +
        `GROUP BY bikeparkID ` +
        `ORDER BY bikeparkID `

      const queryParams = [
        moment(adjustedStartDate).format('YYYY-MM-DD 00:00:00'),
        moment(adjustedEndDate).format('YYYY-MM-DD 23:59:59')
      ];

      const sqlfilledin = interpolateSQL(sql, queryParams);
      console.log('getSQLPerBikepark :: sqlfilledin', sqlfilledin);
      return sqlfilledin;
    }
    case "abonnementen":
    case "abonnementen_lopend":
    case "volmeldingen":
    case "gelijktijdig_vol":
    case "downloads":
    default: {
      return false;
    }
  }
}

/**
 * Months that still exist in the live `transacties_view` table for a gemeente,
 * using the same DayBeginsAt shift and filters as the CSV exports. The export
 * page uses this so year/month buttons only appear when a download will produce
 * rows (archived years that only exist in transacties_archief are hidden).
 */
export const getLiveTransactiesExportAvailability = async (
  gemeenteID: string,
  bikeparkIDs: string[],
  options?: { excludeSync?: boolean }
): Promise<AvailableDataDetailedResult[]> => {
  if (bikeparkIDs.length === 0) {
    return [];
  }

  const { zipID, timeShiftInMinutes } = await getGemeenteExportContext(gemeenteID);
  if (!zipID) {
    return [];
  }

  const shiftedDate = `DATE(DATE_ADD(Date_checkout, INTERVAL ${-timeShiftInMinutes} MINUTE))`;
  const placeholders = bikeparkIDs.map(() => "?").join(",");
  const syncFilter = options?.excludeSync
    ? "AND Type_checkin != 'sync' AND Type_checkout != 'sync'"
    : "";

  const sql = `
    SELECT
      FietsenstallingID AS locationID,
      DATE_FORMAT(${shiftedDate}, '%Y-%m') AS yearmonth,
      COUNT(*) AS total
    FROM transacties_view
    WHERE zipID = ?
    AND FietsenstallingID IN (${placeholders})
    AND Date_checkout IS NOT NULL
    ${syncFilter}
    GROUP BY locationID, yearmonth
    ORDER BY locationID, yearmonth
  `;

  return prisma.$queryRawUnsafe<AvailableDataDetailedResult[]>(
    sql,
    zipID,
    ...bikeparkIDs
  );
};
