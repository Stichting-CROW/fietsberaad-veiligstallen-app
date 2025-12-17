import { type ReportParams, type ReportGrouping, type ReportType } from "~/components/beheer/reports/ReportsFilter";
import { getLabelMapForXAxis, getXAxisTitle, type XAxisLabelMap } from "~/backend/services/reports/ReportAxisFunctions";

import { prisma } from "~/server/db";
import fs from "fs";
import moment from "moment";

export interface ReportSeriesData {
  name: string;
  // ApexCharts supports multiple shapes; for category-mode we return y-values aligned to xaxis.categories
  data: number[];
}

export interface ReportData {
  title?: string;
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
  CATEGORY: string;
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

  // Use x-axis keys as the canonical ordering (this also makes "fillups" deterministic)
  const xKeys = Object.keys(keyToLabelMap);

  const groupedByCategory = results.reduce((
    acc: Record<string, { name: string; data: Record<string, number> }>, tx: SingleResult) => {
    const category = tx.CATEGORY.toString();
    const timegroup = tx.TIMEGROUP.toString();
    if (!acc[category]) {
      acc[category] = {
        name: category,
        data: {}
      };
      
      // Initialize all timegroups with zero (fillups)
      const categoryData = acc[category].data;
      xKeys.forEach(tg => {
        categoryData[tg] = 0;
      });
    }
    // Update the value for this specific timegroup
    acc[category].data[timegroup] = Number(tx.value);
    return acc;
  }, {});

  // Convert to series format
  series = Object.values(groupedByCategory).map((stalling: { name: string; data: Record<string, number> }) => {
    // Category mode: return y-values in the same order as xaxis.categories
    const dataPoints: number[] = xKeys.map((timegroup) => Number(stalling.data[timegroup] ?? 0));

    return {
      name: categoryNames ? categoryNames.find(c => c.id === stalling.name)?.name || stalling.name : stalling.name,
      data: dataPoints
    };
  });

  return series;
}

// export const getFunctionForPeriod = (reportGrouping: ReportGrouping, timeIntervalInMinutes: number, fieldname: string, useCache = true) => {
//   if (false === useCache) {
//     if (reportGrouping === "per_year") return `YEAR(DATE_ADD(${fieldname}, INTERVAL -${timeIntervalInMinutes} MINUTE))`;
//     if (reportGrouping === "per_quarter") return `CONCAT(YEAR(${fieldname}), '-', QUARTER(DATE_ADD(${fieldname}, INTERVAL -${timeIntervalInMinutes} MINUTE)))`;
//     if (reportGrouping === "per_month") return `CONCAT(YEAR(${fieldname}), '-', MONTH(DATE_ADD(${fieldname}, INTERVAL -${timeIntervalInMinutes} MINUTE)))`;
//     if (reportGrouping === "per_week") return `CONCAT(YEAR(${fieldname}), '-', WEEKOFYEAR(DATE_ADD(${fieldname}, INTERVAL -${timeIntervalInMinutes} MINUTE)))`;
//     if (reportGrouping === "per_weekday") return `WEEKDAY(DATE_ADD(${fieldname}, INTERVAL -${timeIntervalInMinutes} MINUTE))`;
//     if (reportGrouping === "per_day") return `CONCAT(YEAR(${fieldname}), '-', DAYOFYEAR(DATE_ADD(${fieldname}, INTERVAL -${timeIntervalInMinutes} MINUTE)) + 1)`;
//     if (reportGrouping === "per_hour") return `HOUR(${fieldname})`;
//     if (reportGrouping === "per_bucket") return `bucket`;
//   } else {
//     if (reportGrouping === "per_year") return `YEAR(${fieldname})`;
//     if (reportGrouping === "per_quarter") return `CONCAT(YEAR(${fieldname}), '-', QUARTER(${fieldname}))`;
//     if (reportGrouping === "per_month") return `CONCAT(YEAR(${fieldname}), '-', MONTH(${fieldname}))`;
//     if (reportGrouping === "per_week") return `CONCAT(YEAR(${fieldname}), '-', WEEKOFYEAR(${fieldname}))`;
//     if (reportGrouping === "per_weekday") return `WEEKDAY(${fieldname})`;
//     if (reportGrouping === "per_day") return `CONCAT(YEAR(${fieldname}), '-', DAYOFYEAR(${fieldname}) + 1)`;
//     if (reportGrouping === "per_hour") return `HOUR(${fieldname})`;
//     if (reportGrouping === "per_bucket") return `bucket`;
//   }
// }
export const getFunctionForPeriod = (
  reportGrouping: ReportGrouping,
  timeIntervalInMinutes: number,
  fieldname: string,
  useCache = true
) => {
  const shiftedField = `DATE_ADD(${fieldname}, INTERVAL -${timeIntervalInMinutes} MINUTE)`;
  const activeField = useCache === false ? shiftedField : fieldname;

  if (useCache === false) {
    if (reportGrouping === "per_hour_time") return `DATE_FORMAT(${activeField}, '%Y-%m-%d %H:00')`;
    if (reportGrouping === "per_quarter_hour") return `CONCAT(DATE_FORMAT(${activeField}, '%Y-%m-%d %H:'), LPAD(FLOOR(MINUTE(${activeField})/15)*15, 2, '0'))`;
    if (reportGrouping === "per_year") return `YEAR(${shiftedField})`;
    if (reportGrouping === "per_quarter") return `CONCAT(YEAR(${shiftedField}), '-', QUARTER(${shiftedField}))`;
    if (reportGrouping === "per_month") return `CONCAT(YEAR(${shiftedField}), '-', MONTH(${shiftedField}))`;
    if (reportGrouping === "per_week") return `DATE_FORMAT(${shiftedField}, '%x-%v')`;
    if (reportGrouping === "per_weekday") return `WEEKDAY(${shiftedField})`;
    if (reportGrouping === "per_day") return `CONCAT(YEAR(${shiftedField}), '-', DAYOFYEAR(${shiftedField}) + 1)`;
    if (reportGrouping === "per_hour") return `HOUR(${fieldname})`;
    if (reportGrouping === "per_bucket") return `bucket`;
  } else {
    if (reportGrouping === "per_hour_time") return `DATE_FORMAT(${activeField}, '%Y-%m-%d %H:00')`;
    if (reportGrouping === "per_quarter_hour") return `CONCAT(DATE_FORMAT(${activeField}, '%Y-%m-%d %H:'), LPAD(FLOOR(MINUTE(${activeField})/15)*15, 2, '0'))`;
    if (reportGrouping === "per_year") return `YEAR(${fieldname})`;
    if (reportGrouping === "per_quarter") return `CONCAT(YEAR(${fieldname}), '-', QUARTER(${fieldname}))`;
    if (reportGrouping === "per_month") return `CONCAT(YEAR(${fieldname}), '-', MONTH(${fieldname}))`;
    if (reportGrouping === "per_week") return `DATE_FORMAT(${fieldname}, '%x-%v')`;
    if (reportGrouping === "per_weekday") return `WEEKDAY(${fieldname})`;
    if (reportGrouping === "per_day") return `CONCAT(YEAR(${fieldname}), '-', DAYOFYEAR(${fieldname}) + 1)`;
    if (reportGrouping === "per_hour") return `HOUR(${fieldname})`;
    if (reportGrouping === "per_bucket") return `bucket`;
  }
};

