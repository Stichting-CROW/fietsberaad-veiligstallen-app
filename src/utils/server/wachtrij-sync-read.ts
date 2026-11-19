import { prisma } from "~/server/db";

export type SyncQueueRow = {
  sectionID: string | null;
  transactionDate: Date | null;
};

/** Latest sync moment per bikepark from legacy CF queue and FMS v4 `new_wachtrij_sync`. */
export const SYNC_QUEUE_LATEST_BY_BIKEPARK_JOIN = `
  LEFT JOIN (
    SELECT bikeparkID, MAX(transactionDate) AS transactionDate
    FROM (
      SELECT bikeparkID, transactionDate FROM wachtrij_sync
      UNION ALL
      SELECT bikeparkID, transactionDate FROM new_wachtrij_sync
    ) AS sync_union
    GROUP BY bikeparkID
  ) ws ON (ws.bikeparkID = f.StallingsID)
`;

export async function findSyncQueueRowsForBikepark(
  bikeparkID: string,
  dateRange?: { gte: Date; lte: Date }
): Promise<SyncQueueRow[]> {
  const where: {
    bikeparkID: string;
    transactionDate?: { gte: Date; lte: Date };
  } = { bikeparkID };
  if (dateRange) {
    where.transactionDate = dateRange;
  }

  const select = { sectionID: true, transactionDate: true } as const;
  const orderBy = { transactionDate: "desc" as const };

  const [legacy, modern] = await Promise.all([
    prisma.wachtrij_sync.findMany({ where, select, orderBy }),
    prisma.new_wachtrij_sync.findMany({ where, select, orderBy }),
  ]);

  const seen = new Set<string>();
  const combined: SyncQueueRow[] = [];
  for (const row of [...legacy, ...modern]) {
    const key = `${row.sectionID ?? ""}|${row.transactionDate?.toISOString() ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    combined.push(row);
  }

  combined.sort(
    (a, b) =>
      (b.transactionDate?.getTime() ?? 0) - (a.transactionDate?.getTime() ?? 0)
  );
  return combined;
}
