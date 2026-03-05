/**
 * Transaction (putTransaction) logic for queue processor.
 * Mirrors ColdFusion TransactionGateway.putTransaction.
 */

import type { PrismaClient } from "@prisma/client";
import { prisma } from "~/server/db";
import { fetchTariefregelsForStalling } from "../tarieven";
import { getBikepassByPassId, type BikepassInfo } from "./account-service";
import type { BikeparkInfo, SectionInfo } from "./bikepark-service";

type Prisma = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$use" | "$extends" | "$transaction"
>;

export type PutTransactionInput = {
  bikeparkID: string;
  stallingID: string;
  siteID: string;
  sectionID: string;
  sectionSectieId: number;
  bikepass: BikepassInfo;
  type: "In" | "Uit";
  typeCheck: string;
  transactionDate: Date;
  placeID?: number | null;
  externalPlaceID?: string | null;
  barcodeBike?: string | null;
  bikeTypeID?: number;
  clientTypeID?: number;
  price?: number | null;
  zipID?: string | null;
  exploitantID?: string | null;
  berekentStallingskosten: boolean;
  useNewTables: boolean;
};

/** Input for close-by-ID (afboeking). Lookup transacties by ID and perform checkout. */
export type PutTransactionByIDInput = {
  transactionID: number;
  transactionDate: Date;
  bikeparkID: string;
  stallingID: string;
  siteID: string;
  sectionID: string;
  typeCheck: string;
  berekentStallingskosten: boolean;
  useNewTables: boolean;
};

/** Result of cost calculation: amount and serialized tariff steps for transacties.Tariefstaffels */
export type StallingskostenResult = {
  stallingskosten: number;
  tariefstaffels: string | null;
};

const TARIEFSTAFFELS_MAX_LENGTH = 255;

/** Parsed tariff step: TIMESPAN in hours, COST per period. */
type TariefstaffelStep = { TIMESPAN: number; COST: number };

/**
 * Parse Tariefstaffels JSON from transacties.Tariefstaffels.
 * Format: [{"TIMESPAN":1,"COST":0.01},{"TIMESPAN":24,"COST":0.02}]
 */
function parseTariefstaffels(tariefstaffels: string | null): TariefstaffelStep[] {
  if (!tariefstaffels || !tariefstaffels.trim()) return [];
  try {
    const arr = JSON.parse(tariefstaffels) as unknown;
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((t): t is TariefstaffelStep => t != null && typeof t === "object" && "TIMESPAN" in t && "COST" in t)
      .map((t) => ({ TIMESPAN: Number(t.TIMESPAN) || 0, COST: Number(t.COST) || 0 }));
  } catch {
    return [];
  }
}

/**
 * Get cost for the current period and next afboeking date (Phase 2).
 * When tariefstaffels has multiple periods, we charge one period at a time.
 * Returns cost for the period we're completing, and the date for the next scheduled afboeking.
 */
