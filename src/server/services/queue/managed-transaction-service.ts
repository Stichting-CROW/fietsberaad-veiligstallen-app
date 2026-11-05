/**
 * Managed transaction upsert — bypasses motorblok In/Uit matching.
 * Maps payload 1:1 to transacties; upsert key = (FietsenstallingID, ExternalTransactionID).
 * FietsenstallingID is the short StallingsID, matching ColdFusion.
 */

import type { PrismaClient } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";
import {
  findPlacesInSections,
  getBikeparkByExternalID,
  getBikeparkSectionByExternalID,
  getPlace,
  type BikeparkBatch,
  type SectionBatch,
} from "./bikepark-service";
import { bikepassKey, findBikepassIds, getBikepassByPassId } from "./account-service";
import { passtype2integer } from "../fms/fms-idtypes";
import { updateRowsById } from "./batch-sql";
import {
  ARCHIEF_SOURCE_V4_MANAGED,
  deleteManagedTransactiesArchief,
  deleteManagedTransactiesArchiefMany,
  writeTransactiesArchiefBatch,
  writeTransactiesArchiefFromManaged,
  type WriteTransactiesArchiefInput,
} from "./transacties-archief-service";

type Prisma = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$use" | "$extends" | "$transaction"
>;

/** Queue `tx` is the generated client at runtime; this module's Prisma alias is `@prisma/client`. */
type ArchiefDb = Parameters<typeof writeTransactiesArchiefFromManaged>[0];
function archiefDb(tx: Prisma): ArchiefDb {
  return tx as unknown as ArchiefDb;
}

const CHECK_TYPES = new Set(["user", "controle", "system", "sync", "reservation"]);

export type ManagedTransactionInput = {
  externaltransactionid: string;
  idcode: string;
  idtype?: number;
  checkindate: string | Date;
  checkintype: string;
  checkoutdate?: string | Date | null;
  checkouttype?: string | null;
  stallingsduur?: number | null;
  stallingskosten?: number | string | null;
  sectionid?: string;
  sectionid_checkin?: string;
  sectionid_out?: string;
  placeid?: number | null;
  externalplaceid?: string | null;
  bikeid_in?: string | null;
  bikeid_out?: string | null;
  biketypeid?: number;
  clienttypeid?: number;
  tariefstaffels?: string | null;
  reserveringsduur?: number | null;
  passuuid?: string | null;
};

export type PutManagedTransactionInput = {
  bikeparkID: string;
  sectionID: string;
  managed: ManagedTransactionInput;
  /** Distinct stallings for this queue batch. Skips a lookup when the id is present. */
  bikeparks?: BikeparkBatch;
  /** Distinct sections for this queue batch, including sectionid_out. */
  sections?: SectionBatch;
};

function parseDate(val: string | Date | null | undefined): Date {
  if (val == null) throw new Error("Datum is verplicht");
  const d = val instanceof Date ? val : new Date(String(val));
  if (Number.isNaN(d.getTime())) throw new Error("Ongeldige datum");
  return d;
}

function toDecimal(val: number | string | null | undefined): Decimal | null {
  if (val === undefined || val === null || val === "") return null;
  return new Decimal(val);
}

