/**
 * Writes transacties_archief for a closed visit.
 *
 * Managed check-out (v4) and completedtransactions (v3) share this helper.
 * v4 clients keep posting managedtransactions only; archief is an internal side effect.
 * Open visits do not get an archief row — call deleteManagedTransactiesArchief instead.
 *
 * Idempotency: when externaltransactionid is set, the row is upserted on
 * (locationid, externaltransactionid). A resend updates that row.
 * Rows without an external id (legacy completed transactions) are inserted.
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
  /** Upsert key together with locationid. Omit for a plain insert. */
  externaltransactionid?: string | null;
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
  externaltransactionid: string | null;
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
  const externaltransactionid = input.externaltransactionid?.trim() || null;
  if (externaltransactionid && externaltransactionid.length > 100) {
    throw new Error("externaltransactionid max 100 tekens");
  }
  return {
    citycode,
    locationid,
    sectionid,
    sectionid_out: sectionidOut,
    placeid: input.placeid ?? null,
    externalplaceid: input.externalplaceid ?? null,
    externaltransactionid,
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
 * Insert or, when externaltransactionid is set, update the archief row for this visit.
 */
export async function writeTransactiesArchiefFromManaged(
  db: Db,
  input: WriteTransactiesArchiefInput
): Promise<{ id: number; created: boolean }> {
  const daybeginsat = input.daybeginsat ?? (await resolveDayBeginsAt(db, input.citycode.trim()));
  const data = buildArchiefData(input, daybeginsat);
  const externaltransactionid = data.externaltransactionid;
  const locationid = data.locationid;

  if (!externaltransactionid) {
    const created = await db.transacties_archief.create({ data });
    return { id: created.ID, created: true };
  }

  const existing = await db.transacties_archief.findFirst({
    where: { locationid, externaltransactionid },
    select: { ID: true },
  });
  if (existing) {
    await db.transacties_archief.update({ where: { ID: existing.ID }, data });
    return { id: existing.ID, created: false };
  }

  try {
    const created = await db.transacties_archief.create({ data });
    return { id: created.ID, created: true };
  } catch (e) {
    if (!isUniqueConflict(e)) throw e;
    const again = await db.transacties_archief.findFirst({
      where: { locationid, externaltransactionid },
      select: { ID: true },
    });
    if (!again) throw e;
    await db.transacties_archief.update({ where: { ID: again.ID }, data });
    return { id: again.ID, created: false };
  }
}

function archiefKey(locationid: string, externaltransactionid: string): string {
  return `${locationid}\0${externaltransactionid}`;
}

/** Upsert many closed visits. The last input for a location + external id wins. */
export async function writeTransactiesArchiefBatch(
  db: Db,
  inputs: WriteTransactiesArchiefInput[]
): Promise<void> {
  const byKey = new Map<string, ArchiefData>();
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
    if (!data.externaltransactionid) {
      await db.transacties_archief.create({ data });
      continue;
    }
    byKey.set(archiefKey(data.locationid, data.externaltransactionid), data);
  }
  const rows = [...byKey.values()];
  if (rows.length === 0) return;

  const existing = await db.transacties_archief.findMany({
    where: {
      OR: rows.map((row) => ({
        locationid: row.locationid,
        externaltransactionid: row.externaltransactionid,
      })),
    },
    select: { ID: true, locationid: true, externaltransactionid: true },
  });
  const existingId = new Map<string, number>();
  for (const row of existing) {
    if (row.externaltransactionid) {
      existingId.set(archiefKey(row.locationid, row.externaltransactionid), row.ID);
    }
  }

  const toCreate = rows.filter(
    (row) => !existingId.has(archiefKey(row.locationid, row.externaltransactionid ?? ""))
  );
  if (toCreate.length > 0) {
    await db.transacties_archief.createMany({ data: toCreate });
  }

  const toUpdate = rows.flatMap((row) => {
    const id = existingId.get(archiefKey(row.locationid, row.externaltransactionid ?? ""));
    if (id == null) return [];
    return [{
      id,
      set: {
        citycode: row.citycode,
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
  keys: { locationid: string; externaltransactionid: string }[]
): Promise<void> {
  const unique = new Map<string, { locationid: string; externaltransactionid: string }>();
  for (const key of keys) {
    const externaltransactionid = key.externaltransactionid.trim();
    if (!key.locationid || !externaltransactionid) continue;
    unique.set(archiefKey(key.locationid, externaltransactionid), {
      locationid: key.locationid,
      externaltransactionid,
    });
  }
  const pairs = [...unique.values()];
  if (pairs.length === 0) return;
  await db.transacties_archief.deleteMany({ where: { OR: pairs } });
}

/** Drop the archief row when a managed visit is open again (no check-out). */
export async function deleteManagedTransactiesArchief(
  db: Db,
  locationid: string,
  externaltransactionid: string
): Promise<number> {
  const externalId = externaltransactionid.trim();
  if (!locationid || !externalId) return 0;
  const result = await db.transacties_archief.deleteMany({
    where: { locationid, externaltransactionid: externalId },
  });
  return result.count;
}
