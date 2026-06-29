/**
 * Managed transaction upsert — bypasses motorblok In/Uit matching.
 * Maps payload 1:1 to transacties; upsert key = (FietsenstallingID, ExternalTransactionID).
 */

import type { PrismaClient } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";
import { getBikeparkByExternalID, getBikeparkSectionByExternalID, getPlace } from "./bikepark-service";
import { passtype2integer } from "../fms/fms-idtypes";

type Prisma = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$use" | "$extends" | "$transaction"
>;

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
  useNewTables: boolean;
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

export async function putManagedTransaction(
  tx: Prisma,
  input: PutManagedTransactionInput
): Promise<{ transactionID: number; created: boolean }> {
  validateManagedTransaction(input.managed);

  const bikepark = await getBikeparkByExternalID(input.bikeparkID);
  if (!bikepark) {
    throw new Error(`Locatie ${input.bikeparkID} niet gevonden`);
  }

  const sectionId =
    input.managed.sectionid_checkin ?? input.managed.sectionid ?? input.sectionID;
  const section = await getBikeparkSectionByExternalID(sectionId);
  if (!section) {
    throw new Error(`Sectie niet gevonden: ${sectionId}`);
  }

  if (input.managed.sectionid_out) {
    const sectionOut = await getBikeparkSectionByExternalID(input.managed.sectionid_out);
    if (!sectionOut) {
      throw new Error(`Sectie niet gevonden: ${input.managed.sectionid_out}`);
    }
  }

  if (input.managed.placeid != null) {
    const place = await getPlace(input.managed.placeid, sectionId);
    if (!place) {
      throw new Error(`Plek niet gevonden: ${input.managed.placeid}`);
    }
  }

  const transactiesModel = input.useNewTables ? tx.new_transacties : tx.transacties;
  const externalTransactionID = input.managed.externaltransactionid.trim();
  const checkindate = parseDate(input.managed.checkindate);
  const hasCheckout =
    input.managed.checkoutdate != null && String(input.managed.checkoutdate).trim() !== "";

  const rowData = {
    ZipID: bikepark.ZipID ?? null,
    FietsenstallingID: bikepark.ID,
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
      FietsenstallingID: bikepark.ID,
      ExternalTransactionID: externalTransactionID,
    },
    select: { ID: true },
  });

  if (existing) {
    await transactiesModel.update({
      where: { ID: existing.ID },
      data: rowData,
    });
    return { transactionID: existing.ID, created: false };
  }

  const created = await transactiesModel.create({ data: rowData });
  return { transactionID: created.ID, created: true };
}
