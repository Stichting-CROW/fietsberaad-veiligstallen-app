/**
 * Raw transaction reporting, ported from the ColdFusion v1_reportingservice.cfc
 * getTransactionsForBikepark -> reports_json.ruweData -> reports.getQArchivedRuweData.
 *
 * Reads from transacties_archief, filtered by citycode + locationid and a date
 * window that depends on the requested `type`.
 */
import type { Prisma } from "~/generated/prisma-client";
import { formatCfDbDateTime } from "~/server/services/fms/fms-idtypes";
import { prisma } from "~/server/db";

export type TransactionType = "checkout" | "checkin" | "overlap";

export interface ReportingPeriod {
  from: Date;
  to: Date;
}

/** Sparse row shape from reports_json.ruweData (default values omitted). */
export type ReportingTransactionRow = Record<string, string | number>;

export interface ReportingTransactionsDefaults {
  clienttypeid: number;
  checkouttype: string;
  checkintype: string;
  biketypeid: number;
  locationid: string;
  sectionid?: string;
}

export interface ReportingTransactionsResult {
  data: ReportingTransactionRow[];
  count: number;
  citycode: string;
  type: TransactionType;
  defaults: ReportingTransactionsDefaults;
  locationid: string;
  month?: string;
  year?: string;
  from?: string;
  to?: string;
}

/**
 * Resolve the reporting period from query parameters, ported from CF lines 209-221.
 * - When `from`/`to` are provided, both are parsed as dates.
 * - Otherwise `year`/`month` default to the previous month; the window is the
 *   first day of that month until one month later.
 */
export function resolvePeriod(query: {
  from?: string;
  to?: string;
  year?: string;
  month?: string;
}): ReportingPeriod & { year: number; month: number; usesFromTo: boolean } {
  if (query.from && query.to) {
    const from = new Date(query.from);
    const to = new Date(query.to);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      throw new Error("Invalid 'from' or 'to' date");
    }
    return { from, to, year: from.getFullYear(), month: from.getMonth() + 1, usesFromTo: true };
  }

  const previousMonth = new Date();
  previousMonth.setMonth(previousMonth.getMonth() - 1);

  const year = query.year ? parseInt(query.year, 10) : previousMonth.getFullYear();
  // CF month is 1-based; JS month is 0-based.
  const month = query.month ? parseInt(query.month, 10) : previousMonth.getMonth() + 1;

  if (Number.isNaN(year) || Number.isNaN(month) || month < 1 || month > 12) {
    throw new Error("Invalid 'year' or 'month'");
  }

  const from = new Date(year, month - 1, 1, 0, 0, 0, 0);
  const to = new Date(year, month, 1, 0, 0, 0, 0);
  return { from, to, year, month, usesFromTo: false };
}

/**
 * Build the date-window filter for transacties_archief, ported from
 * getQArchivedRuweData's <cfswitch expression="#type#">.
 */
function buildDateFilter(
  type: TransactionType,
  from: Date,
  to: Date
): Prisma.transacties_archiefWhereInput {
  switch (type) {
    case "checkin":
      return { checkindate: { gte: from, lte: to } };
    case "overlap":
      return {
        OR: [
          { checkindate: { gte: from, lte: to } },
          { checkoutdate: { gte: from, lte: to } },
          {
            AND: [
              { checkindate: { lte: from } },
              { OR: [{ checkoutdate: { gte: from } }, { checkoutdate: null }] },
            ],
          },
        ],
      };
    case "checkout":
    default:
      return { checkoutdate: { gte: from, lte: to, not: null } };
  }
}

/**
 * Map a DB row to the sparse ruweData JSON shape (reports_json.cfc).
 * For a single bikepark request, locationid is omitted from each row.
 */
