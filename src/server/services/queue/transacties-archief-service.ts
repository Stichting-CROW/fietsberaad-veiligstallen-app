/**
 * Writes transacties_archief for a closed visit.
 *
 * Managed check-out (v4) and completedtransactions (v3) share this helper.
 * v4 clients keep posting managedtransactions only; archief is an internal side effect.
 * Open visits do not get an archief row — call deleteManagedTransactiesArchief instead.
 *
 * A managed visit uses transacties.ID as the archive id. A resend updates that row
 * while the live transaction still exists. After the 18-month retention delete the
 * live row is gone, so a later post with the same externaltransactionid is a new visit.
 * Corrections have to arrive before that cleanup.
 * Rows without a transaction id (legacy completed transactions) are inserted.
 */

import type { PrismaClient } from "~/generated/prisma-client";
import { Decimal } from "@prisma/client/runtime/library";
import { updateRowsById } from "./batch-sql";

type Db = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$use" | "$extends" | "$transaction"
>;

const CHECK_TYPES = ["user", "controle", "system", "sync", "reservation"] as const;

export type ArchiefCheckType = (typeof CHECK_TYPES)[number];

/** source value for rows produced from a v4 managed check-out. */
export const ARCHIEF_SOURCE_V4_MANAGED = "fms-v4-managed";

/** source value kept by uploadCompletedTransactionV3. */
export const ARCHIEF_SOURCE_V3_COMPLETED = "fms-v3-api";

/** Midnight used when the organisation has no DayBeginsAt. Matches the old completed-transaction writer. */
export const LEGACY_ARCHIEF_DAY_BEGINS_AT = new Date(1970, 0, 1, 0, 0, 0);

export type WriteTransactiesArchiefInput = {
  citycode: string;
  locationid: string;
  sectionid: string;
  sectionidOut?: string | null;
  placeid?: number | null;
  externalplaceid?: string | null;
  checkindate: Date;
  checkoutdate: Date;
  checkintype: string;
  checkouttype: string;
  price: number | string | Decimal | null | undefined;
  clienttypeid: number;
  biketypeid: number;
  exploitantid?: string | null;
  reservationtime?: number | null;
  source: string;
  /**
   * transacties.ID. When set, the archive row is upserted on that id.
   * Omit for a plain insert (v3 completed transactions have no transacties row).
   */
  transactionId?: number | null;
  /** Organisation day start (contacts.DayBeginsAt). Looked up from citycode when omitted. */
  daybeginsat?: Date;
};

export function toArchiefCheckType(
  value: string | null | undefined,
  fallback: ArchiefCheckType = "user"
): ArchiefCheckType {
  const normalized = (value ?? "").trim().toLowerCase();
  return (CHECK_TYPES as readonly string[]).includes(normalized)
    ? (normalized as ArchiefCheckType)
    : fallback;
}

export function toArchiefPrice(val: number | string | Decimal | null | undefined): Decimal {
  if (val == null || val === "") return new Decimal(0);
  return new Decimal(val);
}

function requireFit(label: string, value: string, max: number): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error(`${label} is verplicht voor transacties_archief`);
  if (trimmed.length > max) {
    throw new Error(`${label} '${trimmed}' is langer dan ${max} tekens`);
  }
  return trimmed;
}

function isUniqueConflict(e: unknown): boolean {
  return typeof e === "object" && e != null && "code" in e && (e as { code: string }).code === "P2002";
}

async function resolveDayBeginsAt(db: Db, citycode: string): Promise<Date> {
  const contact = await db.contacts.findFirst({
    where: { ZipID: citycode, ItemType: "organizations", Status: "1" },
    select: { DayBeginsAt: true },
  });
  return contact?.DayBeginsAt ?? LEGACY_ARCHIEF_DAY_BEGINS_AT;
}

type ArchiefData = {
  citycode: string;
  locationid: string;
  sectionid: string;
  sectionid_out: string | null;
  placeid: number | null;
  externalplaceid: string | null;
  checkindate: Date;
  checkoutdate: Date;
  checkintype: ArchiefCheckType;
  checkouttype: ArchiefCheckType;
  daybeginsat: Date;
  reservationtime: number | null;
  price: Decimal;
  clienttypeid: number;
  biketypeid: number;
  source: string;
  exploitantid: string | null;
  modified: Date;
};

function buildArchiefData(input: WriteTransactiesArchiefInput, daybeginsat: Date): ArchiefData {
  const citycode = requireFit("citycode", input.citycode, 4);
  const locationid = requireFit("locationid", input.locationid, 8);
  const sectionid = requireFit("sectionid", input.sectionid, 13);
  const sectionidOut = input.sectionidOut?.trim()
    ? requireFit("sectionid_out", input.sectionidOut, 13)
    : null;
  const source = requireFit("source", input.source, 35);
  return {
    citycode,
    locationid,
    sectionid,
    sectionid_out: sectionidOut,
    placeid: input.placeid ?? null,
    externalplaceid: input.externalplaceid ?? null,
    checkindate: input.checkindate,
    checkoutdate: input.checkoutdate,
    checkintype: toArchiefCheckType(input.checkintype),
    checkouttype: toArchiefCheckType(input.checkouttype),
    daybeginsat,
    reservationtime: input.reservationtime ?? null,
    price: toArchiefPrice(input.price),
    clienttypeid: input.clienttypeid,
    biketypeid: input.biketypeid,
    source,
    exploitantid: input.exploitantid ?? null,
    modified: new Date(),
  };
}

