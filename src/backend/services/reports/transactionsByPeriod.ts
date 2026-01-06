import { type ReportParams } from "~/components/beheer/reports/ReportsFilter";
import {
  getFunctionForPeriod,
  interpolateSQL
} from "~/backend/services/reports/ReportFunctions";
import { getAdjustedStartEndDates } from "~/components/beheer/reports/ReportsDateFunctions";
import moment from 'moment';

const filter_locations_sql = (params: {
  bikeparkIDs: string[],
}) => {
  console.log('filter_locations_sql', params.bikeparkIDs)
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
    dayBeginsAt: dayBeginsAt
  } = params;

  // TMP: disable cache for now
  useCache = false;

  if (["transacties_voltooid", "inkomsten"].includes(reportType) === false) {
    throw new Error("Invalid report type");
    return false;
  }

  const { timeIntervalInMinutes, adjustedStartDate, adjustedEndDate } = getAdjustedStartEndDates(startDate, endDate, dayBeginsAt);
  console.log('adjustedStartDate', adjustedStartDate);
  console.log('adjustedEndDate', adjustedEndDate);

  if (adjustedStartDate === undefined || adjustedEndDate === undefined) {
    throw new Error("Start or end date is undefined");
    return false;
  }

  const statementItems = [];
  switch (reportCategories) {
  }
  statementItems.push(`SELECT`);
  statementItems.push(`  MIN(checkoutdate) AS minCheckoutdate,`);
  switch (reportCategories) {
    case "per_stalling":
      statementItems.push(`  locationID AS CATEGORY,`);
      break;
    case "per_weekday":
      const functionForPeriod = getFunctionForPeriod("per_weekday", timeIntervalInMinutes, 'checkoutdate', useCache);
      if (functionForPeriod === undefined) {
        console.error(">>> getSQL ERROR Function for period is undefined");
        return false;
      }
      statementItems.push(`  ${functionForPeriod} AS CATEGORY,`);
      break;
    // case "per_section":
    //   statementItems.push(`  b.sectionID AS CATEGORY,`);
    //   break;
    // case "per_type_klant":
    //   statementItems.push(`  b.clienttypeID AS CATEGORY,`);
    //   break;
    case "none":
    default:
      statementItems.push(`  "0" AS CATEGORY,`);
  }

  const functionForPeriod = getFunctionForPeriod(reportGrouping, timeIntervalInMinutes, 'checkoutdate', useCache);
  if (functionForPeriod === undefined) {
    console.error(">>> getSQL ERROR Function for period is undefined");
    return false;
  }

  // statementItems.push(`  Title AS name,`);
  statementItems.push(`  ${functionForPeriod} AS TIMEGROUP,`);
  if (false === useCache) {
    if (reportType === "transacties_voltooid") {
      statementItems.push(`COUNT(*) AS value`);
    } else if (reportType === "inkomsten") {
      statementItems.push(`SUM(price) AS value`);
    }
  }
  // Selects from cache table
  else {
    if (reportType === "transacties_voltooid") {
      statementItems.push(`SUM(count_transacties) AS value,`);
      statementItems.push(`MIN(checkoutdate) as checkoutdate`);
    } else if (reportType === "inkomsten") {
      statementItems.push(`SUM(sum_inkomsten) AS value`);
    }
  }

  statementItems.push(`FROM ${false === useCache ? 'transacties_archief' : 'transacties_archief_day_cache'}`)
  statementItems.push(`LEFT JOIN fietsenstallingen ON stallingsId = locationid`)
  // statementItems.push(`  LEFT JOIN contacts ON contacts.ID = fietsenstallingen.SiteID`)
  statementItems.push(`WHERE ${filter_locations_sql({ bikeparkIDs })}`)
  // statementItems.push(`-- ${bikeParkId ? `AND locationid IN (?)` : `AND sectionid LIKE ?`}`)
  // statementItems.push(`-- ${selectType === 'BIKETYPE' || selectType === 'CLIENTTYPE' ? `AND sectionid = ?` : ''}`)
  statementItems.push(`AND checkoutdate BETWEEN ? AND ?`)
  statementItems.push(`GROUP BY`);
  statementItems.push(`  CATEGORY,TIMEGROUP`); //  name,

  statementItems.push(`ORDER BY minCheckoutdate ASC`);

  // ORDER BY ${reportUnit === 'reportUnit_stalling' ? 'locationid' : ''}
  // ${selectType === 'SECTIE' ? ', sectionid' : ''}
  // ${selectType === 'BIKETYPE' ? ', biketypeid' : ''}
  // ${selectType === 'CLIENTTYPE' ? ', clienttypeid' : ''}

  const sql = statementItems.join('\n')

  // Prepare parameters for the query
  const queryParams = [
    false === useCache ? adjustedStartDate.format('YYYY-MM-DD HH:mm:ss') : moment(startDate).format('YYYY-MM-DD 00:00:00'),
    false === useCache ? adjustedEndDate.format('YYYY-MM-DD HH:mm:ss') : moment(endDate).format('YYYY-MM-DD 23:59:59')
  ];

  const sqlfilledin = interpolateSQL(sql, queryParams);
  console.log('sqlfilledin', sqlfilledin);

  return sqlfilledin;
}