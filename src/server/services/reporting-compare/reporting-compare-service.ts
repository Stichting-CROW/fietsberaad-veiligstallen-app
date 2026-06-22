/**
 * Reporting comparison service: 1-on-1 comparison of the three rapportages between
 * the old ColdFusion-produced data (production tables) and the new Next.js-produced
 * data (new_* shadow tables).
 *
 * Report types (mirroring the project plan "Achtergrondprocessen → Rapportage"):
 * - transacties (dagelijks): per stalling × day summary (count / closed / kosten / duur)
 * - ruwedata   (dagelijks): per stalling × day × checkin/checkout-type counts
 * - bezetting  (wekelijks): per stalling × sectie × ISO-week interval aggregates
 *
 * There is NO shared row key between `transacties` and `new_transacties` (both have
 * independent autoincrement IDs), so comparison is aggregate-based by a natural key.
 */
import { prisma } from "~/server/db";
import { resolveExistingTableNames } from "~/server/utils/mysql-schema-tables";

export type ReportCompareType = "transacties" | "ruwedata" | "bezetting";

export type MetricMap = Record<string, number>;

export type CompareRowStatus = "identical" | "diff" | "old_only" | "new_only";

export type CompareRow = {
  key: string;
  label: string;
  old: MetricMap | null;
  new: MetricMap | null;
  status: CompareRowStatus;
  /** metric names that differ between old and new (only when status === "diff") */
  diffFields: string[];
};

export type CompareSummary = {
  total: number;
  identical: number;
  diff: number;
  old_only: number;
  new_only: number;
};

export type CompareResult = {
  reportType: ReportCompareType;
  scopeLabel: string;
  dateStart: string;
  dateEnd: string;
  allData: boolean;
  source?: string;
  oldTable: string;
  newTable: string;
  metrics: string[];
  rows: CompareRow[];
  summary: CompareSummary;
  warnings: string[];
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Per-metric absolute tolerance. Money sums get a small float tolerance; counts are exact. */
const METRIC_TOLERANCE: Record<string, number> = {
  kosten: 0.005,
  sumOcc: 0,
};

function num(v: unknown): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === "number") return v;
  if (typeof v === "bigint") return Number(v);
  if (typeof v === "string") return Number(v) || 0;
  // Prisma Decimal or other objects with toString()
  const n = Number((v as { toString(): string }).toString());
  return Number.isFinite(n) ? n : 0;
}

function sqlInList(values: string[]): string {
  return values.map((v) => `'${String(v).replace(/'/g, "''")}'`).join(",");
}

type RawEntry = { key: string; label: string; metrics: MetricMap };

type ReportDef = {
  /** production (ColdFusion) table */
  oldTable: string;
  /** shadow (Next.js) table */
  newTable: string;
  metrics: string[];
  /** Column used to scope by stalling: "internal" = transacties.FietsenstallingID, "stallingsId" = bezettingsdata.bikeparkID */
  scopeColumn: "internal" | "stallingsId";
  buildSql: (table: string, whereExtra: string) => string;
  mapRow: (row: Record<string, unknown>, labels: Record<string, string>) => RawEntry;
};