export function validateManagedTransaction(managed: ManagedTransactionInput): void {
  const externalId = (managed.externaltransactionid ?? "").trim();
  if (!externalId) throw new Error("externaltransactionid is verplicht");
  if (externalId.length > 100) throw new Error("externaltransactionid max 100 tekens");

  const idcode = (managed.idcode ?? "").trim();
  if (!idcode) throw new Error("idcode is verplicht");

  if (!managed.checkindate) throw new Error("checkindate is verplicht");

  const checkintype = (managed.checkintype ?? "").toLowerCase();
  if (!CHECK_TYPES.has(checkintype)) {
    throw new Error(`checkintype '${managed.checkintype}' niet toegestaan`);
  }

  if (managed.checkoutdate != null && String(managed.checkoutdate).trim() !== "") {
    const checkouttype = (managed.checkouttype ?? "").toLowerCase();
    if (!CHECK_TYPES.has(checkouttype)) {
      throw new Error(`checkouttype '${managed.checkouttype}' niet toegestaan`);
    }
    if (managed.stallingsduur == null) throw new Error("stallingsduur is verplicht bij checkoutdate");
    if (managed.stallingskosten == null) throw new Error("stallingskosten is verplicht bij checkoutdate");

    const checkin = parseDate(managed.checkindate);
    const checkout = parseDate(managed.checkoutdate);
    if (checkout.getTime() < checkin.getTime()) {
      throw new Error("checkoutdate moet >= checkindate zijn");
    }
  }
}

/** Fill stallingsduur / stallingskosten when a client sends checkout without them. */
export function applyManagedCheckoutDefaults(managed: ManagedTransactionInput): ManagedTransactionInput {
  const next = { ...managed };
  const hasCheckout = next.checkoutdate != null && String(next.checkoutdate).trim() !== "";
  if (!hasCheckout) return next;
  if (next.checkouttype == null || String(next.checkouttype).trim() === "") {
    next.checkouttype = "user";
  }
  if (next.stallingsduur == null && next.checkindate) {
    const checkin = parseDate(next.checkindate);
    const checkout = parseDate(next.checkoutdate);
    next.stallingsduur = Math.max(0, Math.floor((checkout.getTime() - checkin.getTime()) / 60000));
  }
  if (next.stallingskosten == null) {
    next.stallingskosten = 0;
  }
  return next;
}

