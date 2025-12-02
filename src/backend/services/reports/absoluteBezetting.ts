import { type ReportParams } from "~/components/beheer/reports/ReportsFilter";
import {
  getFunctionForPeriod,
  interpolateSQL
} from "~/backend/services/reports/ReportFunctions";
import { getAdjustedStartEndDates } from "~/components/beheer/reports/ReportsDateFunctions";

/**
 * Build SQL for the "absolute_bezetting" report.
 *
 * The query returns two logical series via the CATEGORY column:
 * - CATEGORY = 'capacity'  → maximum capacity in the period
 * - CATEGORY = 'occupation' → average occupation in the period
 *
 * The generic report pipeline (`getData`) will turn these into two
 * separate series using `getCategoryNames`.
 */
export const getSQL = (params: ReportParams, useCache = false): string | false => {
  const {
    reportType,
    reportGrouping,
    bikeparkIDs,
    startDT: startDate,
    endDT: endDate,
    fillups,
    source
  } = params;

  if (reportType !== "absolute_bezetting") {
    throw new Error("Invalid report type for absolute_bezetting SQL");
  }

  const { timeIntervalInMinutes, adjustedStartDate, adjustedEndDate } = getAdjustedStartEndDates(startDate, endDate);
  if (adjustedStartDate === undefined || adjustedEndDate === undefined || timeIntervalInMinutes === undefined) {
    throw new Error("Start, end date or time interval is undefined");
  }

  // Guard: API/UI should already enforce exactly 1 stalling, but make sure
  if (!bikeparkIDs || bikeparkIDs.length !== 1) {
    // No valid stalling selection – return SQL that yields no rows
    return `SELECT 'capacity' AS CATEGORY, '0' AS TIMEGROUP, 0 AS value WHERE 1=0`;
  }

  const bikeparkID = bikeparkIDs[0]!;

  const timegroupExpr = getFunctionForPeriod(reportGrouping, timeIntervalInMinutes, "b.timestamp", useCache);
  if (!timegroupExpr) {
    throw new Error("Function for period is undefined");
  }

  const statementItems: string[] = [];

  // Capacity series
  statementItems.push("SELECT");
  statementItems.push(`  'capacity' AS CATEGORY,`);
  statementItems.push(`  ${timegroupExpr} AS TIMEGROUP,`);
  statementItems.push(`  MAX(b.capacity) AS value`);
  statementItems.push(`FROM bezettingsdata b`);
  statementItems.push(`WHERE`);
  statementItems.push(`  b.bikeparkID = '${bikeparkID}'`);
  statementItems.push(`  AND b.timestamp BETWEEN ? AND ?`);
  if (fillups) {
    statementItems.push(`  AND b.fillup = 0`);
  }
  if (source) {
    statementItems.push(`  AND b.source = '${source}'`);
  }
  statementItems.push(`  AND b.interval = 15`);
  statementItems.push(`GROUP BY CATEGORY, TIMEGROUP`);

  // Union with occupation series
  statementItems.push(`UNION ALL`);
  statementItems.push(`SELECT`);
  statementItems.push(`  'occupation' AS CATEGORY,`);
  statementItems.push(`  ${timegroupExpr} AS TIMEGROUP,`);
  statementItems.push(`  AVG(b.occupation) AS value`);
  statementItems.push(`FROM bezettingsdata b`);
  statementItems.push(`WHERE`);
  statementItems.push(`  b.bikeparkID = '${bikeparkID}'`);
  statementItems.push(`  AND b.timestamp BETWEEN ? AND ?`);
  if (fillups) {
    statementItems.push(`  AND b.fillup = 0`);
  }
  if (source) {
    statementItems.push(`  AND b.source = '${source}'`);
  }
  statementItems.push(`  AND b.interval = 15`);
  statementItems.push(`GROUP BY CATEGORY, TIMEGROUP`);

  statementItems.push(`ORDER BY TIMEGROUP ASC`);

  const sql = statementItems.join("\n");

  // Prepare parameters for the query
  const queryParams: string[] = [
    adjustedStartDate.format("YYYY-MM-DD HH:mm:ss"),
    adjustedEndDate.format("YYYY-MM-DD HH:mm:ss"),
    adjustedStartDate.format("YYYY-MM-DD HH:mm:ss"),
    adjustedEndDate.format("YYYY-MM-DD HH:mm:ss")
  ];

  const sqlfilledin = interpolateSQL(sql, queryParams);
  return sqlfilledin;
};