function getReportDef(reportType: ReportCompareType, source: string): ReportDef {
  switch (reportType) {
    case "transacties":
      return {
        oldTable: "transacties",
        newTable: "new_transacties",
        metrics: ["count", "closed", "kosten", "duur"],
        scopeColumn: "internal",
        buildSql: (table, whereExtra) => `
          SELECT FietsenstallingID AS k,
                 DATE(Date_checkin) AS d,
                 COUNT(*) AS cnt,
                 SUM(CASE WHEN Date_checkout IS NOT NULL THEN 1 ELSE 0 END) AS closed,
                 COALESCE(SUM(Stallingskosten), 0) AS kosten,
                 COALESCE(SUM(Stallingsduur), 0) AS duur
          FROM \`${table}\`
          WHERE Date_checkin >= ':start 00:00:00' AND Date_checkin < ':end 00:00:00' ${whereExtra}
          GROUP BY FietsenstallingID, DATE(Date_checkin)`,
        mapRow: (row, labels) => {
          const stalling = String(row.k ?? "");
          const day = String(row.d ?? "").slice(0, 10);
          return {
            key: `${stalling}|${day}`,
            label: `${labels[stalling] ?? stalling} — ${day}`,
            metrics: {
              count: num(row.cnt),
              closed: num(row.closed),
              kosten: Math.round(num(row.kosten) * 100) / 100,
              duur: num(row.duur),
            },
          };
        },
      };
    case "ruwedata":
      return {
        oldTable: "transacties",
        newTable: "new_transacties",
        metrics: ["count"],
        scopeColumn: "internal",
        buildSql: (table, whereExtra) => `
          SELECT FietsenstallingID AS k,
                 DATE(Date_checkin) AS d,
                 COALESCE(Type_checkin, '') AS tin,
                 COALESCE(Type_checkout, '') AS tout,
                 COUNT(*) AS cnt
          FROM \`${table}\`
          WHERE Date_checkin >= ':start 00:00:00' AND Date_checkin < ':end 00:00:00' ${whereExtra}
          GROUP BY FietsenstallingID, DATE(Date_checkin), COALESCE(Type_checkin, ''), COALESCE(Type_checkout, '')`,
        mapRow: (row, labels) => {
          const stalling = String(row.k ?? "");
          const day = String(row.d ?? "").slice(0, 10);
          const tin = String(row.tin ?? "");
          const tout = String(row.tout ?? "");
          return {
            key: `${stalling}|${day}|${tin}|${tout}`,
            label: `${labels[stalling] ?? stalling} — ${day} — in:${tin || "∅"}/uit:${tout || "∅"}`,
            metrics: { count: num(row.cnt) },
          };
        },
      };
    case "bezetting":
      return {
        oldTable: "bezettingsdata",
        newTable: "new_bezettingsdata",
        metrics: ["intervals", "sumOcc", "maxOcc", "checkins", "checkouts"],
        scopeColumn: "stallingsId",
        buildSql: (table, whereExtra) => `
          SELECT bikeparkID AS k,
                 COALESCE(sectionID, '') AS sec,
                 YEARWEEK(timestamp, 3) AS wk,
                 COUNT(*) AS intervals,
                 COALESCE(SUM(occupation), 0) AS sumOcc,
                 COALESCE(MAX(occupation), 0) AS maxOcc,
                 COALESCE(SUM(checkins), 0) AS ci,
                 COALESCE(SUM(checkouts), 0) AS co
          FROM \`${table}\`
          WHERE source = '${source.replace(/'/g, "''")}'
                AND timestamp >= ':start 00:00:00' AND timestamp < ':end 00:00:00' ${whereExtra}
          GROUP BY bikeparkID, COALESCE(sectionID, ''), YEARWEEK(timestamp, 3)`,
        mapRow: (row, labels) => {
          const park = String(row.k ?? "");
          const sec = String(row.sec ?? "");
          const wk = String(row.wk ?? "");
          return {
            key: `${park}|${sec}|${wk}`,
            label: `${labels[park] ?? park} — sectie ${sec || "∅"} — week ${wk}`,
            metrics: {
              intervals: num(row.intervals),
              sumOcc: num(row.sumOcc),
              maxOcc: num(row.maxOcc),
              checkins: num(row.ci),
              checkouts: num(row.co),
            },
          };
        },
      };
  }
}

export type ScopeOption = { id: string; name: string };

/**
 * Options for the scope selectors:
 * - dataOwners: organizations (contacts) that own at least one fietsenstalling.
 * - stallings: the stallingen for the given dataowner (empty when "all"/none selected).
 */
export async function getScopeOptions(dataOwnerId?: string): Promise<{
  dataOwners: ScopeOption[];
  stallings: ScopeOption[];
}> {
  const grouped = await prisma.fietsenstallingen.groupBy({
    by: ["SiteID"],
    where: { SiteID: { not: null } },
  });
  const ownerIds = grouped.map((g) => g.SiteID).filter((id): id is string => !!id);
  const owners = ownerIds.length
    ? await prisma.contacts.findMany({
        where: { ID: { in: ownerIds } },
        select: { ID: true, CompanyName: true },
        orderBy: { CompanyName: "asc" },
      })
    : [];
  const dataOwners: ScopeOption[] = owners.map((o) => ({ id: o.ID, name: o.CompanyName ?? o.ID }));

  let stallings: ScopeOption[] = [];
  if (dataOwnerId && dataOwnerId !== "all") {
    const list = await prisma.fietsenstallingen.findMany({
      where: { SiteID: dataOwnerId },
      select: { ID: true, StallingsID: true, Title: true },
      orderBy: { Title: "asc" },
    });
    stallings = list.map((s) => ({ id: s.ID, name: s.Title ?? s.StallingsID ?? s.ID }));
  }

  return { dataOwners, stallings };
}