function getAfboekingPeriodInfo(
  dateCheckin: Date,
  stallingsduurMinutes: number,
  steps: TariefstaffelStep[]
): { costForThisPeriod: number; nextDate: Date | null; isLastPeriod: boolean } {
  if (!steps || steps.length === 0) {
    return { costForThisPeriod: 0, nextDate: null, isLastPeriod: true };
  }
  if (steps.length === 1) {
    const cost = steps[0]!.COST;
    const timespanMinutes = (steps[0]!.TIMESPAN || 24) * 60;
    const periodsCompleted = Math.floor(stallingsduurMinutes / timespanMinutes);
    if (periodsCompleted < 1) return { costForThisPeriod: 0, nextDate: null, isLastPeriod: true };
    const nextBoundaryMinutes = (periodsCompleted + 1) * timespanMinutes;
    const nextDate = new Date(dateCheckin.getTime() + nextBoundaryMinutes * 60000);
    return { costForThisPeriod: cost, nextDate, isLastPeriod: false };
  }

  const cumulativeMinutes: number[] = [];
  let sum = 0;
  for (const s of steps) {
    const m = (s.TIMESPAN || 24) * 60;
    if (m <= 0) continue;
    sum += m;
    cumulativeMinutes.push(sum);
  }
  if (cumulativeMinutes.length === 0) return { costForThisPeriod: 0, nextDate: null, isLastPeriod: true };

  let periodsCompleted = 0;
  for (let i = 0; i < cumulativeMinutes.length; i++) {
    if (stallingsduurMinutes >= cumulativeMinutes[i]!) periodsCompleted = i + 1;
  }
  if (periodsCompleted === 0) {
    const nextDate = new Date(dateCheckin.getTime() + cumulativeMinutes[0]! * 60000);
    return { costForThisPeriod: 0, nextDate, isLastPeriod: false };
  }

  const costForThisPeriod = steps[periodsCompleted - 1]!.COST;
  const lastCumulative = cumulativeMinutes[cumulativeMinutes.length - 1]!;
  const lastStep = steps[steps.length - 1]!;
  const lastTimespanMinutes = (lastStep.TIMESPAN || 24) * 60;

  let nextBoundaryMinutes: number;
  if (periodsCompleted < cumulativeMinutes.length) {
    nextBoundaryMinutes = cumulativeMinutes[periodsCompleted]!;
  } else {
    nextBoundaryMinutes = lastCumulative + lastTimespanMinutes;
  }
  const nextDate = new Date(dateCheckin.getTime() + nextBoundaryMinutes * 60000);
  const isLastPeriod = false;
  return { costForThisPeriod, nextDate, isLastPeriod };
}

/**
 * Serialize tariff steps to Tariefstaffels format (ColdFusion-compatible).
 * Format: [{"TIMESPAN":1,"COST":0.01},{"TIMESPAN":24,"COST":0.02}]
 * TIMESPAN = tijdsspanne (hours), COST = kosten. Truncated to 255 chars.
 */
function serializeTariefstaffels(
  tariffs: { tijdsspanne: number | null; kosten: number | null }[]
): string | null {
  if (!tariffs || tariffs.length === 0) return null;
  const arr = tariffs.map((t) => ({
    TIMESPAN: t.tijdsspanne ?? 0,
    COST: t.kosten ?? 0,
  }));
  const json = JSON.stringify(arr);
  return json.length > TARIEFSTAFFELS_MAX_LENGTH ? json.slice(0, TARIEFSTAFFELS_MAX_LENGTH) : json;
}

/**
 * Calculate Stallingskosten from tariefregels for given stallingsduur (minutes).
 * Sum of tariff costs for complete periods fitting in Stallingsduur.
 * Returns both the cost and serialized tariff steps (Tariefstaffels).
 */
async function calculateStallingskosten(
  stallingId: string,
  stallingsduurMinutes: number,
  bikeTypeID: number
): Promise<StallingskostenResult> {
  const { tariffs } = await fetchTariefregelsForStalling(stallingId);
  if (!tariffs || tariffs.length === 0) {
    return { stallingskosten: 0, tariefstaffels: null };
  }

  let total = 0;
  let remainingMinutes = stallingsduurMinutes;

  for (const t of tariffs) {
    if (remainingMinutes <= 0) break;
    const tijdsspanneHours = t.tijdsspanne ?? 0;
    const tijdsspanneMinutes = tijdsspanneHours * 60;
    const kosten = t.kosten ? Number(t.kosten) : 0;

    if (tijdsspanneMinutes <= 0) continue;

    const periods = Math.floor(remainingMinutes / tijdsspanneMinutes);
    if (periods > 0) {
      total += periods * kosten;
      remainingMinutes -= periods * tijdsspanneMinutes;
    }
  }

  const stallingskosten = Math.round(total * 100) / 100;
  const tariefstaffels = serializeTariefstaffels(tariffs);
  return { stallingskosten, tariefstaffels };
}

/**
 * putTransaction: INSERT or UPDATE transacties for check-in/check-out.
 * Handles: normal in/out, checkout without check-in (synthetic), double check-in, overlap.
 */