export async function putManagedTransaction(
  tx: Prisma,
  input: PutManagedTransactionInput
): Promise<{ transactionID: number; created: boolean }> {
  const managed = applyManagedCheckoutDefaults(input.managed);
  validateManagedTransaction(managed);
  input = { ...input, managed };

  const bikepark = await getBikeparkByExternalID(input.bikeparkID, input.bikeparks);
  if (!bikepark?.StallingsID) {
    throw new Error(`Locatie ${input.bikeparkID} niet gevonden`);
  }
  const stallingsID = bikepark.StallingsID;

  const sectionId =
    input.managed.sectionid_checkin ?? input.managed.sectionid ?? input.sectionID;
  const section = await getBikeparkSectionByExternalID(sectionId, input.sections);
  if (!section) {
    throw new Error(`Sectie niet gevonden: ${sectionId}`);
  }

  if (input.managed.sectionid_out) {
    const sectionOut = await getBikeparkSectionByExternalID(input.managed.sectionid_out, input.sections);
    if (!sectionOut) {
      throw new Error(`Sectie niet gevonden: ${input.managed.sectionid_out}`);
    }
  }

  if (input.managed.placeid != null) {
    const place = await getPlace(input.managed.placeid, sectionId, input.sections);
    if (!place) {
      throw new Error(`Plek niet gevonden: ${input.managed.placeid}`);
    }
  }

  const transactiesModel = tx.transacties;
  const externalTransactionID = input.managed.externaltransactionid.trim();
  const checkindate = parseDate(input.managed.checkindate);
  const hasCheckout =
    input.managed.checkoutdate != null && String(input.managed.checkoutdate).trim() !== "";

  const rowData = {
    ZipID: bikepark.ZipID ?? null,
    FietsenstallingID: stallingsID,
    SectieID: sectionId,
    SectieID_uit: input.managed.sectionid_out ?? null,
    PlaceID: input.managed.placeid != null ? BigInt(input.managed.placeid) : null,
    ExternalPlaceID: input.managed.externalplaceid ?? null,
    ExternalTransactionID: externalTransactionID,
    PassUUID: input.managed.passuuid ?? null,
    PasID: input.managed.idcode.trim(),
    Pastype: passtype2integer(input.managed.idtype ?? 0),
    BarcodeFiets_in: input.managed.bikeid_in ?? null,
    BarcodeFiets_uit: input.managed.bikeid_out ?? null,
    Date_checkin: checkindate,
    Date_checkout: hasCheckout ? parseDate(input.managed.checkoutdate) : null,
    Stallingsduur: hasCheckout ? input.managed.stallingsduur ?? null : null,
    Type_checkin: input.managed.checkintype.toLowerCase(),
    Type_checkout: hasCheckout ? (input.managed.checkouttype ?? "user").toLowerCase() : null,
    Stallingskosten: hasCheckout ? toDecimal(input.managed.stallingskosten) : new Decimal(0),
    Tariefstaffels: input.managed.tariefstaffels ?? null,
    BikeTypeID: input.managed.biketypeid ?? 1,
    ClientTypeID: input.managed.clienttypeid ?? 1,
    Reserveringsduur: input.managed.reserveringsduur ?? null,
    ExploitantID: bikepark.ExploitantID ?? null,
    dateModified: new Date(),
  };

  const existing = await transactiesModel.findFirst({
    where: {
      FietsenstallingID: stallingsID,
      ExternalTransactionID: externalTransactionID,
    },
    select: { ID: true },
  });

  const saved = existing
    ? await transactiesModel.update({
        where: { ID: existing.ID },
        data: rowData,
      })
    : await transactiesModel.create({ data: rowData });

  await syncParkedStateFromManaged(tx, {
    bikepark,
    stallingsID: input.bikeparkID,
    sectionID: sectionId,
    passID: input.managed.idcode.trim(),
    idtype: input.managed.idtype ?? 0,
    parked: !hasCheckout,
  });

  if (hasCheckout) {
    const citycode = (bikepark.ZipID ?? "").trim();
    if (!citycode) {
      throw new Error(`Geen citycode (ZipID) voor locatie ${stallingsID}`);
    }
    await writeTransactiesArchiefFromManaged(archiefDb(tx), {
      citycode,
      locationid: stallingsID,
      sectionid: sectionId,
      sectionidOut: input.managed.sectionid_out ?? null,
      placeid: input.managed.placeid ?? null,
      externalplaceid: input.managed.externalplaceid ?? null,
      checkindate,
      checkoutdate: parseDate(input.managed.checkoutdate),
      checkintype: input.managed.checkintype,
      checkouttype: input.managed.checkouttype ?? "user",
      price: input.managed.stallingskosten ?? 0,
      clienttypeid: input.managed.clienttypeid ?? 1,
      biketypeid: input.managed.biketypeid ?? 1,
      exploitantid: bikepark.ExploitantID ?? null,
      reservationtime: input.managed.reserveringsduur ?? null,
      source: ARCHIEF_SOURCE_V4_MANAGED,
      externaltransactionid: externalTransactionID,
      daybeginsat: bikepark.dayBeginsAt ?? undefined,
    });
  } else {
    await deleteManagedTransactiesArchief(archiefDb(tx), stallingsID, externalTransactionID);
  }

  return { transactionID: saved.ID, created: !existing };
}

function pastypeFromIdtype(idtype: number): string {
  if (idtype === 1) return "ovchip";
  if (idtype === 2) return "barcodebike";
  return "sleutelhanger";
}

/** Keep accounts_pasids parked flags in sync so occupation sync can see managed visits. */
async function syncParkedStateFromManaged(
  tx: Prisma,
  input: {
    bikepark: { SiteID: string | null };
    stallingsID: string;
    sectionID: string;
    passID: string;
    idtype: number;
    parked: boolean;
  }
): Promise<void> {
  if (!input.bikepark.SiteID) return;
  const bikepass = await getBikepassByPassId(
    tx,
    input.passID,
    input.bikepark.SiteID,
    pastypeFromIdtype(input.idtype)
  );
  await tx.accounts_pasids.update({
    where: { ID: bikepass.ID },
    data: {
      huidigeFietsenstallingId: input.parked ? input.stallingsID : null,
      huidigeSectieId: input.parked ? input.sectionID : null,
      dateModified: new Date(),
    },
  });
}