export const getReportTitle = (reportType: ReportType) => {
  if (reportType === "transacties_voltooid") return "Transacties per periode";
  if (reportType === "inkomsten") return "Inkomsten per periode";
  if (reportType === "bezetting") return "Gemiddelde procentuele bezetting";
  if (reportType === "absolute_bezetting") return "Absolute bezetting";
  return "";
}

export const debugLog = (message: string, truncate = false) => {
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
  // Replace all ? placeholders with quoted parameters
  params.forEach((param) => {
    interpolatedSQL = interpolatedSQL.replace('?', `"${param || ""}"`);
  });
  return interpolatedSQL;
}

interface ReportCategory {
  id: string | number;
  name: string;
}

export const getCategoryNames = async (params: ReportParams): Promise<ReportCategory[] | false> => {

  // Special categories for absolute_bezetting: capacity and occupation for each selected stalling
  if (params.reportType === "absolute_bezetting") {
    if (params.bikeparkIDs.length === 0) {
      return false;
    }

    const idString = params.bikeparkIDs.map(bp => `'${bp}'`).join(',');
    const sql = `SELECT StallingsID, Title FROM fietsenstallingen WHERE StallingsID IN (${idString})`;
    const results = await prisma.$queryRawUnsafe<{ StallingsID: string, Title: string }[]>(sql);
    
    const categories: ReportCategory[] = [];
    for (const stalling of results) {
      categories.push(
        { id: `${stalling.StallingsID}_capacity`, name: `${stalling.Title} - Capaciteit` },
        { id: `${stalling.StallingsID}_occupation`, name: `${stalling.Title} - Bezetting` }
      );
    }
    
    return categories;
  }

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

    const keyToLabelMap = getLabelMapForXAxis(
      params.reportGrouping,
      params.startDT || new Date(),
      params.endDT || new Date()
    );
    if (!keyToLabelMap) {
      return false;
    }

    const series = await convertToTimegroupSeries(results, params, keyToLabelMap);

    return {
      // title: getReportTitle(params.reportType),
      options: {
        xaxis: {
          // Always use category mode so labels come from categories and don't repeat due to datetime tick generation
          type: 'category',
          // Use display labels in order; series are aligned to the same key order
          categories: Object.keys(keyToLabelMap).map((k) => keyToLabelMap[k] ?? k),
          title: {
            text: getXAxisTitle(params.reportGrouping),
            align: 'left'
          },
          // tickAmount: Object.keys(keyToLabelMap).length > 25 ? 25 : Object.keys(keyToLabelMap).length
        },
        yaxis: {
          title: {
            text: ''//getReportTitle(params.reportType)
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