export async function putTransaction(
  tx: Prisma,
  input: PutTransactionInput
): Promise<{ transactionID: number; stallingskosten: number }> {
  const transactiesModel = input.useNewTables ? tx.new_transacties : tx.transacties;
  const pasidsModel = input.useNewTables ? tx.new_accounts_pasids : tx.accounts_pasids;
  const accountsModel = input.useNewTables ? tx.new_accounts : tx.accounts;
  const ftModel = input.useNewTables ? tx.new_financialtransactions : tx.financialtransactions;

  const typeCheck = input.typeCheck === "section" ? "user" : input.typeCheck;

  if (input.type === "In") {
    // Check for existing record (double check-in): sync/system with Date_checkout >= transactionDate
    const existingForRecheck = await transactiesModel.findFirst({
      where: {
        PasID: input.bikepass.PasID,
        SectieID: input.sectionID,
        Date_checkout: { gte: input.transactionDate },
        Type_checkin: { in: ["sync", "system"] },
      },
      orderBy: { Date_checkin: "desc" },
    });

    if (existingForRecheck) {
      await transactiesModel.update({
        where: { ID: existingForRecheck.ID },
        data: {
          Type_checkin: typeCheck,
          Date_checkin: input.transactionDate,
          SectieID: input.sectionID,
          PlaceID: input.placeID != null ? BigInt(input.placeID) : null,
          ExternalPlaceID: input.externalPlaceID ?? null,
          BarcodeFiets_in: input.barcodeBike ?? existingForRecheck.BarcodeFiets_in,
          BikeTypeID: input.bikeTypeID ?? existingForRecheck.BikeTypeID,
          dateModified: new Date(),
        },
      });

      await pasidsModel.update({
        where: { ID: input.bikepass.ID },
        data: {
          huidigeFietsenstallingId: input.bikeparkID,
          huidigeSectieId: input.sectionID,
          dateLastCheck: input.transactionDate,
          typeLastCheckin: typeCheck,
          dateModified: new Date(),
        },
      });

      return { transactionID: existingForRecheck.ID, stallingskosten: 0 };
    }

    // Close any overlapping open transactions (overlap case)
    const openTx = await transactiesModel.findMany({
      where: {
        PasID: input.bikepass.PasID,
        Date_checkout: null,
      },
    });

    for (const ot of openTx) {
      const stallingsduur = Math.floor(
        (input.transactionDate.getTime() - ot.Date_checkin.getTime()) / 60000
      );
      const costResult = input.berekentStallingskosten
        ? await calculateStallingskosten(input.stallingID, stallingsduur, ot.BikeTypeID ?? 1)
        : { stallingskosten: Number(input.price ?? 0), tariefstaffels: null as string | null };
      const stallingskosten = costResult.stallingskosten;

      await transactiesModel.update({
        where: { ID: ot.ID },
        data: {
          Date_checkout: input.transactionDate,
          Type_checkout: typeCheck,
          SectieID_uit: input.sectionID,
          BarcodeFiets_uit: ot.BarcodeFiets_in ?? undefined,
          Stallingsduur: stallingsduur,
          Stallingskosten: stallingskosten,
          Tariefstaffels: costResult.tariefstaffels,
          dateModified: new Date(),
        },
      });

      if (input.bikepass.AccountID && stallingskosten > 0) {
        const acc = await accountsModel.findUnique({
          where: { ID: input.bikepass.AccountID },
          select: { saldo: true },
        });
        if (acc) {
          await accountsModel.update({
            where: { ID: input.bikepass.AccountID },
            data: {
              saldo: Number(acc.saldo ?? 0) - stallingskosten,
              dateLastSaldoUpdate: new Date(),
            },
          });
        }
        await ftModel.create({
          data: {
            ID: crypto.randomUUID().replace(/-/g, ""),
            accountID: input.bikepass.AccountID,
            amount: stallingskosten,
            transactionDate: input.transactionDate,
            siteID: input.siteID,
            bikeparkID: input.bikeparkID,
            sectionID: input.sectionID,
            transactionID: ot.ID,
            paymentMethod: "stallingskosten",
            code: "stallingskosten",
            status: "completed",
          },
        });
      }

      await pasidsModel.update({
        where: { ID: input.bikepass.ID },
        data: {
          huidigeFietsenstallingId: null,
          huidigeSectieId: null,
          transactionID: ot.ID,
          dateModified: new Date(),
        },
      });
    }

    // INSERT new check-in
    const created = await transactiesModel.create({
      data: {
        FietsenstallingID: input.stallingID,
        SectieID: input.sectionID,
        PasID: input.bikepass.PasID,
        Pastype: pastypeToInt(input.bikepass.Pastype),
        Date_checkin: input.transactionDate,
        Type_checkin: typeCheck,
        PlaceID: input.placeID != null ? BigInt(input.placeID) : null,
        ExternalPlaceID: input.externalPlaceID ?? null,
        BarcodeFiets_in: input.barcodeBike ?? null,
        BikeTypeID: input.bikeTypeID ?? 1,
        ClientTypeID: input.clientTypeID ?? 1,
        ZipID: input.zipID ?? null,
        ExploitantID: input.exploitantID ?? null,
      },
    });

    await pasidsModel.update({
      where: { ID: input.bikepass.ID },
      data: {
        huidigeFietsenstallingId: input.bikeparkID,
        huidigeSectieId: input.sectionID,
        barcodeFiets: input.barcodeBike ?? undefined,
        dateLastCheck: input.transactionDate,
        typeLastCheckin: typeCheck,
        transactionID: null,
        dateModified: new Date(),
      },
    });

    return { transactionID: created.ID, stallingskosten: 0 };
  }

  // type === "Uit"
  const openTx = await transactiesModel.findFirst({
    where: {
      PasID: input.bikepass.PasID,
      Date_checkout: null,
    },
    orderBy: { Date_checkin: "desc" },
  });

  if (!openTx) {
    // Checkout without check-in: INSERT synthetic record with Date_checkin = Date_checkout = transactionDate
    const stallingskosten = input.berekentStallingskosten ? 0 : Number(input.price ?? 0);
    const created = await transactiesModel.create({
      data: {
        FietsenstallingID: input.stallingID,
        SectieID: input.sectionID,
        SectieID_uit: input.sectionID,
        PasID: input.bikepass.PasID,
        Pastype: pastypeToInt(input.bikepass.Pastype),
        Date_checkin: input.transactionDate,
        Date_checkout: input.transactionDate,
        Type_checkin: "system",
        Type_checkout: typeCheck,
        Stallingsduur: 0,
        Stallingskosten: stallingskosten,
        BarcodeFiets_uit: input.barcodeBike ?? null,
        BikeTypeID: input.bikeTypeID ?? 1,
        ClientTypeID: input.clientTypeID ?? 1,
        ZipID: input.zipID ?? null,
        ExploitantID: input.exploitantID ?? null,
      },
    });

    return { transactionID: created.ID, stallingskosten };
  }

  // Clamp to [0, max]: UNSIGNED INT rejects negatives; simulation clock can go backwards
  const rawMinutes = Math.floor(
    (input.transactionDate.getTime() - openTx.Date_checkin.getTime()) / 60000
  );
  const stallingsduur = Math.max(0, Math.min(rawMinutes, 4294967295));
  const costResult = input.berekentStallingskosten
    ? await calculateStallingskosten(input.stallingID, stallingsduur, openTx.BikeTypeID ?? 1)
    : { stallingskosten: Number(input.price ?? 0), tariefstaffels: null as string | null };
  const stallingskosten = costResult.stallingskosten;

  await transactiesModel.update({
    where: { ID: openTx.ID },
    data: {
      Date_checkout: input.transactionDate,
      Type_checkout: typeCheck,
      SectieID_uit: input.sectionID,
      BarcodeFiets_uit: input.barcodeBike ?? openTx.BarcodeFiets_uit,
      Stallingsduur: stallingsduur,
      Stallingskosten: stallingskosten,
      Tariefstaffels: costResult.tariefstaffels,
      dateModified: new Date(),
    },
  });

  if (input.bikepass.AccountID && stallingskosten > 0) {
    const acc = await accountsModel.findUnique({
      where: { ID: input.bikepass.AccountID },
      select: { saldo: true },
    });
    if (acc) {
      await accountsModel.update({
        where: { ID: input.bikepass.AccountID },
        data: {
          saldo: Number(acc.saldo ?? 0) - stallingskosten,
          dateLastSaldoUpdate: new Date(),
        },
      });
    }

    await ftModel.create({
      data: {
        ID: crypto.randomUUID().replace(/-/g, ""),
        accountID: input.bikepass.AccountID,
        amount: stallingskosten,
        transactionDate: input.transactionDate,
        siteID: input.siteID,
        bikeparkID: input.bikeparkID,
        sectionID: input.sectionID,
        transactionID: openTx.ID,
        paymentMethod: "stallingskosten",
        code: "stallingskosten",
        status: "completed",
      },
    });
  }

  await pasidsModel.update({
    where: { ID: input.bikepass.ID },
    data: {
      huidigeFietsenstallingId: null,
      huidigeSectieId: null,
      huidigeStallingskosten: stallingskosten,
      transactionID: openTx.ID,
      dateLastCheck: input.transactionDate,
      dateModified: new Date(),
    },
  });

  return { transactionID: openTx.ID, stallingskosten };
}