const TRANSACTIE_COLUMNS = [
  "ZipID",
  "FietsenstallingID",
  "SectieID",
  "SectieID_uit",
  "PlaceID",
  "ExternalPlaceID",
  "ExternalTransactionID",
  "PassUUID",
  "PasID",
  "Pastype",
  "BarcodeFiets_in",
  "BarcodeFiets_uit",
  "Date_checkin",
  "Date_checkout",
  "Stallingsduur",
  "Type_checkin",
  "Type_checkout",
  "Stallingskosten",
  "Tariefstaffels",
  "BikeTypeID",
  "ClientTypeID",
  "Reserveringsduur",
  "ExploitantID",
  "dateModified",
] as const;

type ManagedRowData = {
  ZipID: string | null;
  FietsenstallingID: string;
  SectieID: string;
  SectieID_uit: string | null;
  PlaceID: bigint | null;
  ExternalPlaceID: string | null;
  ExternalTransactionID: string;
  PassUUID: string | null;
  PasID: string;
  Pastype: number;
  BarcodeFiets_in: string | null;
  BarcodeFiets_uit: string | null;
  Date_checkin: Date;
  Date_checkout: Date | null;
  Stallingsduur: number | null;
  Type_checkin: string;
  Type_checkout: string | null;
  Stallingskosten: Decimal;
  Tariefstaffels: string | null;
  BikeTypeID: number;
  ClientTypeID: number;
  Reserveringsduur: number | null;
  ExploitantID: string | null;
  dateModified: Date;
};

type PlannedManaged = {
  queueID: number;
  rowData: ManagedRowData;
  hasCheckout: boolean;
  archief: WriteTransactiesArchiefInput | null;
  parked: {
    siteID: string;
    passID: string;
    pastype: string;
    stallingsID: string;
    sectionID: string;
    parked: boolean;
  } | null;
};

function managedWriteKey(row: ManagedRowData): string {
  return `${row.FietsenstallingID}\0${row.ExternalTransactionID}`;
}

