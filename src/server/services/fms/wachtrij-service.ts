/**
 * Service for inserting records into wachtrij_* queue tables.
 * Records are processed by the background processor (Phase 3).
 */

import { prisma } from "~/server/db";

type BikeInput = {
  barcode: string;
  passID: string;
  RFID?: string;
  RFIDBike?: string;
  biketypeID?: number;
};

export type TransactionInput = {
  type: "in" | "out" | "In" | "Out" | "afboeking" | "Afboeking";
  typeCheck?: string;
  transactionDate: string;
  idcode?: string;
  passID?: string;
  idtype?: number;
  bikeid?: string;
  barcodeBike?: string;
  price?: number | string;
  placeID?: number;
  externalPlaceID?: string;
  paymenttypeid?: number;
  amountpaid?: number | string;
  paymentTypeID?: number;
  amountPaid?: number | string;
  clienttypeid?: number;
  [key: string]: unknown;
};

type SaldoInput = {
  passID?: string;
  idcode?: string;
  idtype?: number;
  transactionDate: string;
  paymentTypeID?: number;
  paymenttypeid?: number;
  amount: number | string;
};

type SyncInput = {
  bikes: Array<{ idcode?: string; bikeid?: string; idtype?: number; transactiondate?: string }>;
  bikeparkID: string;
  sectionID: string;
  transactionDate: string;
};

function parseDate(val: string | undefined): Date {
  if (!val) return new Date();
  const d = new Date(val);
  if (isNaN(d.getTime())) return new Date();
  return d;
}

function toDecimal(val: number | string | undefined): number | null {
  if (val === undefined || val === null) return null;
  return Number(val);
}

/**
 * When `useNewTables` is true, writes go directly into the shadow input queues
 * (`new_wachtrij_*`) instead of the production `wachtrij_*` tables. This enables a
 * truly parallel ingestion path (independent of the MySQL mirror triggers and the
 * testgemeente scope) — used for controlled archive replay without touching
 * production data or risking ColdFusion re-processing.
 */
export type WachtrijTarget = { useNewTables?: boolean };

export async function addBikeToWachtrij(
  bikeparkID: string,
  bike: BikeInput,
  opts: WachtrijTarget = {}
): Promise<{ id: number }> {
  const transactionDate = new Date();
  const bikeJson = JSON.stringify(bike);
  const data = {
    transactionDate,
    bikeparkID,
    passID: bike.passID,
    barcode: bike.barcode,
    RFID: bike.RFID ?? "",
    RFIDBike: bike.RFIDBike ?? "",
    biketypeID: bike.biketypeID ?? null,
    bike: bikeJson,
  };
  const row = opts.useNewTables
    ? await prisma.new_wachtrij_pasids.create({ data })
    : await prisma.wachtrij_pasids.create({ data });
  return { id: row.ID };
}

export async function addTransactionToWachtrij(
  bikeparkID: string,
  sectionID: string,
  tx: TransactionInput,
  placeID?: number,
  externalPlaceID?: string,
  transactionID?: number,
  opts: WachtrijTarget = {}
): Promise<{ id: number }> {
  const transactionDate = parseDate(tx.transactionDate);
  const passID = tx.idcode ?? tx.passID ?? "";
  if (!passID) {
    throw new Error("passID or idcode required");
  }
  const passtype = tx.idtype === 1 ? "ovchip" : tx.idtype === 2 ? "barcodebike" : "sleutelhanger";
  const type: string =
    tx.type === "in" || tx.type === "In"
      ? "In"
      : (tx.type === "afboeking" || tx.type === "Afboeking" ? "afboeking" : "Uit");
  const transactionJson = JSON.stringify(tx);

  const data = {
    transactionDate,
    bikeparkID,
    sectionID,
    placeID: placeID ?? null,
    externalPlaceID: externalPlaceID ?? null,
    transactionID: transactionID ?? 0,
    passID,
    passtype,
    type,
    typeCheck: tx.typeCheck ?? "user",
    price: toDecimal(tx.price),
    transaction: transactionJson,
  };
  const row = opts.useNewTables
    ? await prisma.new_wachtrij_transacties.create({ data })
    : await prisma.wachtrij_transacties.create({ data });

  // Payment at check-in: when transaction JSON has paymenttypeid + amountpaid > 0,
  // also add to wachtrij_betalingen so processor creates financialtransactions (ColdFusion parity).
  const paymentTypeID = tx.paymenttypeid ?? tx.paymentTypeID ?? 1;
  const amountpaid = Number(tx.amountpaid ?? tx.amountPaid ?? 0);
  if (paymentTypeID != null && amountpaid > 0) {
    try {
      await addSaldoToWachtrij(bikeparkID, {
        passID,
        transactionDate: tx.transactionDate ?? transactionDate.toISOString(),
        paymentTypeID,
        amount: amountpaid,
      }, opts);
    } catch (e) {
      // Duplicate (unique constraint) or other error – log but don't fail transaction insert.
      // ColdFusion addSaldoUpdateToWachtrij returns false on duplicate; transaction still succeeds.
      console.warn("Payment at check-in: could not add wachtrij_betalingen", e);
    }
  }

  return { id: row.ID };
}

export async function addSaldoToWachtrij(
  bikeparkID: string,
  saldo: SaldoInput,
  opts: WachtrijTarget = {}
): Promise<{ id: number }> {
  const passID = saldo.passID ?? saldo.idcode ?? "";
  if (!passID) throw new Error("passID or idcode required");
  const paymentTypeID = saldo.paymentTypeID ?? saldo.paymenttypeid ?? 1;
  const transactionDate = parseDate(saldo.transactionDate);
  const data = {
    bikeparkID,
    passID,
    idtype: saldo.idtype ?? null,
    transactionDate,
    paymentTypeID,
    amount: toDecimal(saldo.amount) ?? 0,
  };
  const row = opts.useNewTables
    ? await prisma.new_wachtrij_betalingen.create({ data })
    : await prisma.wachtrij_betalingen.create({ data });
  return { id: row.ID };
}

export async function addSyncToWachtrij(
  sync: SyncInput,
  opts: WachtrijTarget = {}
): Promise<{ id: number }> {
  const transactionDate = parseDate(sync.transactionDate);
  const bikesJson = JSON.stringify(sync.bikes);
  const data = {
    bikes: bikesJson,
    bikeparkID: sync.bikeparkID,
    sectionID: sync.sectionID,
    transactionDate,
  };
  const row = opts.useNewTables
    ? await prisma.new_wachtrij_sync.create({ data })
    : await prisma.wachtrij_sync.create({ data });
  return { id: row.ID };
}
