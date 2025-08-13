import { type ReportParams } from "~/components/beheer/reports/ReportsFilter";
import {
  getFunctionForPeriod,
  interpolateSQL
} from "~/backend/services/reports/ReportFunctions";
import { getAdjustedStartEndDates } from "~/components/beheer/reports/ReportsDateFunctions";

import moment from 'moment';
import { type BikeparkWithDataSource } from "~/components/beheer/reports/BikeparkDataSourceSelect";

const filter_bikeparks_sql = (params: {
  bikeparkIDs: string[],
  reportType: string,
  bikeparkDataSources: BikeparkWithDataSource[]
}) => {
  if (!params.bikeparkIDs || params.bikeparkIDs.length === 0) {
    return '0=1';
  }

  if (params.reportType === 'bezetting') {
    const getSourceForBikepark = (bikeparkID: string): string => {
      if (!params.bikeparkDataSources) return 'FMS';
      const bikepark = params.bikeparkDataSources.find(x => x.StallingsID === bikeparkID);
      return bikepark?.source || 'FMS';
    }

    const sql_string = params.bikeparkIDs.map(id => {
      return `(bikeparkID = '${id}' AND source = '${getSourceForBikepark(id)}')`;
    }).join(' OR ');

    return `(${sql_string})`;
  }
  else {
    const bikeparkIDs_string = params.bikeparkIDs.length > 0 ? params.bikeparkIDs.map(bp => `'${bp}'`).join(',') : '""';
    return `b.bikeparkID IN (${bikeparkIDs_string})`;
  }
}

export const getSQL = (params: ReportParams, useCache = true): string | false => {
  const {
    reportType,
    reportGrouping,
    reportCategories,
    bikeparkIDs,
    bikeparkDataSources,
    startDT: startDate,
    endDT: endDate
  } = params;

  if (["bezetting"].includes(reportType) === false) {
    throw new Error("Invalid report type");
    return false;
  }

  // Don't use cache for bezetting report
  // if (reportType === "bezetting") {
  //   useCache = false;
  // }

  const { timeIntervalInMinutes, adjustedStartDate, adjustedEndDate } = getAdjustedStartEndDates(startDate, endDate);
  if (adjustedStartDate === undefined || adjustedEndDate === undefined) {
    throw new Error("Start or end date is undefined");
    return false;
  }

  const statementItems = [];
  statementItems.push(`SELECT`);
  switch (reportCategories) {
    case "per_stalling":
      statementItems.push(`  b.bikeparkID AS CATEGORY,`);
      break;
    case "per_weekday":
      statementItems.push(`  ${getFunctionForPeriod("per_weekday", timeIntervalInMinutes, 'b.timestamp', useCache)} AS CATEGORY,`);
      break;
    case "per_section":
      statementItems.push(`  b.sectionID AS CATEGORY,`);
      break;
    // case "per_type_klant":
    //   statementItems.push(`  b.clienttypeID AS CATEGORY,`);
    //   break;
    case "none":
    default:
      statementItems.push(`  "0" AS CATEGORY,`);
  }
  statementItems.push(`  ${getFunctionForPeriod(reportGrouping, timeIntervalInMinutes, 'b.timestamp', useCache)} AS TIMEGROUP,`);
  // statementItems.push(`  c.zipID AS authorityId,`);
  // statementItems.push(`  f.Title AS name,`);
  if (false === useCache) {
    if (reportType === "bezetting") {
      // statementItems.push(`SUM(b.checkins) AS totalCheckins,`);
      // statementItems.push(`SUM(b.checkouts) AS totalCheckouts,`);
      // statementItems.push(`SUM(b.capacity) as capacity,`);
      // statementItems.push(`SUM(b.occupation) as occupation,`);
      statementItems.push(`ROUND(SUM(b.occupation)/SUM(b.capacity)*100, 0) as value,`);
      // statementItems.push(`SUM(occupation) abs_occupation,`);
      statementItems.push(`MIN(timestamp) as timestamp`);
    }
  }
  // Selects from cache table
  else {
    if (reportType === "bezetting") {
      // statementItems.push(`SUM(b.totalCheckins) AS totalCheckins,`);
      // statementItems.push(`SUM(b.totalCheckouts) AS totalCheckouts,`);
      // statementItems.push(`SUM(b.totalCapacity) as capacity,`);
      // statementItems.push(`SUM(b.totalOccupation) as occupation`);
      statementItems.push(`ROUND(SUM(b.totalOccupation)/SUM(b.totalCapacity)*100, 0) as value,`);
      statementItems.push(`MIN(timestamp) as timestamp`);
    }
  }

  statementItems.push(`FROM ${false === useCache ? 'bezettingsdata b' : 'bezettingsdata_day_hour_cache b'}`)
  // statementItems.push(`LEFT JOIN fietsenstallingen f ON f.stallingsId = b.bikeparkID`)
  // statementItems.push(`INNER JOIN contacts c ON c.ID = f.siteID`)
  statementItems.push(`WHERE`)

  if (bikeparkIDs.length > 0) {
    statementItems.push(
      filter_bikeparks_sql({
        bikeparkIDs: bikeparkIDs,
        reportType: reportType,
        bikeparkDataSources: bikeparkDataSources
      })
    );
  }
  else {
    statementItems.push(` 1=0`)
  }

  statementItems.push(`AND b.timestamp BETWEEN ? AND ?`)
  if (params.fillups) {
    statementItems.push(`AND b.fillup = 0`)
  }
  if (params.source) {
    statementItems.push(`AND b.source = '${params.source}'`)
  }
  statementItems.push(`AND b.interval = 15`)

  statementItems.push(`GROUP BY`);
  statementItems.push(`  CATEGORY, TIMEGROUP`); // f.Title, 

  statementItems.push(`ORDER BY timestamp ASC`);
  // statementItems.push(`ORDER BY CATEGORY, TIMEGROUP`);

  // ORDER BY ${reportUnit === 'reportUnit_stalling' ? 'locationid' : ''}
  // ${selectType === 'SECTIE' ? ', sectionid' : ''}
  // ${selectType === 'BIKETYPE' ? ', biketypeid' : ''}
  // ${selectType === 'CLIENTTYPE' ? ', clienttypeid' : ''}

  const sql = statementItems.join('\n');

  // Prepare parameters for the query
  const queryParams = [
    false === useCache ? adjustedStartDate.format('YYYY-MM-DD HH:mm:ss') : moment(startDate).format('YYYY-MM-DD 00:00:00'),
    false === useCache ? adjustedEndDate.format('YYYY-MM-DD HH:mm:ss') : moment(endDate).format('YYYY-MM-DD 23:59:59')
  ];
  if (params.fillups) {
    queryParams.push(params.fillups ? '0' : '1');
  }
  if (params.source) {
    queryParams.push(params.source);
  }

  const sqlfilledin = interpolateSQL(sql, queryParams);
  console.log('sqlfilledin', sqlfilledin);
  return sqlfilledin; // , queryParams TODO: make queryParams work: 
}
