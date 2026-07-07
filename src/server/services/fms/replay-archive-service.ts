/**
 * Replays queue data back through the FMS write API service layer into the parallel
 * shadow input queues (new_wachtrij_*), WITHOUT touching the source tables. After replay,
 * run the Next.js queue processor (process-queue with useLocalProcessor) to fill new_*
 * output tables, then compare against the existing production data via /test/reporting-compare.
 *
 * Source can be the live queue tables (wachtrij_*) or the archive snapshot
 * (wachtrij_*_archive20240915). Batched + cursor-based (afterId) so large datasets can be
 * replayed across many calls without hitting serverless time limits.
 */
import { prisma } from "~/server/db";

export type ReplaySource = "live" | "archive";

const SOURCE_TABLES: Record<ReplaySource, { transacties: string; pasids: string }> = {
  live: { transacties: "wachtrij_transacties", pasids: "wachtrij_pasids" },
  archive: { transacties: "wachtrij_transacties_archive20240915", pasids: "wachtrij_pasids_archive20240915" },
};

function sourceTables(source: ReplaySource | undefined) {
  return SOURCE_TABLES[source ?? "live"];
}

export type ReplayKind = "pasids" | "transacties";

export type ReplayScope = {
  /** organization contact ID (SiteID); "" or "all" = all dataowners */
  dataOwnerId?: string;
  /** fietsenstalling internal ID; "" or "all" = all stallingen within the dataowner */
  stallingId?: string;
};