type ScopeSelection = {
  /** organization contact ID (SiteID); "" or "all" = all dataowners */
  dataOwnerId?: string;
  /** fietsenstalling internal ID; "" or "all" = all stallingen within the dataowner */
  stallingId?: string;
};

/**
 * Resolves the selected scope (dataowner + fietsenstalling) into the stalling IDs used
 * to filter the report tables, plus a labels map (ID → Title) for display.
 * - `restrict` is false only when ALL dataowners are selected (no IN-filter applied).
 */
async function getScopeStallings(sel: ScopeSelection): Promise<{
  restrict: boolean;
  internalIds: string[];
  stallingsIds: string[];
  labels: Record<string, string>;
  label: string;
}> {
  const hasOwner = !!sel.dataOwnerId && sel.dataOwnerId !== "all";
  const hasStalling = !!sel.stallingId && sel.stallingId !== "all";

  const where: { Status?: string; SiteID?: string; ID?: string } = {};
  let restrict = false;
  if (hasStalling) {
    where.ID = sel.stallingId;
    restrict = true;
  } else if (hasOwner) {
    where.SiteID = sel.dataOwnerId;
    restrict = true;
  }

  const stallingen = await prisma.fietsenstallingen.findMany({
    where,
    select: { ID: true, StallingsID: true, Title: true, SiteID: true },
  });

  const internalIds: string[] = [];
  const stallingsIds: string[] = [];
  const labels: Record<string, string> = {};
  for (const s of stallingen) {
    const title = s.Title ?? s.StallingsID ?? s.ID;
    if (s.ID) {
      internalIds.push(s.ID);
      labels[s.ID] = title ? `${title}` : s.ID;
    }
    if (s.StallingsID) {
      stallingsIds.push(s.StallingsID);
      labels[s.StallingsID] = title ? `${title}` : s.StallingsID;
    }
  }

  let label = "Alle stallingen";
  if (hasStalling) {
    const only = stallingen[0];
    label = only ? `Stalling: ${only.Title ?? only.StallingsID ?? only.ID}` : "Stalling (onbekend)";
  } else if (hasOwner) {
    const owner = await prisma.contacts.findUnique({ where: { ID: sel.dataOwnerId }, select: { CompanyName: true } });
    label = `Dataeigenaar: ${owner?.CompanyName ?? sel.dataOwnerId} (${internalIds.length} stallingen)`;
  }

  return { restrict, internalIds, stallingsIds, labels, label };
}

async function queryEntries(
  def: ReportDef,
  table: string,
  whereExtra: string,
  dateStart: string,
  dateEnd: string,
  labels: Record<string, string>
): Promise<Map<string, RawEntry>> {
  const sql = def
    .buildSql(table, whereExtra)
    .replace(/:start/g, dateStart)
    .replace(/:end/g, dateEnd);
  const rows = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(sql);
  const map = new Map<string, RawEntry>();
  for (const row of rows) {
    const entry = def.mapRow(row, labels);
    map.set(entry.key, entry);
  }
  return map;
}

function metricsEqual(a: MetricMap, b: MetricMap, metrics: string[]): string[] {
  const diffFields: string[] = [];
  for (const m of metrics) {
    const tol = METRIC_TOLERANCE[m] ?? 0;
    if (Math.abs((a[m] ?? 0) - (b[m] ?? 0)) > tol) diffFields.push(m);
  }
  return diffFields;
}

