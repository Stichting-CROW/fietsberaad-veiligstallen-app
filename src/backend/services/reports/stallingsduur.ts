import { type ReportParams } from "~/components/beheer/reports/ReportsFilter";
import {
  getFunctionForPeriod,
  interpolateSQL
} from "~/backend/services/reports/ReportFunctions";
import { getAdjustedStartEndDates } from "~/components/beheer/reports/ReportsDateFunctions";
import moment from "moment";

const filter_locations_sql = (params: {
  bikeparkIDs: string[],
}) => {
  if (!params.bikeparkIDs || params.bikeparkIDs.length === 0) {
    return 'locationID IN ("")';
  }

  const bikeparkIDs_string = params.bikeparkIDs.length > 0 ? params.bikeparkIDs.map(bp => `'${bp}'`).join(',') : '""';
  return `locationID IN (${bikeparkIDs_string})`;
}

export const getSQL = (params: ReportParams, useCache = true): string | false => {
  const {
    reportType,
    reportGrouping,
    reportCategories,
    bikeparkIDs,
    startDT: startDate,
    endDT: endDate,
  } = params;
  if (["stallingsduur"].includes(reportType) === false) {
    throw new Error("Invalid report type");
    return false;
  }

  if (false === useCache) {
    throw new Error("Only cached data is supported for this report");
    return false;
  }

  const { timeIntervalInMinutes, adjustedStartDate, adjustedEndDate } = getAdjustedStartEndDates(startDate, endDate);

  const statementItems = [];
  switch (reportCategories) {
  }
  statementItems.push(`SELECT`);
  switch (reportCategories) {
    case "per_stalling":
      statementItems.push(`  locationID AS CATEGORY,`);
      break;
    case "per_weekday":
      statementItems.push(`  ${getFunctionForPeriod("per_weekday", timeIntervalInMinutes, 'checkoutdate', useCache)} AS CATEGORY,`);
      break;
    // case "per_section":
    //   statementItems.push(`  b.sectionID AS CATEGORY,`);
    //   break;
    case "per_type_klant":
      statementItems.push(`  clienttypeid AS CATEGORY,`);
      break;
    case "none":
    default:
      statementItems.push(`  "0" AS CATEGORY,`);
  }

  // statementItems.push(`  bucket as TIMEGROUP,`);
  statementItems.push(`  ${getFunctionForPeriod(reportGrouping, timeIntervalInMinutes, 'checkoutdate', useCache)} AS TIMEGROUP,`);
  statementItems.push(`SUM(count_transacties) AS value`);

  statementItems.push(`FROM stallingsduur_cache`)
  statementItems.push(`LEFT JOIN fietsenstallingen ON stallingsId = locationid`)
  // statementItems.push(`  LEFT JOIN contacts ON contacts.ID = fietsenstallingen.SiteID`)
  statementItems.push(`WHERE ${filter_locations_sql({ bikeparkIDs })}`)
  // statementItems.push(`-- ${bikeParkId ? `AND locationid IN (?)` : `AND sectionid LIKE ?`}`)
  // statementItems.push(`-- ${selectType === 'BIKETYPE' || selectType === 'CLIENTTYPE' ? `AND sectionid = ?` : ''}`)
  statementItems.push(`AND checkoutdate BETWEEN ? AND ?`)
  statementItems.push(`GROUP BY`);
  statementItems.push(`  CATEGORY,`);
  statementItems.push(`  TIMEGROUP;`); //  name,

  // ORDER BY ${reportUnit === 'reportUnit_stalling' ? 'locationid' : ''}
  // ${selectType === 'SECTIE' ? ', sectionid' : ''}
  // ${selectType === 'BIKETYPE' ? ', biketypeid' : ''}
  // ${selectType === 'CLIENTTYPE' ? ', clienttypeid' : ''}

  const sql = statementItems.join('\n')

  // Prepare parameters for the query
  const queryParams = [
    moment(startDate).format('YYYY-MM-DD 00:00:00'),
    moment(endDate).format('YYYY-MM-DD 23:59:59')
  ];

  const sqlfilledin = interpolateSQL(sql, queryParams);
  console.log('sqlfilledin', sqlfilledin);
  return sqlfilledin;
}