/**
 * Raw transaction reporting, ported from the ColdFusion v1_reportingservice.cfc
 * getTransactionsForBikepark -> reports_json.ruweData -> reports.getQArchivedRuweData.
 *
 * Reads from transacties_archief, filtered by citycode + locationid and a date
 * window that depends on the requested `type`.
 */
import type { Prisma } from "~/generated/prisma-client";
import { prisma } from "~/server/db";

export type TransactionType = "checkout" | "checkin" | "overlap";

export interface ReportingPeriod {
  from: Date;
  to: Date;
}

export interface ReportingTransaction {
  locationid: string;
  sectionid: string;
  checkindate: string | null;
  checkoutdate: string | null;
  checkintype: string;
  checkouttype: string | null;
  price: number;
  clienttypeid: number;
  biketypeid: number;
}

export interface ReportingTransactionsResult {
  citycode: string;
  locationid: string;
  type: TransactionType;
  period: { from: string; to: string };
  count: number;
  transactions: ReportingTransaction[];
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
}): ReportingPeriod {
  if (query.from && query.to) {
    const from = new Date(query.from);
    const to = new Date(query.to);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      throw new Error("Invalid 'from' or 'to' date");
    }
    return { from, to };
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
  return { from, to };
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
 * Fetch raw transactions for a single bikepark within the given period.
 */
export async function getBikeparkTransactions(params: {
  citycode: string;
  locationid: string;
  from: Date;
  to: Date;
  type: TransactionType;
}): Promise<ReportingTransactionsResult> {
  const { citycode, locationid, from, to, type } = params;

  const rows = await prisma.transacties_archief.findMany({
    where: {
      citycode,
      locationid,
      ...buildDateFilter(type, from, to),
    },
    orderBy: [{ checkoutdate: "asc" }, { citycode: "asc" }, { biketypeid: "asc" }],
  });

  const transactions: ReportingTransaction[] = rows.map((row) => ({
    locationid: row.locationid,
    sectionid: row.sectionid,
    checkindate: row.checkindate ? row.checkindate.toISOString() : null,
    checkoutdate: row.checkoutdate ? row.checkoutdate.toISOString() : null,
    checkintype: row.checkintype,
    checkouttype: row.checkouttype ?? null,
    price: Number(row.price),
    clienttypeid: row.clienttypeid,
    biketypeid: row.biketypeid,
  }));

  return {
    citycode,
    locationid,
    type,
    period: { from: from.toISOString(), to: to.toISOString() },
    count: transactions.length,
    transactions,
  };
}
