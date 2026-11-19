import moment from "moment";
import { prisma } from "~/server/db";
import { type ReportParams, type ReportGrouping } from "~/components/beheer/reports/ReportsFilter";
import { getLabelMapForXAxis, getXAxisTitle } from "~/backend/services/reports/ReportAxisFunctions";
import { type ReportData, type ReportSeriesData } from "~/backend/services/reports/ReportFunctions";

/** Contact the report is scoped to: a municipality's own subscriptions, or an operator's. */
export type SubscriptionReportScope = { siteId?: string; exploitantId?: string };

const SUPPORTED_GROUPINGS: ReportGrouping[] = ["per_year", "per_quarter", "per_month"];

const timegroupSql = (grouping: ReportGrouping, field: "a.ingangsdatum" | "a.afloopdatum"): string => {
  if (grouping === "per_year") return `CAST(YEAR(${field}) AS CHAR)`;
  if (grouping === "per_quarter") return `CONCAT(YEAR(${field}), '-', QUARTER(${field}))`;
  return `CONCAT(YEAR(${field}), '-', MONTH(${field}))`;
};

const scopeFilter = (scope: SubscriptionReportScope): { sql: string; values: string[] } => {
  const parts: string[] = [];
  const values: string[] = [];
  if (scope.siteId) {
    parts.push("a.siteID = ?");
    values.push(scope.siteId);
  }
  if (scope.exploitantId) {
    parts.push("a.exploitantID = ?");
    values.push(scope.exploitantId);
  }
  if (parts.length === 0) parts.push("1 = 0");
  return { sql: parts.join(" AND "), values };
};

const normalizeParams = (params: ReportParams) => {
  const grouping = SUPPORTED_GROUPINGS.includes(params.reportGrouping) ? params.reportGrouping : "per_month";
  // startDT/endDT are the reports API dates. After JSON they are ISO strings; moment uses local time.
  let start = moment(params.startDT ?? moment().subtract(12, "months").toDate()).startOf("day");
  let end = moment(params.endDT ?? new Date()).endOf("day");
  if (!start.isValid() || !end.isValid() || start.isAfter(end)) {
    start = moment().subtract(12, "months").startOf("day");
    end = moment().endOf("day");
  }
  const grouped = params.reportCategories === "per_abonnementsvorm";
  return { grouping, start, end, grouped };
};

/** Period bucket aligned to x-axis keys; clipped to the date picker range. */
const bucketBoundsFromKey = (
  key: string,
  grouping: ReportGrouping,
  rangeStart: moment.Moment,
  rangeEnd: moment.Moment,
): { bucketStart: Date; bucketEnd: Date } => {
  let periodStart: moment.Moment;
  let periodEnd: moment.Moment;
  if (grouping === "per_year") {
    periodStart = moment(key, "YYYY").startOf("year");
    periodEnd = moment(key, "YYYY").endOf("year");
  } else if (grouping === "per_quarter") {
    const [yearStr, quarterStr] = key.split("-");
    const year = Number(yearStr);
    const quarter = Number(quarterStr);
    periodStart = moment().year(year).quarter(quarter).startOf("quarter");
    periodEnd = moment().year(year).quarter(quarter).endOf("quarter");
  } else {
    const [yearStr, monthStr] = key.split("-");
    const year = Number(yearStr);
    const month = Number(monthStr);
    periodStart = moment({ year, month: month - 1 }).startOf("month");
    periodEnd = moment({ year, month: month - 1 }).endOf("month");
  }
  const bucketStart = moment.max(periodStart, rangeStart).startOf("day");
  const bucketEnd = moment.min(periodEnd, rangeEnd).endOf("day");
  return { bucketStart: bucketStart.toDate(), bucketEnd: bucketEnd.toDate() };
};

const buildReport = (
  rows: Array<{ name: string; TIMEGROUP: string; value: number }>,
  labelMap: Record<string, string>,
  grouping: ReportGrouping,
  yTitle: string,
): ReportData => {
  const keys = Object.keys(labelMap);
  const byName = new Map<string, Record<string, number>>();
  for (const row of rows) {
    const data = byName.get(row.name) ?? {};
    data[row.TIMEGROUP] = (data[row.TIMEGROUP] ?? 0) + Number(row.value);
    byName.set(row.name, data);
  }
  const series: ReportSeriesData[] = [...byName.entries()].map(([name, data]) => ({
    name,
    data: keys.map((k) => data[k] ?? 0),
  }));
  return {
    options: {
      xaxis: {
        type: "category",
        categories: keys.map((k) => labelMap[k] ?? k),
        title: { text: getXAxisTitle(grouping), align: "left" },
      },
      yaxis: { title: { text: yTitle } },
    },
    series,
  };
};