function mapRuweDataRow(
  row: {
    locationid: string;
    sectionid: string;
    checkindate: Date | null;
    checkoutdate: Date | null;
    checkintype: string;
    checkouttype: string | null;
    price: Prisma.Decimal | number;
    clienttypeid: number;
    biketypeid: number;
  },
  showSectionId: boolean
): ReportingTransactionRow {
  const result: ReportingTransactionRow = {};

  if (showSectionId) {
    result.sectionid = row.sectionid;
  }
  if (row.checkindate) {
    result.checkindate = formatCfDbDateTime(row.checkindate);
  }
  if (row.checkoutdate) {
    result.checkoutdate = formatCfDbDateTime(row.checkoutdate);
  }
  if (row.checkintype && row.checkintype !== "user") {
    result.checkintype = row.checkintype;
  }
  if (row.checkouttype && row.checkouttype !== "user" && row.checkouttype !== "") {
    result.checkouttype = row.checkouttype;
  }
  const price = Number(row.price);
  if (price !== 0) {
    result.price = price;
  }
  if (row.clienttypeid !== 1) {
    result.clienttypeid = row.clienttypeid;
  }
  if (row.biketypeid !== 1) {
    result.biketypeid = row.biketypeid;
  }

  return result;
}

function buildDefaults(
  locationid: string,
  sections: { externalId: string | null }[]
): ReportingTransactionsDefaults {
  const sectionid = sections.length === 1 ? sections[0]?.externalId : undefined;

  if (sectionid) {
    return {
      clienttypeid: 1,
      checkouttype: "user",
      checkintype: "user",
      sectionid,
      biketypeid: 1,
      locationid,
    };
  }

  return {
    clienttypeid: 1,
    checkouttype: "user",
    checkintype: "user",
    biketypeid: 1,
    locationid,
  };
}

/**
 * Build the response object with the same top-level key order as the old CF API.
 */
function buildResponse(params: {
  data: ReportingTransactionRow[];
  citycode: string;
  locationid: string;
  type: TransactionType;
  defaults: ReportingTransactionsDefaults;
  usesFromTo: boolean;
  from?: string;
  to?: string;
  year: number;
  month: number;
}): ReportingTransactionsResult {
  const count = params.data.length;

  if (params.usesFromTo) {
    return {
      data: params.data,
      count,
      to: params.to,
      citycode: params.citycode,
      from: params.from,
      type: params.type,
      defaults: params.defaults,
      locationid: params.locationid,
    };
  }

  return {
    data: params.data,
    month: String(params.month),
    count,
    year: String(params.year),
    citycode: params.citycode,
    type: params.type,
    defaults: params.defaults,
    locationid: params.locationid,
  };
}

/**
 * Fetch raw transactions for a single bikepark within the given period.
 */
export async function getBikeparkTransactions(params: {
  citycode: string;
  locationid: string;
  from: Date;
  to: Date;
  type: TransactionType;
  usesFromTo: boolean;
  fromParam?: string;
  toParam?: string;
  year: number;
  month: number;
}): Promise<ReportingTransactionsResult> {
  const { citycode, locationid, from, to, type } = params;

  const bikepark = await prisma.fietsenstallingen.findFirst({
    where: { StallingsID: locationid },
    select: {
      fietsenstalling_secties: {
        select: { externalId: true },
        orderBy: { sectieId: "asc" },
      },
    },
  });

  const sections = bikepark?.fietsenstalling_secties ?? [];
  const showSectionId = sections.length > 1;
  const defaults = buildDefaults(locationid, sections);

  const rows = await prisma.transacties_archief.findMany({
    where: {
      citycode,
      locationid,
      ...buildDateFilter(type, from, to),
    },
    orderBy: [{ checkoutdate: "asc" }, { citycode: "asc" }, { biketypeid: "asc" }],
  });

  const data = rows.map((row) => mapRuweDataRow(row, showSectionId));

  return buildResponse({
    data,
    citycode,
    locationid,
    type,
    defaults,
    usesFromTo: params.usesFromTo,
    from: params.fromParam,
    to: params.toParam,
    year: params.year,
    month: params.month,
  });
}