/**
 * Schedule next afboeking to wachtrij_transacties (Phase 2).
 * Inserts a row that the processor will pick up; trigger mirrors to new_wachtrij_transacties.
 */
export async function scheduleAfboekingToWachtrij(
  tx: Prisma,
  params: {
    transactionID: number;
    transactionDate: Date;
    bikeparkID: string;
    sectionID: string;
    passID: string;
    passtype: string;
    typeCheck: string;
  }
): Promise<void> {
  const wachtrijModel = (tx as unknown as { wachtrij_transacties: { create: (args: { data: Record<string, unknown> }) => Promise<unknown> } }).wachtrij_transacties;
  const transactionJson = JSON.stringify({
    type: "afboeking",
    typeCheck: params.typeCheck,
    transactionDate: params.transactionDate.toISOString(),
    passID: params.passID,
    transactionID: String(params.transactionID),
    sectionID: params.sectionID,
  });
  await wachtrijModel.create({
    data: {
      transactionDate: params.transactionDate,
      bikeparkID: params.bikeparkID,
      sectionID: params.sectionID,
      placeID: null,
      externalPlaceID: null,
      transactionID: params.transactionID,
      passID: params.passID,
      passtype: params.passtype,
      type: "afboeking",
      typeCheck: params.typeCheck,
      price: null,
      transaction: transactionJson,
    },
  });
}