export async function compareReporting(params: {
  reportType: ReportCompareType;
  dateStart: string;
  dateEnd: string;
  allData?: boolean;
  dataOwnerId?: string;
  stallingId?: string;
  source?: string;
}): Promise<CompareResult> {
  const reportType = params.reportType;
  const source = params.source ?? "FMS";
  const allData = !!params.allData;
  // When allData is set, ignore the date range by using very wide bounds.
  const dateStart = allData ? "1000-01-01" : DATE_RE.test(params.dateStart) ? params.dateStart : "2025-01-01";
  // dateEnd is exclusive upper bound (compared with `< end`).
  const dateEnd = allData ? "9999-01-01" : DATE_RE.test(params.dateEnd) ? params.dateEnd : "2100-01-01";

  const def = getReportDef(reportType, source);
  const warnings: string[] = [];

  const { restrict, internalIds, stallingsIds, labels, label } = await getScopeStallings({
    dataOwnerId: params.dataOwnerId,
    stallingId: params.stallingId,
  });

  let whereExtra = "";
  if (restrict) {
    const ids = def.scopeColumn === "internal" ? internalIds : stallingsIds;
    if (ids.length === 0) {
      warnings.push("Geen stallingen gevonden voor de gekozen selectie.");
      return {
        reportType,
        scopeLabel: label,
        dateStart,
        dateEnd,
        allData,
        source: reportType === "bezetting" ? source : undefined,
        oldTable: def.oldTable,
        newTable: def.newTable,
        metrics: def.metrics,
        rows: [],
        summary: { total: 0, identical: 0, diff: 0, old_only: 0, new_only: 0 },
        warnings,
      };
    }
    const col = def.scopeColumn === "internal" ? "FietsenstallingID" : "bikeparkID";
    whereExtra = `AND ${col} IN (${sqlInList(ids)})`;
  } else {
    warnings.push("Alle stallingen geselecteerd — dit kan traag zijn en veel rijen opleveren.");
  }

  if (allData) {
    warnings.push("Alle data geselecteerd (geen datumbereik) — dit kan traag zijn en veel rijen opleveren.");
  }

  // The shadow table may not exist (test phase not set up). Treat as empty.
  const existing = await resolveExistingTableNames([def.newTable]);
  const newTableExists = existing.some((t) => t.toLowerCase() === def.newTable.toLowerCase());
  if (!newTableExists) {
    warnings.push(`Shadow-tabel '${def.newTable}' bestaat niet; nieuwe zijde wordt als leeg behandeld.`);
  }

  const [oldMap, newMap] = await Promise.all([
    queryEntries(def, def.oldTable, whereExtra, dateStart, dateEnd, labels),
    newTableExists
      ? queryEntries(def, def.newTable, whereExtra, dateStart, dateEnd, labels)
      : Promise.resolve(new Map<string, RawEntry>()),
  ]);

  const allKeys = new Set<string>([...oldMap.keys(), ...newMap.keys()]);
  const rows: CompareRow[] = [];
  const summary: CompareSummary = { total: 0, identical: 0, diff: 0, old_only: 0, new_only: 0 };

  for (const key of allKeys) {
    const o = oldMap.get(key);
    const n = newMap.get(key);
    let status: CompareRowStatus;
    let diffFields: string[] = [];
    if (o && n) {
      diffFields = metricsEqual(o.metrics, n.metrics, def.metrics);
      status = diffFields.length === 0 ? "identical" : "diff";
    } else if (o) {
      status = "old_only";
    } else {
      status = "new_only";
    }
    summary[status]++;
    summary.total++;
    rows.push({
      key,
      label: (o ?? n)!.label,
      old: o ? o.metrics : null,
      new: n ? n.metrics : null,
      status,
      diffFields,
    });
  }

  // Stable, useful ordering: problems first, then alphabetic by label.
  const order: Record<CompareRowStatus, number> = { diff: 0, old_only: 1, new_only: 2, identical: 3 };
  rows.sort((a, b) => order[a.status] - order[b.status] || a.label.localeCompare(b.label));

  return {
    reportType,
    scopeLabel: label,
    dateStart,
    dateEnd,
    allData,
    source: reportType === "bezetting" ? source : undefined,
    oldTable: def.oldTable,
    newTable: def.newTable,
    metrics: def.metrics,
    rows,
    summary,
    warnings,
  };
}