export type ReplayFilter = {
  /** Resolved bikeparkIDs (StallingsIDs). null = all stallingen; [] = none. */
  bikeparkIDs?: string[] | null;
  dateStart?: string; // YYYY-MM-DD inclusive (on transactionDate)
  dateEnd?: string; // YYYY-MM-DD exclusive
  /** When true, ignore the date range entirely. */
  allData?: boolean;
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function sqlInList(values: string[]): string {
  return values.map((v) => `'${String(v).replace(/'/g, "''")}'`).join(",");
}

/**
 * Resolves a dataowner/stalling selection into the set of bikeparkIDs (StallingsIDs)
 * used to filter the archive tables. `ids === null` means "all stallingen" (no filter).
 */
export async function resolveBikeparkIDs(scope: ReplayScope): Promise<{ ids: string[] | null; label: string }> {
  const hasOwner = !!scope.dataOwnerId && scope.dataOwnerId !== "all";
  const hasStalling = !!scope.stallingId && scope.stallingId !== "all";
  if (!hasOwner && !hasStalling) return { ids: null, label: "Alle stallingen" };

  const where: { SiteID?: string; ID?: string } = hasStalling
    ? { ID: scope.stallingId }
    : { SiteID: scope.dataOwnerId };
  const list = await prisma.fietsenstallingen.findMany({
    where,
    select: { StallingsID: true, Title: true },
  });
  const ids = list.map((s) => s.StallingsID).filter((v): v is string => !!v);

  let label = "Alle stallingen";
  if (hasStalling) {
    label = list[0] ? `Stalling: ${list[0].Title ?? list[0].StallingsID}` : "Stalling (onbekend)";
  } else if (hasOwner) {
    label = `Dataeigenaar (${ids.length} stallingen)`;
  }
  return { ids, label };
}

function buildWhere(filter: ReplayFilter, afterId: number): string {
  const parts: string[] = [`ID > ${Number.isFinite(afterId) ? Math.floor(afterId) : 0}`];
  if (filter.bikeparkIDs !== null && filter.bikeparkIDs !== undefined) {
    parts.push(filter.bikeparkIDs.length === 0 ? "1=0" : `bikeparkID IN (${sqlInList(filter.bikeparkIDs)})`);
  }
  if (!filter.allData) {
    if (filter.dateStart && DATE_RE.test(filter.dateStart)) {
      parts.push(`transactionDate >= '${filter.dateStart} 00:00:00'`);
    }
    if (filter.dateEnd && DATE_RE.test(filter.dateEnd)) {
      parts.push(`transactionDate < '${filter.dateEnd} 00:00:00'`);
    }
  }
  return parts.join(" AND ");
}

export async function countArchive(
  filter: ReplayFilter,
  source?: ReplaySource
): Promise<{ pasids: number; transacties: number }> {
  const where = buildWhere(filter, 0);
  const tables = sourceTables(source);
  const [p, t] = await Promise.all([
    prisma.$queryRawUnsafe<{ c: bigint }[]>(`SELECT COUNT(*) AS c FROM \`${tables.pasids}\` WHERE ${where}`),
    prisma.$queryRawUnsafe<{ c: bigint }[]>(`SELECT COUNT(*) AS c FROM \`${tables.transacties}\` WHERE ${where}`),
  ]);
  return { pasids: Number(p[0]?.c ?? 0), transacties: Number(t[0]?.c ?? 0) };
}

type PasidRow = {
  ID: number;
  transactionDate: Date | null;
  bikeparkID: string;
  passID: string;
  barcode: string;
  RFID: string;
  RFIDBike: string;
  biketypeID: number | null;
  bike: string;
};

type TransactieRow = {
  ID: number;
  transactionDate: Date | null;
  bikeparkID: string;
  sectionID: string;
  placeID: number | null;
  externalPlaceID: string | null;
  transactionID: number;
  passID: string;
  passtype: string | null;
  type: string;
  typeCheck: string | null;
  price: unknown;
  transaction: string;
};

export type ReplayBatchResult = {
  kind: ReplayKind;
  processed: number;
  errors: number;
  lastId: number;
  hasMore: boolean;
  sampleErrors: string[];
};

/**
 * Replay one batch of source rows (ID > afterId) for the given kind into new_wachtrij_*.
 *
 * This is a verbatim row-copy (same columns, same stored transaction/bike JSON), matching
 * exactly what the MySQL mirror triggers do — NOT a re-run through the FMS API mapping.
 * `processed` is forced to 0 so the Next.js queue processor reprocesses the rows.
 */
export async function replayArchiveBatch(opts: {
  kind: ReplayKind;
  afterId: number;
  batchSize: number;
  filter: ReplayFilter;
  source?: ReplaySource;
}): Promise<ReplayBatchResult> {
  const batchSize = Math.min(Math.max(opts.batchSize || 200, 1), 1000);
  const where = buildWhere(opts.filter, opts.afterId);
  const tables = sourceTables(opts.source);

  let processed = 0;
  let errors = 0;
  let lastId = opts.afterId;
  const sampleErrors: string[] = [];

  if (opts.kind === "pasids") {
    const rows = await prisma.$queryRawUnsafe<PasidRow[]>(
      `SELECT ID, transactionDate, bikeparkID, passID, barcode, RFID, RFIDBike, biketypeID, bike
       FROM \`${tables.pasids}\` WHERE ${where} ORDER BY ID ASC LIMIT ${batchSize}`
    );
    if (rows.length) {
      lastId = rows[rows.length - 1]!.ID;
      try {
        const created = await prisma.new_wachtrij_pasids.createMany({
          data: rows.map((r) => ({
            transactionDate: r.transactionDate,
            bikeparkID: r.bikeparkID,
            passID: r.passID,
            barcode: r.barcode ?? "",
            RFID: r.RFID ?? "",
            RFIDBike: r.RFIDBike ?? "",
            biketypeID: r.biketypeID,
            bike: r.bike,
            processed: 0,
          })),
          skipDuplicates: true,
        });
        processed = created.count;
      } catch (e) {
        errors = rows.length;
        sampleErrors.push(`pasids batch (na #${opts.afterId}): ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    return { kind: "pasids", processed, errors, lastId, hasMore: rows.length === batchSize, sampleErrors };
  }

  const rows = await prisma.$queryRawUnsafe<TransactieRow[]>(
    `SELECT ID, transactionDate, bikeparkID, sectionID, placeID, externalPlaceID, transactionID,
            passID, passtype, type, typeCheck, price, transaction
     FROM \`${tables.transacties}\` WHERE ${where} ORDER BY ID ASC LIMIT ${batchSize}`
  );
  if (rows.length) {
    lastId = rows[rows.length - 1]!.ID;
    try {
      const created = await prisma.new_wachtrij_transacties.createMany({
        data: rows.map((r) => ({
          transactionDate: r.transactionDate,
          bikeparkID: r.bikeparkID,
          sectionID: r.sectionID,
          placeID: r.placeID,
          externalPlaceID: r.externalPlaceID,
          transactionID: r.transactionID ?? 0,
          passID: r.passID,
          passtype: r.passtype,
          type: r.type,
          typeCheck: r.typeCheck,
          price: r.price != null ? Number(r.price as number) : null,
          transaction: r.transaction,
          processed: 0,
        })),
        skipDuplicates: true,
      });
      processed = created.count;
    } catch (e) {
      errors = rows.length;
      sampleErrors.push(`transacties batch (na #${opts.afterId}): ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return { kind: "transacties", processed, errors, lastId, hasMore: rows.length === batchSize, sampleErrors };
}

/**
 * Clears the shadow input queues and shadow output tables so a replay run starts clean.
 * Never touches production tables.
 */
export async function resetNewTables(): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  // Output tables first, then input queues.
  counts.new_financialtransactions = (await prisma.new_financialtransactions.deleteMany({})).count;
  counts.new_accounts_pasids = (await prisma.new_accounts_pasids.deleteMany({})).count;
  counts.new_accounts = (await prisma.new_accounts.deleteMany({})).count;
  counts.new_transacties_archief = (await prisma.new_transacties_archief.deleteMany({})).count;
  counts.new_transacties = (await prisma.new_transacties.deleteMany({})).count;
  counts.new_wachtrij_transacties = (await prisma.new_wachtrij_transacties.deleteMany({})).count;
  counts.new_wachtrij_pasids = (await prisma.new_wachtrij_pasids.deleteMany({})).count;
  counts.new_wachtrij_betalingen = (await prisma.new_wachtrij_betalingen.deleteMany({})).count;
  counts.new_wachtrij_sync = (await prisma.new_wachtrij_sync.deleteMany({})).count;
  return counts;
}
