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

type TransactionInput = {
  type: "in" | "out" | "In" | "Out";
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

export async function addBikeToWachtrij(bikeparkID: string, bike: BikeInput): Promise<{ id: number }> {
  const transactionDate = new Date();
  const bikeJson = JSON.stringify(bike);
  const row = await prisma.wachtrij_pasids.create({
    data: {
      transactionDate,
      bikeparkID,
      passID: bike.passID,
      barcode: bike.barcode,
      RFID: bike.RFID ?? "",
      RFIDBike: bike.RFIDBike ?? "",
      biketypeID: bike.biketypeID ?? null,
      bike: bikeJson,
    },
  });
  return { id: row.ID };
}

export async function addTransactionToWachtrij(
  bikeparkID: string,
  sectionID: string,
  tx: TransactionInput,
  placeID?: number,
  externalPlaceID?: string
): Promise<{ id: number }> {
  const transactionDate = parseDate(tx.transactionDate);
  const passID = tx.idcode ?? tx.passID ?? "";
  if (!passID) {
    throw new Error("passID or idcode required");
  }
  const passtype = tx.idtype === 1 ? "ovchip" : tx.idtype === 2 ? "barcodebike" : "sleutelhanger";
  const type = (tx.type === "in" || tx.type === "In" ? "In" : "Uit") as "In" | "Uit";
  const transactionJson = JSON.stringify(tx);

  const row = await prisma.wachtrij_transacties.create({
    data: {
      transactionDate,
      bikeparkID,
      sectionID,
      placeID: placeID ?? null,
      externalPlaceID: externalPlaceID ?? null,
      transactionID: 0,
      passID,
      passtype,
      type,
      typeCheck: tx.typeCheck ?? "user",
      price: toDecimal(tx.price),
      transaction: transactionJson,
    },
  });
  return { id: row.ID };
}

export async function addSaldoToWachtrij(bikeparkID: string, saldo: SaldoInput): Promise<{ id: number }> {
  const passID = saldo.passID ?? saldo.idcode ?? "";
  if (!passID) throw new Error("passID or idcode required");
  const paymentTypeID = saldo.paymentTypeID ?? saldo.paymenttypeid ?? 1;
  const transactionDate = parseDate(saldo.transactionDate);
  const row = await prisma.wachtrij_betalingen.create({
    data: {
      bikeparkID,
      passID,
      idtype: saldo.idtype ?? null,
      transactionDate,
      paymentTypeID,
      amount: toDecimal(saldo.amount) ?? 0,
    },
  });
  return { id: row.ID };
}

export async function addSyncToWachtrij(sync: SyncInput): Promise<{ id: number }> {
  const transactionDate = parseDate(sync.transactionDate);
  const bikesJson = JSON.stringify(sync.bikes);
  const row = await prisma.wachtrij_sync.create({
    data: {
      bikes: bikesJson,
      bikeparkID: sync.bikeparkID,
      sectionID: sync.sectionID,
      transactionDate,
    },
  });
  return { id: row.ID };
}
