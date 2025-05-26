import { ReportParams, ReportGrouping, ReportType } from "~/components/beheer/reports/ReportsFilter";
import { getLabelMapForXAxis, getXAxisTitle, XAxisLabelMap } from "~/backend/services/reports/ReportAxisFunctions";

import { prisma } from "~/server/db";
import fs from "fs";
import moment from "moment";

export interface ReportSeriesData {
  name: string;
  data: [number, number][];
}

export interface ReportData {
  title: string;
  options: {
    xaxis: {
      type?: string;
      categories?: string[];
      title?: {
        text?: string;
        align?: string;
      };
      labels?: {
        formatter: (value: string) => string;
      };
      tickAmount?: number;
    };
    yaxis: {
      title: {
        text: string;
      };
    };
  };
  series: ReportSeriesData[];
}

interface SingleResult {
  name: string;
  TIMEGROUP: string;
  value: number;
}

export const convertToTimegroupSeries = async (
  results: SingleResult[],
  params: ReportParams,
  keyToLabelMap: XAxisLabelMap
): Promise<ReportSeriesData[]> => {
  let series: ReportSeriesData[] = [];

  const categoryNames = await getCategoryNames(params);

  // Get all unique timegroups
  const allTimegroups = [...new Set(results.map(tx => tx.TIMEGROUP.toString()))];

  const groupedByCategory = results.reduce((acc: any, tx: any) => {
    const category = tx.CATEGORY.toString();
    const timegroup = tx.TIMEGROUP.toString();
    if (!acc[category]) {
      acc[category] = {
        name: category,
        data: {}
      };
      // Initialize all timegroups with zero
      allTimegroups.forEach(tg => {
        acc[category].data[tg] = 0;
      });
    }
    // Update the value for this specific timegroup
    acc[category].data[timegroup] = Number(tx.value);
    return acc;
  }, {});

  // Convert to series format
  series = Object.values(groupedByCategory).map((stalling: any) => {
    return {
      name: categoryNames ? categoryNames.find(c => c.id === stalling.name)?.name || stalling.name : stalling.name,
      data: Object.entries(stalling.data).map(([timegroup, value]) => {
        // Convert timegroup to timestamp based on the grouping type
        let timestamp;
        if (params.reportGrouping === 'per_hour') {
          timestamp = moment().hour(parseInt(timegroup)).valueOf();
        } else if (params.reportGrouping === 'per_weekday') {
          timestamp = moment().day(parseInt(timegroup)).valueOf();
        } else if (params.reportGrouping === 'per_day') {
          timestamp = moment(timegroup, 'YYYY-DDD').valueOf();
        } else if (params.reportGrouping === 'per_month') {
          timestamp = moment(timegroup, 'YYYY-M').valueOf();
        } else if (params.reportGrouping === 'per_week') {
          timestamp = moment(timegroup, 'YYYY-W').valueOf();
        } else if (params.reportGrouping === 'per_quarter') {
          timestamp = moment(timegroup, 'YYYY-Q').valueOf();
        } else if (params.reportGrouping === 'per_year') {
          timestamp = moment(timegroup, 'YYYY').valueOf();
        } else {
          timestamp = moment(timegroup).valueOf();
        }
        return [timestamp, Number(value)];
      }),
      groups: Object.keys(stalling.data)
    }
  });

  return series;
}

export const getFunctionForPeriod = (reportGrouping: ReportGrouping, timeIntervalInMinutes: number, fieldname: string, useCache: boolean = true) => {
  if (false === useCache) {
    if (reportGrouping === "per_year") return `YEAR(DATE_ADD(${fieldname}, INTERVAL -${timeIntervalInMinutes} MINUTE))`;
    if (reportGrouping === "per_quarter") return `CONCAT(YEAR(${fieldname}), '-', QUARTER(DATE_ADD(${fieldname}, INTERVAL -${timeIntervalInMinutes} MINUTE)))`;
    if (reportGrouping === "per_month") return `CONCAT(YEAR(${fieldname}), '-', MONTH(DATE_ADD(${fieldname}, INTERVAL -${timeIntervalInMinutes} MINUTE)))`;
    if (reportGrouping === "per_week") return `CONCAT(YEAR(${fieldname}), '-', WEEKOFYEAR(DATE_ADD(${fieldname}, INTERVAL -${timeIntervalInMinutes} MINUTE)))`;
    if (reportGrouping === "per_weekday") return `WEEKDAY(DATE_ADD(${fieldname}, INTERVAL -${timeIntervalInMinutes} MINUTE))`;
    if (reportGrouping === "per_day") return `CONCAT(YEAR(${fieldname}), '-', DAYOFYEAR(DATE_ADD(${fieldname}, INTERVAL -${timeIntervalInMinutes} MINUTE)) + 1)`;
    if (reportGrouping === "per_hour") return `HOUR(${fieldname})`;
    if (reportGrouping === "per_bucket") return `bucket`;
  } else {
    if (reportGrouping === "per_year") return `YEAR(${fieldname})`;
    if (reportGrouping === "per_quarter") return `CONCAT(YEAR(${fieldname}), '-', QUARTER(${fieldname}))`;
    if (reportGrouping === "per_month") return `CONCAT(YEAR(${fieldname}), '-', MONTH(${fieldname}))`;
    if (reportGrouping === "per_week") return `CONCAT(YEAR(${fieldname}), '-', WEEKOFYEAR(${fieldname}))`;
    if (reportGrouping === "per_weekday") return `WEEKDAY(${fieldname})`;
    if (reportGrouping === "per_day") return `CONCAT(YEAR(${fieldname}), '-', DAYOFYEAR(${fieldname}) + 1)`;
    if (reportGrouping === "per_hour") return `HOUR(${fieldname})`;
    if (reportGrouping === "per_bucket") return `bucket`;
  }
}