/**
 * Insert or, when transactionId is set, update the archief row that shares transacties.ID.
 */
export async function writeTransactiesArchiefFromManaged(
  db: Db,
  input: WriteTransactiesArchiefInput
): Promise<{ id: number; created: boolean }> {
  const daybeginsat = input.daybeginsat ?? (await resolveDayBeginsAt(db, input.citycode.trim()));
  const data = buildArchiefData(input, daybeginsat);
  const transactionId = input.transactionId ?? null;

  if (transactionId == null) {
    const created = await db.transacties_archief.create({ data });
    return { id: created.ID, created: true };
  }

  const existing = await db.transacties_archief.findUnique({
    where: { ID: transactionId },
    select: { ID: true },
  });
  if (existing) {
    await db.transacties_archief.update({ where: { ID: transactionId }, data });
    return { id: transactionId, created: false };
  }

  try {
    const created = await db.transacties_archief.create({ data: { ...data, ID: transactionId } });
    return { id: created.ID, created: true };
  } catch (e) {
    if (!isUniqueConflict(e)) throw e;
    await db.transacties_archief.update({ where: { ID: transactionId }, data });
    return { id: transactionId, created: false };
  }
}

type ArchiefRowWithId = ArchiefData & { ID: number };

/** Upsert many closed visits. The last input for a transaction id wins. */
export async function writeTransactiesArchiefBatch(
  db: Db,
  inputs: WriteTransactiesArchiefInput[]
): Promise<void> {
  const byId = new Map<number, ArchiefRowWithId>();
  const dayCache = new Map<string, Date>();
  for (const input of inputs) {
    const citycode = input.citycode.trim();
    let daybeginsat = input.daybeginsat;
    if (!daybeginsat) {
      daybeginsat = dayCache.get(citycode);
      if (!daybeginsat) {
        daybeginsat = await resolveDayBeginsAt(db, citycode);
        dayCache.set(citycode, daybeginsat);
      }
    }
    const data = buildArchiefData(input, daybeginsat);
    if (input.transactionId == null) {
      await db.transacties_archief.create({ data });
      continue;
    }
    byId.set(input.transactionId, { ...data, ID: input.transactionId });
  }
  const rows = [...byId.values()];
  if (rows.length === 0) return;

  const existing = await db.transacties_archief.findMany({
    where: { ID: { in: rows.map((row) => row.ID) } },
    select: { ID: true },
  });
  const existingIds = new Set(existing.map((row) => row.ID));

  const toCreate = rows.filter((row) => !existingIds.has(row.ID));
  if (toCreate.length > 0) {
    await db.transacties_archief.createMany({ data: toCreate });
  }

  const toUpdate = rows.flatMap((row) => {
    if (!existingIds.has(row.ID)) return [];
    return [{
      id: row.ID,
      set: {
        citycode: row.citycode,
        locationid: row.locationid,
        sectionid: row.sectionid,
        sectionid_out: row.sectionid_out,
        placeid: row.placeid,
        externalplaceid: row.externalplaceid,
        checkindate: row.checkindate,
        checkoutdate: row.checkoutdate,
        checkintype: row.checkintype,
        checkouttype: row.checkouttype,
        daybeginsat: row.daybeginsat,
        reservationtime: row.reservationtime,
        price: row.price.toString(),
        clienttypeid: row.clienttypeid,
        biketypeid: row.biketypeid,
        source: row.source,
        exploitantid: row.exploitantid,
        modified: row.modified,
      },
    }];
  });
  await updateRowsById(
    db as unknown as Parameters<typeof updateRowsById>[0],
    "transacties_archief",
    "ID",
    toUpdate
  );
}

/** Drop archief rows when managed visits in this batch are open again. */
export async function deleteManagedTransactiesArchiefMany(
  db: Db,
  transactionIds: number[]
): Promise<void> {
  const ids = [...new Set(transactionIds.filter((id) => Number.isInteger(id) && id > 0))];
  if (ids.length === 0) return;
  await db.transacties_archief.deleteMany({ where: { ID: { in: ids } } });
}

/** Drop the archief row when a managed visit is open again (no check-out). */
export async function deleteManagedTransactiesArchief(
  db: Db,
  transactionId: number
): Promise<number> {
  if (!Number.isInteger(transactionId) || transactionId <= 0) return 0;
  const result = await db.transacties_archief.deleteMany({ where: { ID: transactionId } });
  return result.count;
}