/** Port of `reports.cfc getAbonnementen`: new paid subscriptions by start date, ended ones by end date. */
export const getAbonnementswijzigingen = async (
  params: ReportParams,
  scope: SubscriptionReportScope,
): Promise<ReportData> => {
  const { grouping, start, end, grouped } = normalizeParams(params);
  const startDate = start.toDate();
  const endDate = end.toDate();
  const nameSql = grouped ? "COALESCE(v.naam, 'Onbekende abonnementsvorm')" : "''";
  const filter = scopeFilter(scope);
  const rows = await prisma.$queryRawUnsafe<Array<{ kind: string; label: string; TIMEGROUP: string; value: bigint }>>(
    `SELECT 'nieuw' AS kind, ${nameSql} AS label, ${timegroupSql(grouping, "a.ingangsdatum")} AS TIMEGROUP, COUNT(*) AS value
    FROM abonnementen a LEFT JOIN abonnementsvormen v ON v.ID = a.subscriptiontypeID
    WHERE ${filter.sql} AND a.isBetaald = 1 AND a.type = 'abonnement'
      AND a.ingangsdatum IS NOT NULL AND a.ingangsdatum >= ? AND a.ingangsdatum <= ?
    GROUP BY label, TIMEGROUP
    UNION ALL
    SELECT 'verlopen' AS kind, ${nameSql} AS label, ${timegroupSql(grouping, "a.afloopdatum")} AS TIMEGROUP, COUNT(*) AS value
    FROM abonnementen a LEFT JOIN abonnementsvormen v ON v.ID = a.subscriptiontypeID
    WHERE ${filter.sql} AND a.isBetaald = 1 AND a.type = 'abonnement'
      AND a.afloopdatum IS NOT NULL AND a.afloopdatum >= ? AND a.afloopdatum <= ?
    GROUP BY label, TIMEGROUP`,
    ...filter.values,
    startDate,
    endDate,
    ...filter.values,
    startDate,
    endDate,
  );

  const labelMap = getLabelMapForXAxis(grouping, startDate, endDate);
  const named = rows.map((r) => {
    const kindLabel = r.kind === "nieuw" ? "Nieuwe abonnementen" : "Verlopen abonnementen";
    return {
      name: grouped ? `${r.label} - ${r.kind === "nieuw" ? "nieuw" : "verlopen"}` : kindLabel,
      TIMEGROUP: r.TIMEGROUP,
      value: Number(r.value),
    };
  });
  if (!grouped) {
    for (const name of ["Nieuwe abonnementen", "Verlopen abonnementen"]) {
      if (!named.some((r) => r.name === name)) named.push({ name, TIMEGROUP: "", value: 0 });
    }
  }
  return buildReport(named, labelMap, grouping, "Aantal abonnementen");
};

/**
 * Lopende abonnementen: per x-axis period, count paid subscriptions that overlap that period
 * (active at any time during the bucket), within the date picker range.
 */
export const getLopendeAbonnementen = async (
  params: ReportParams,
  scope: SubscriptionReportScope,
): Promise<ReportData> => {
  const { grouping, start, end, grouped } = normalizeParams(params);
  const rangeStart = start.clone();
  const rangeEnd = end.clone();
  const labelMap = getLabelMapForXAxis(grouping, rangeStart.toDate(), rangeEnd.toDate()) ?? {};
  let keys = Object.keys(labelMap);
  if (keys.length === 0) {
    for (let d = rangeStart.clone().startOf(grouping === "per_year" ? "year" : grouping === "per_quarter" ? "quarter" : "month");
      d.isSameOrBefore(rangeEnd, grouping === "per_year" ? "year" : grouping === "per_quarter" ? "quarter" : "month");
      d.add(1, grouping === "per_year" ? "year" : grouping === "per_quarter" ? "quarter" : "month")) {
      keys.push(
        grouping === "per_year" ? d.format("YYYY") : grouping === "per_quarter" ? d.format("YYYY-Q") : d.format("YYYY-M"),
      );
    }
    keys.forEach((k) => {
      if (!labelMap[k]) labelMap[k] = k;
    });
  }
  const buckets = keys.map((key) => ({
    key,
    ...bucketBoundsFromKey(key, grouping, rangeStart, rangeEnd),
  }));
  if (buckets.length === 0) {
    return buildReport([], labelMap, grouping, "Aantal lopende abonnementen");
  }

  const rangeEndDate = rangeEnd.toDate();
  const rangeStartDate = rangeStart.toDate();
  const filter = scopeFilter(scope);
  const nameSql = grouped ? "COALESCE(v.naam, 'Onbekende abonnementsvorm')" : "'Lopende abonnementen'";
  const sumValues: Date[] = [];
  const sums = buckets
    .map((b, i) => {
      sumValues.push(b.bucketEnd, b.bucketStart);
      return `SUM(IF(a.ingangsdatum <= ? AND (a.afloopdatum IS NULL OR a.afloopdatum >= ?), 1, 0)) AS p${i}`;
    })
    .join(", ");

  const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
    `SELECT ${nameSql} AS label, ${sums}
    FROM abonnementen a LEFT JOIN abonnementsvormen v ON v.ID = a.subscriptiontypeID
    WHERE ${filter.sql}
      AND a.type = 'abonnement'
      AND a.ingangsdatum IS NOT NULL
      AND a.isBetaald = 1
      AND a.ingangsdatum <= ?
      AND (a.afloopdatum IS NULL OR a.afloopdatum >= ?)
    GROUP BY label`,
    ...sumValues,
    ...filter.values,
    rangeEndDate,
    rangeStartDate,
  );

  const flat = rows.flatMap((row) =>
    buckets.map((b, i) => ({ name: String(row.label), TIMEGROUP: b.key, value: Number(row[`p${i}`] ?? 0) })),
  );
  return buildReport(flat, labelMap, grouping, "Aantal lopende abonnementen");
};