/**
 * putTransactionByID: Close or add periodic charge to transacties by ID (afboeking).
 * Used when wachtrij_transacties.transactionID ≠ 0.
 * Phase 1: Single tariff period → close transactie.
 * Phase 2: Multiple tariff periods → charge for one period, schedule next afboeking, do NOT close.
 */
export async function putTransactionByID(
  tx: Prisma,
  input: PutTransactionByIDInput
): Promise<{ transactionID: number; stallingskosten: number }> {
  const transactiesModel = input.useNewTables ? tx.new_transacties : tx.transacties;
  const pasidsModel = input.useNewTables ? tx.new_accounts_pasids : tx.accounts_pasids;
  const accountsModel = input.useNewTables ? tx.new_accounts : tx.accounts;
  const ftModel = input.useNewTables ? tx.new_financialtransactions : tx.financialtransactions;

  const openTx = await transactiesModel.findUnique({
    where: { ID: input.transactionID },
  });

  if (!openTx) {
    throw new Error(`Transactie niet gevonden: ID ${input.transactionID}`);
  }
  if (openTx.Date_checkout != null) {
    throw new Error(`Transactie ${input.transactionID} is al afgesloten`);
  }

  const typeCheck = input.typeCheck === "section" ? "user" : input.typeCheck;
  const pastype = pastypeFromInt(openTx.Pastype ?? 0);
  const bikepass = await getBikepassByPassId(
    tx,
    openTx.PasID,
    input.siteID,
    pastype,
    input.useNewTables
  );

  const rawMinutes = Math.floor(
    (input.transactionDate.getTime() - openTx.Date_checkin.getTime()) / 60000
  );
  const stallingsduur = Math.max(0, Math.min(rawMinutes, 4294967295));

  let stallingskosten: number;
  let tariefstaffels: string | null;
  let shouldClose: boolean;
  let nextAfboekingDate: Date | null = null;

  if (input.berekentStallingskosten) {
    const costResult = await calculateStallingskosten(input.stallingID, stallingsduur, openTx.BikeTypeID ?? 1);
    tariefstaffels = costResult.tariefstaffels;
    const steps = parseTariefstaffels(tariefstaffels ?? openTx.Tariefstaffels);
    if (steps.length > 1) {
      const periodInfo = getAfboekingPeriodInfo(openTx.Date_checkin, stallingsduur, steps);
      stallingskosten = periodInfo.costForThisPeriod;
      shouldClose = false;
      nextAfboekingDate = periodInfo.nextDate;
    } else {
      stallingskosten = costResult.stallingskosten;
      shouldClose = true;
      nextAfboekingDate = null;
    }
  } else {
    stallingskosten = 0;
    tariefstaffels = openTx.Tariefstaffels;
    shouldClose = true;
  }

  const accumulatedStallingskosten = Number(openTx.Stallingskosten ?? 0) + stallingskosten;

  if (shouldClose) {
    await transactiesModel.update({
      where: { ID: openTx.ID },
      data: {
        Date_checkout: input.transactionDate,
        Type_checkout: typeCheck,
        SectieID_uit: input.sectionID,
        BarcodeFiets_uit: openTx.BarcodeFiets_in ?? openTx.BarcodeFiets_uit,
        Stallingsduur: stallingsduur,
        Stallingskosten: accumulatedStallingskosten,
        Tariefstaffels: tariefstaffels,
        dateModified: new Date(),
      },
    });

    await pasidsModel.update({
      where: { ID: bikepass.ID },
      data: {
        huidigeFietsenstallingId: null,
        huidigeSectieId: null,
        huidigeStallingskosten: stallingskosten,
        transactionID: openTx.ID,
        dateLastCheck: input.transactionDate,
        dateModified: new Date(),
      },
    });
  } else {
    await transactiesModel.update({
      where: { ID: openTx.ID },
      data: {
        Stallingskosten: accumulatedStallingskosten,
        Tariefstaffels: tariefstaffels,
        dateModified: new Date(),
      },
    });

    await pasidsModel.update({
      where: { ID: bikepass.ID },
      data: {
        huidigeStallingskosten: accumulatedStallingskosten,
        transactionID: openTx.ID,
        dateLastCheck: input.transactionDate,
        dateModified: new Date(),
      },
    });

    if (nextAfboekingDate) {
      await scheduleAfboekingToWachtrij(tx, {
        transactionID: openTx.ID,
        transactionDate: nextAfboekingDate,
        bikeparkID: input.bikeparkID,
        sectionID: input.sectionID,
        passID: openTx.PasID,
        passtype: pastype,
        typeCheck,
      });
    }
  }

  if (bikepass.AccountID && stallingskosten > 0) {
    const acc = await accountsModel.findUnique({
      where: { ID: bikepass.AccountID },
      select: { saldo: true },
    });
    if (acc) {
      await accountsModel.update({
        where: { ID: bikepass.AccountID },
        data: {
          saldo: Number(acc.saldo ?? 0) - stallingskosten,
          dateLastSaldoUpdate: new Date(),
        },
      });
    }
    await ftModel.create({
      data: {
        ID: crypto.randomUUID().replace(/-/g, ""),
        accountID: bikepass.AccountID,
        amount: stallingskosten,
        transactionDate: input.transactionDate,
        siteID: input.siteID,
        bikeparkID: input.bikeparkID,
        sectionID: input.sectionID,
        transactionID: openTx.ID,
        paymentMethod: "stallingskosten",
        code: "stallingskosten",
        status: "completed",
      },
    });
  }

  return { transactionID: openTx.ID, stallingskosten };
}

function pastypeFromInt(pastype: number): string {
  if (pastype === 1) return "ovchip";
  if (pastype === 2) return "barcodebike";
  return "sleutelhanger";
}

function pastypeToInt(pastype: string): number {
  if (pastype === "ovchip") return 1;
  if (pastype === "barcodebike") return 2;
  return 0; // sleutelhanger
}
