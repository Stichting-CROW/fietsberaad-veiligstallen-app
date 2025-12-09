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

  // Guard: require at least one stalling
  if (!bikeparkIDs || bikeparkIDs.length === 0) {
    // No valid stalling selection – return SQL that yields no rows
    return `SELECT 'capacity' AS CATEGORY, '0' AS TIMEGROUP, 0 AS value WHERE 1=0`;
  }

  const timegroupExpr = getFunctionForPeriod(reportGrouping, timeIntervalInMinutes, "b.timestamp", useCache);
  if (!timegroupExpr) {
    throw new Error("Function for period is undefined");
  }

  // Build IN clause for bikeparkIDs
  const bikeparkIDList = bikeparkIDs.map(id => `'${id}'`).join(',');

  const statementItems: string[] = [];

  // For each bikepark, create capacity and occupation series
  // Category format: "bikeparkID_capacity" and "bikeparkID_occupation"
  for (let i = 0; i < bikeparkIDs.length; i++) {
    const bikeparkID = bikeparkIDs[i]!;
    
    if (i > 0) {
      statementItems.push(`UNION ALL`);
    }

    // Capacity series for this bikepark
    statementItems.push("SELECT");
    statementItems.push(`  CONCAT('${bikeparkID}', '_capacity') AS CATEGORY,`);
    statementItems.push(`  ${timegroupExpr} AS TIMEGROUP,`);
    statementItems.push(`  CAST(MAX(b.capacity) AS UNSIGNED) AS value`);
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

    statementItems.push(`UNION ALL`);

    // Occupation series for this bikepark
    statementItems.push(`SELECT`);
    statementItems.push(`  CONCAT('${bikeparkID}', '_occupation') AS CATEGORY,`);
    statementItems.push(`  ${timegroupExpr} AS TIMEGROUP,`);
    statementItems.push(`  ROUND(AVG(b.occupation), 0) AS value`);
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
  }

  statementItems.push(`ORDER BY TIMEGROUP ASC`);

  const sql = statementItems.join("\n");

  // Prepare parameters for the query
  // Each bikepark has 2 queries (capacity + occupation), each needing 2 date parameters
  const queryParams: string[] = [];
  for (let i = 0; i < bikeparkIDs.length; i++) {
    queryParams.push(adjustedStartDate.format("YYYY-MM-DD HH:mm:ss"));
    queryParams.push(adjustedEndDate.format("YYYY-MM-DD HH:mm:ss"));
    queryParams.push(adjustedStartDate.format("YYYY-MM-DD HH:mm:ss"));
    queryParams.push(adjustedEndDate.format("YYYY-MM-DD HH:mm:ss"));
  }

  const sqlfilledin = interpolateSQL(sql, queryParams);
  console.log('sqlfilledin', sqlfilledin);

  return sqlfilledin;
};


