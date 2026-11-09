/**
 * Service for inserting records into new_wachtrij_* queue tables.
 * Records are processed by the Next.js queue processor.
 */

import { prisma } from "~/server/db";
import {
  managedOccupationDeltas,
  managedVisitFromPayload,
  managedVisitFromTransactie,
  type ManagedVisitState,
} from "./managed-occupation";

type BikeInput = {
  barcode: string;
  passID: string;
  RFID?: string;
  RFIDBike?: string;
  biketypeID?: number;
  /** ISO timestamp; default is slightly in the past for immediate queue pickup. */
  transactionDate?: string;
};

export type TransactionInput = {
  type: "in" | "out" | "In" | "Out" | "uit" | "Uit" | "afboeking" | "Afboeking";
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

/**
 * Timestamp for wachtrij rows. Slightly in the past so the queue processor
 * (`transactionDate <= NOW()`) picks up rows immediately after insert, even when
 * Node and MySQL clocks differ by a second or TIMESTAMP rounds up.
 */
function wachtrijTransactionDate(explicit?: string): Date {
  if (explicit) return parseDate(explicit);
  return new Date(Date.now() - 2000);
}

function parseDate(val: string | undefined): Date {
  if (!val) return wachtrijTransactionDate();
  const d = new Date(val);
  if (isNaN(d.getTime())) return wachtrijTransactionDate();
  return d;
}

function toDecimal(val: number | string | undefined): number | null {
  if (val === undefined || val === null) return null;
  return Number(val);
}

/** Next.js FMS host always enqueues `new_wachtrij_*` (ColdFusion keeps `wachtrij_*`). */

export async function addBikeToWachtrij(
  bikeparkID: string,
  bike: BikeInput
): Promise<{ id: number }> {
  const transactionDate = bike.transactionDate
    ? parseDate(bike.transactionDate)
    : wachtrijTransactionDate();
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
  const existing = await prisma.new_wachtrij_pasids.findFirst({
    where: {
      transactionDate,
      bikeparkID,
      passID: bike.passID,
      barcode: bike.barcode,
    },
    select: { ID: true },
  });
  if (existing) return { id: existing.ID };
  const row = await prisma.new_wachtrij_pasids.create({ data });
  return { id: row.ID };
}

// FUTURE REFERENCE — DO NOT DELETE (In/Uit / ColdFusion parity).
// Keep this commented block; do not remove it as unused code.
// v4 check-in/out uses addManagedTransactionToWachtrij / new_wachtrij_managed_transacties.
// export async function addTransactionToWachtrij(
//   bikeparkID: string,
//   sectionID: string,
//   tx: TransactionInput,
//   placeID?: number,
//   externalPlaceID?: string,
//   transactionID?: number
// ): Promise<{ id: number }> {
//   const transactionDate = parseDate(tx.transactionDate);
//   const passID = tx.idcode ?? tx.passID ?? "";
//   if (!passID) {
//     throw new Error("passID or idcode required");
//   }
//   const passtype = tx.idtype === 1 ? "ovchip" : tx.idtype === 2 ? "barcodebike" : "sleutelhanger";
//   const type: string =
//     tx.type === "in" || tx.type === "In"
//       ? "In"
//       : tx.type === "afboeking" || tx.type === "Afboeking"
//         ? "afboeking"
//         : "Uit";
//   const transactionJson = JSON.stringify(tx);
//   const data = {
//     transactionDate,
//     bikeparkID,
//     sectionID,
//     placeID: placeID ?? null,
//     externalPlaceID: externalPlaceID ?? null,
//     transactionID: transactionID ?? 0,
//     passID,
//     passtype,
//     type,
//     typeCheck: tx.typeCheck ?? "user",
//     price: toDecimal(tx.price),
//     transaction: transactionJson,
//   };
//   const row = await prisma.new_wachtrij_transacties.create({ data });
//   const paymentTypeID = tx.paymenttypeid ?? tx.paymentTypeID ?? 1;
//   const amountpaid = Number(tx.amountpaid ?? tx.amountPaid ?? 0);
//   if (paymentTypeID != null && amountpaid > 0) {
//     try {
//       await addSaldoToWachtrij(bikeparkID, {
//         passID,
//         transactionDate: tx.transactionDate ?? transactionDate.toISOString(),
//         paymentTypeID,
//         amount: amountpaid,
//       });
//     } catch (e) {
//       console.warn("Payment at check-in: could not add wachtrij_betalingen", e);
//     }
//   }
//   return { id: row.ID };
// }

export async function addSaldoToWachtrij(
  bikeparkID: string,
  saldo: SaldoInput
): Promise<{ id: number }> {
  const passID = saldo.passID ?? saldo.idcode ?? "";
  if (!passID) throw new Error("passID or idcode required");
  const paymentTypeID = saldo.paymentTypeID ?? saldo.paymenttypeid ?? 1;
  const transactionDate = parseDate(saldo.transactionDate);
  const amount = toDecimal(saldo.amount) ?? 0;
  const data = {
    bikeparkID,
    passID,
    idtype: saldo.idtype ?? null,
    transactionDate,
    paymentTypeID,
    amount,
  };
  const existing = await prisma.new_wachtrij_betalingen.findFirst({
    where: {
      bikeparkID,
      passID,
      transactionDate,
      paymentTypeID,
      amount,
    },
    select: { ID: true },
  });
  if (existing) return { id: existing.ID };
  const row = await prisma.new_wachtrij_betalingen.create({ data });
  return { id: row.ID };
}

export type ManagedTransactionPayload = Record<string, unknown>;

export async function addManagedTransactionToWachtrij(
  bikeparkID: string,
  sectionID: string,
  managed: ManagedTransactionPayload
): Promise<{ id: number }> {
  const externalTransactionID = String(
    managed.externaltransactionid ?? managed.externalTransactionID ?? ""
  ).trim();
  if (!externalTransactionID) {
    throw new Error("externaltransactionid is verplicht");
  }

  const payload = JSON.stringify({ ...managed, sectionid: managed.sectionid ?? sectionID });
  const data = {
    bikeparkID,
    externalTransactionID,
    payload,
  };
  const row = await prisma.new_wachtrij_managed_transacties.create({ data });
  try {
    await applyManagedOccupation({
      bikeparkID,
      sectionID,
      managed,
      externalTransactionID,
      queueId: row.ID,
    });
  } catch (e) {
    console.warn("Managed transaction: bezetting niet bijgewerkt", e);
  }
  return { id: row.ID };
}

/**
 * Move section occupation by what this queued managed transaction changes in
 * the visit: +1 on the check-in section when a visit opens, −1 on the
 * check-out section when it closes. Only for stallingen whose occupation
 * source is FMS. processQueues leaves Bezetting unchanged.
 *
 * The visit before this message is the newest earlier queue row for the same
 * external id (lower ID), else the transacties row, so a resend of the same
 * state moves nothing.
 */
async function applyManagedOccupation(input: {
  bikeparkID: string;
  sectionID: string;
  managed: ManagedTransactionPayload;
  externalTransactionID: string;
  queueId: number;
}): Promise<void> {
  const stalling = await prisma.fietsenstallingen.findFirst({
    where: { StallingsID: input.bikeparkID },
    select: { BronBezettingsdata: true },
  });
  if (stalling?.BronBezettingsdata !== "FMS") return;

  const after = managedVisitFromPayload(input.managed, input.sectionID);
  const before = await managedVisitBefore(input);
  const deltas = managedOccupationDeltas(before, after);

  for (const [sectionID, delta] of deltas) {
    const where = {
      externalId: sectionID,
      fietsenstalling: { StallingsID: input.bikeparkID },
    };
    if (delta > 0) {
      await prisma.fietsenstalling_sectie.updateMany({
        where,
        data: { Bezetting: { increment: delta } },
      });
    } else {
      for (let i = 0; i < -delta; i++) {
        await prisma.fietsenstalling_sectie.updateMany({
          where: { ...where, Bezetting: { gt: 0 } },
          data: { Bezetting: { decrement: 1 } },
        });
      }
    }
  }
}

async function managedVisitBefore(input: {
  bikeparkID: string;
  sectionID: string;
  externalTransactionID: string;
  queueId: number;
}): Promise<ManagedVisitState | null> {
  const priorQueue = await prisma.new_wachtrij_managed_transacties.findFirst({
    where: {
      bikeparkID: input.bikeparkID,
      externalTransactionID: input.externalTransactionID,
      ID: { lt: input.queueId },
    },
    orderBy: { ID: "desc" },
    select: { payload: true },
  });
  if (priorQueue) {
    const payload = parseManagedQueuePayload(priorQueue.payload);
    if (payload) return managedVisitFromPayload(payload, input.sectionID);
  }

  const existingTx = await prisma.transacties.findFirst({
    where: {
      FietsenstallingID: input.bikeparkID,
      ExternalTransactionID: input.externalTransactionID,
    },
    select: { SectieID: true, SectieID_uit: true, Date_checkout: true },
  });
  return existingTx ? managedVisitFromTransactie(existingTx) : null;
}

function parseManagedQueuePayload(payload: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(payload) as unknown;
    if (parsed == null || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

export async function addSyncToWachtrij(sync: SyncInput): Promise<{ id: number }> {
  const transactionDate = parseDate(sync.transactionDate);
  const bikesJson = JSON.stringify(sync.bikes);
  const data = {
    bikes: bikesJson,
    bikeparkID: sync.bikeparkID,
    sectionID: sync.sectionID,
    transactionDate,
  };
  const row = await prisma.new_wachtrij_sync.create({ data });
  return { id: row.ID };
}