export const getReportTitle = (reportType: ReportType) => {
  if (reportType === "transacties_voltooid") return "Transacties per periode";
  if (reportType === "inkomsten") return "Inkomsten per periode";
  if (reportType === "bezetting") return "Gemiddelde procentuele bezetting";
  return "";
}

export const debugLog = (message: string, truncate: boolean = false) => {
  const line = `${new Date().toISOString()} ${message}`;
  console.log(message);
  if (truncate) {
    fs.writeFileSync('debug.log', line + '\n');
  } else {
    fs.appendFileSync('debug.log', line + '\n');
  }
}

export const interpolateSQL = (sql: string, params: string[]): string => {
  console.log('params', params);
  let interpolatedSQL = sql;
  if (params.length > 0) {
    interpolatedSQL = interpolatedSQL.replace('?', `"${params[0]}"`);
  }
  if (params.length > 1) {
    interpolatedSQL = interpolatedSQL.replace('?', `"${params[1]}"`);
  }
  if (params.length > 2) {
    interpolatedSQL = interpolatedSQL.replace('?', `${params[2]}`);
  }
  if (params.length > 3) {
    interpolatedSQL = interpolatedSQL.replace('?', `${params[3]}`);
  }
  return interpolatedSQL;
}

interface ReportCategory {
  id: string | number;
  name: string;
}

export const getCategoryNames = async (params: ReportParams): Promise<ReportCategory[] | false> => {

  const idString = params.bikeparkIDs.length > 0 ? params.bikeparkIDs.map(bp => `'${bp}'`).join(',') : '""';

  switch (params.reportCategories) {
    case "none":
      return [{ id: "0", name: "Totaal" }];
    case "per_stalling": {
      const sql = `SELECT StallingsID, Title FROM fietsenstallingen WHERE StallingsID IN (${idString})`;

      const results = await prisma.$queryRawUnsafe<{ StallingsID: string, Title: string }[]>(sql)
      return results.map(r => ({ id: r.StallingsID, name: r.Title }));
    }
    case "per_weekday": {
      return [
        { id: "0", name: "Maandag" },
        { id: "1", name: "Dinsdag" },
        { id: "2", name: "Woensdag" },
        { id: "3", name: "Donderdag" },
        { id: "4", name: "Vrijdag" },
        { id: "5", name: "Zaterdag" },
        { id: "6", name: "Zondag" }
      ];
    }
    case "per_section": {
      const sql =
        `SELECT s.externalid, f.Title as stallingtitel, s.titel as sectietitel ` +
        `FROM fietsenstallingen f LEFT OUTER JOIN fietsenstalling_sectie s ON (f.id=s.fietsenstallingsId) ` +
        `WHERE NOT ISNULL(s.externalid) AND f.StallingsID in (${idString})`

      const results = await prisma.$queryRawUnsafe<{ externalid: string, stallingtitel: string, sectietitel: string }[]>(sql)
      return results.map(r => {
        if (r.sectietitel.toLowerCase() === r.stallingtitel.toLowerCase()) {
          return ({ id: r.externalid, name: r.stallingtitel })
        } else {
          return ({ id: r.externalid, name: r.stallingtitel + " - " + r.sectietitel })
        }
      });
    }
    case "per_type_klant": {
      return [{ id: "1", name: "Dagstaller" }, { id: "2", name: "Abonnement" }];
    }
    default:
      return false;
  }
}

export const getData = async (sql: string, params: ReportParams): Promise<ReportData | false> => {
  try {
    const results = await prisma.$queryRawUnsafe<SingleResult[]>(sql);

    let keyToLabelMap = getLabelMapForXAxis(
      params.reportGrouping,
      params.startDT || new Date(),
      params.endDT || new Date()
    );
    if (!keyToLabelMap) {
      return false;
    }
    let series = await convertToTimegroupSeries(results, params, keyToLabelMap);

    return {
      title: getReportTitle(params.reportType),
      options: {
        xaxis: {
          type: 'string',
          categories: Object.values(keyToLabelMap),
          title: {
            text: getXAxisTitle(params.reportGrouping),
            align: 'left'
          },
          tickAmount: Object.keys(keyToLabelMap).length > 25 ? 25 : Object.keys(keyToLabelMap).length
        },
        yaxis: {
          title: {
            text: getReportTitle(params.reportType)
          }
        }
      },
      series: series
    };
  } catch (error) {
    console.error(error);
    return false;
  }
};