/** Same checks and row shape as putManagedTransaction, without writing. */
async function planManagedWrite(input: PutManagedTransactionInput, places: Set<string>): Promise<Omit<PlannedManaged, "queueID">> {
  const managed = applyManagedCheckoutDefaults(input.managed);
  validateManagedTransaction(managed);

  const bikepark = await getBikeparkByExternalID(input.bikeparkID, input.bikeparks);
  if (!bikepark?.StallingsID) {
    throw new Error(`Locatie ${input.bikeparkID} niet gevonden`);
  }
  const stallingsID = bikepark.StallingsID;
  const sectionId = managed.sectionid_checkin ?? managed.sectionid ?? input.sectionID;
  const section = await getBikeparkSectionByExternalID(sectionId, input.sections);
  if (!section) throw new Error(`Sectie niet gevonden: ${sectionId}`);
  if (managed.sectionid_out) {
    const sectionOut = await getBikeparkSectionByExternalID(managed.sectionid_out, input.sections);
    if (!sectionOut) throw new Error(`Sectie niet gevonden: ${managed.sectionid_out}`);
  }
  if (managed.placeid != null && !places.has(`${managed.placeid}:${section.sectieId}`)) {
    throw new Error(`Plek niet gevonden: ${managed.placeid}`);
  }

  const externalTransactionID = managed.externaltransactionid.trim();
  const checkindate = parseDate(managed.checkindate);
  const hasCheckout = managed.checkoutdate != null && String(managed.checkoutdate).trim() !== "";
  const rowData: ManagedRowData = {
    ZipID: bikepark.ZipID ?? null,
    FietsenstallingID: stallingsID,
    SectieID: sectionId,
    SectieID_uit: managed.sectionid_out ?? null,
    PlaceID: managed.placeid != null ? BigInt(managed.placeid) : null,
    ExternalPlaceID: managed.externalplaceid ?? null,
    ExternalTransactionID: externalTransactionID,
    PassUUID: managed.passuuid ?? null,
    PasID: managed.idcode.trim(),
    Pastype: passtype2integer(managed.idtype ?? 0),
    BarcodeFiets_in: managed.bikeid_in ?? null,
    BarcodeFiets_uit: managed.bikeid_out ?? null,
    Date_checkin: checkindate,
    Date_checkout: hasCheckout ? parseDate(managed.checkoutdate) : null,
    Stallingsduur: hasCheckout ? managed.stallingsduur ?? null : null,
    Type_checkin: managed.checkintype.toLowerCase(),
    Type_checkout: hasCheckout ? (managed.checkouttype ?? "user").toLowerCase() : null,
    Stallingskosten: hasCheckout ? toDecimal(managed.stallingskosten) ?? new Decimal(0) : new Decimal(0),
    Tariefstaffels: managed.tariefstaffels ?? null,
    BikeTypeID: managed.biketypeid ?? 1,
    ClientTypeID: managed.clienttypeid ?? 1,
    Reserveringsduur: managed.reserveringsduur ?? null,
    ExploitantID: bikepark.ExploitantID ?? null,
    dateModified: new Date(),
  };

  let archief: WriteTransactiesArchiefInput | null = null;
  if (hasCheckout) {
    const citycode = (bikepark.ZipID ?? "").trim();
    if (!citycode) throw new Error(`Geen citycode (ZipID) voor locatie ${stallingsID}`);
    archief = {
      citycode,
      locationid: stallingsID,
      sectionid: sectionId,
      sectionidOut: managed.sectionid_out ?? null,
      placeid: managed.placeid ?? null,
      externalplaceid: managed.externalplaceid ?? null,
      checkindate,
      checkoutdate: parseDate(managed.checkoutdate),
      checkintype: managed.checkintype,
      checkouttype: managed.checkouttype ?? "user",
      price: managed.stallingskosten ?? 0,
      clienttypeid: managed.clienttypeid ?? 1,
      biketypeid: managed.biketypeid ?? 1,
      exploitantid: bikepark.ExploitantID ?? null,
      reservationtime: managed.reserveringsduur ?? null,
      source: ARCHIEF_SOURCE_V4_MANAGED,
      externaltransactionid: externalTransactionID,
      daybeginsat: bikepark.dayBeginsAt ?? undefined,
    };
  }

  const parked = bikepark.SiteID
    ? {
        siteID: bikepark.SiteID,
        passID: managed.idcode.trim(),
        pastype: pastypeFromIdtype(managed.idtype ?? 0),
        stallingsID: input.bikeparkID,
        sectionID: sectionId,
        parked: !hasCheckout,
      }
    : null;

  return { rowData, hasCheckout, archief, parked };
}

async function upsertTransactiesBatch(tx: Prisma, rows: ManagedRowData[]): Promise<void> {
  if (rows.length === 0) return;
  const params: unknown[] = [];
  const tuples = rows.map((row) => {
    const values = TRANSACTIE_COLUMNS.map((column) => {
      const value = row[column];
      if (column === "Stallingskosten") return value instanceof Decimal ? value.toString() : value;
      if (column === "PlaceID") return value == null ? null : value.toString();
      return value;
    });
    params.push(...values);
    return `(${TRANSACTIE_COLUMNS.map(() => "?").join(",")})`;
  });
  const updates = TRANSACTIE_COLUMNS.filter(
    (column) => column !== "FietsenstallingID" && column !== "ExternalTransactionID"
  ).map((column) => `\`${column}\` = newrow.\`${column}\``);
  const sql =
    `INSERT INTO transacties (${TRANSACTIE_COLUMNS.map((column) => `\`${column}\``).join(",")}) ` +
    `VALUES ${tuples.join(",")} AS newrow ON DUPLICATE KEY UPDATE ${updates.join(",")}`;
  await (tx as unknown as { $executeRawUnsafe: (query: string, ...values: unknown[]) => Promise<unknown> }).$executeRawUnsafe(
    sql,
    ...params
  );
}

/**
 * Write a managed-transaction batch in a handful of statements.
 * Rows that fail validation are returned; the rest are upserted.
 * A later row with the same stalling and externaltransactionid wins.
 */
export async function putManagedTransactionsBatch(
  tx: Prisma,
  items: { queueID: number; input: PutManagedTransactionInput }[]
): Promise<{ ok: number[]; failed: { queueID: number; error: string }[] }> {
  const failed: { queueID: number; error: string }[] = [];
  if (items.length === 0) return { ok: [], failed };

  const placePairs: { placeId: number; sectieId: number }[] = [];
  for (const item of items) {
    const managed = item.input.managed;
    const sectionId = managed.sectionid_checkin ?? managed.sectionid ?? item.input.sectionID;
    const section = item.input.sections?.get(sectionId);
    if (managed.placeid != null && section) {
      placePairs.push({ placeId: managed.placeid, sectieId: section.sectieId });
    }
  }
  const places = await findPlacesInSections(placePairs);

  const planned: PlannedManaged[] = [];
  for (const item of items) {
    try {
      planned.push({ queueID: item.queueID, ...(await planManagedWrite(item.input, places)) });
    } catch (e) {
      failed.push({ queueID: item.queueID, error: e instanceof Error ? e.message : String(e) });
    }
  }

  const passIds = await findBikepassIds(
    tx,
    planned.flatMap((item) =>
      item.parked ? [{ siteID: item.parked.siteID, passID: item.parked.passID, pastype: item.parked.pastype }] : []
    )
  );
  const writable: PlannedManaged[] = [];
  for (const item of planned) {
    if (!item.parked) {
      writable.push(item);
      continue;
    }
    const key = bikepassKey(item.parked.siteID, item.parked.passID, item.parked.pastype);
    if (passIds.has(key)) {
      writable.push(item);
      continue;
    }
    try {
      const created = await getBikepassByPassId(tx, item.parked.passID, item.parked.siteID, item.parked.pastype);
      passIds.set(key, created.ID);
      writable.push(item);
    } catch (e) {
      failed.push({ queueID: item.queueID, error: e instanceof Error ? e.message : String(e) });
    }
  }

  const byVisit = new Map<string, PlannedManaged>();
  const okIds = new Set<number>();
  for (const item of writable) {
    byVisit.set(managedWriteKey(item.rowData), item);
    okIds.add(item.queueID);
  }
  const visits = [...byVisit.values()];
  const ok = [...okIds];

  await upsertTransactiesBatch(tx, visits.map((item) => item.rowData));
  await writeTransactiesArchiefBatch(
    archiefDb(tx),
    visits.flatMap((item) => (item.archief ? [item.archief] : []))
  );
  await deleteManagedTransactiesArchiefMany(
    archiefDb(tx),
    visits.flatMap((item) =>
      item.hasCheckout
        ? []
        : [{ locationid: item.rowData.FietsenstallingID, externaltransactionid: item.rowData.ExternalTransactionID }]
    )
  );

  const now = new Date();
  await updateRowsById(
    tx as unknown as Parameters<typeof updateRowsById>[0],
    "accounts_pasids",
    "ID",
    visits.flatMap((item) => {
      if (!item.parked) return [];
      const id = passIds.get(bikepassKey(item.parked.siteID, item.parked.passID, item.parked.pastype));
      if (!id) return [];
      return [{
        id,
        set: {
          huidigeFietsenstallingId: item.parked.parked ? item.parked.stallingsID : null,
          huidigeSectieId: item.parked.parked ? item.parked.sectionID : null,
        },
      }];
    }),
    { dateModified: now }
  );

  return { ok, failed };
}
