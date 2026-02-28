/**
 * Transaction (putTransaction) logic for queue processor.
 * Mirrors ColdFusion TransactionGateway.putTransaction.
 */

import type { PrismaClient } from "@prisma/client";
import { prisma } from "~/server/db";
import { fetchTariefregelsForStalling } from "../tarieven";
import type { BikepassInfo } from "./account-service";
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

/**
 * Calculate Stallingskosten from tariefregels for given stallingsduur (minutes).
 * Sum of tariff costs for complete periods fitting in Stallingsduur.
 */
async function calculateStallingskosten(
  stallingId: string,
  stallingsduurMinutes: number,
  bikeTypeID: number
): Promise<number> {
  const { tariffs } = await fetchTariefregelsForStalling(stallingId);
  if (!tariffs || tariffs.length === 0) return 0;

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

  return Math.round(total * 100) / 100;
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
      const stallingskosten = input.berekentStallingskosten
        ? await calculateStallingskosten(input.stallingID, stallingsduur, ot.BikeTypeID ?? 1)
        : Number(input.price ?? 0);

      await transactiesModel.update({
        where: { ID: ot.ID },
        data: {
          Date_checkout: input.transactionDate,
          Type_checkout: typeCheck,
          SectieID_uit: input.sectionID,
          BarcodeFiets_uit: ot.BarcodeFiets_in ?? undefined,
          Stallingsduur: stallingsduur,
          Stallingskosten: stallingskosten,
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
  const stallingskosten = input.berekentStallingskosten
    ? await calculateStallingskosten(input.stallingID, stallingsduur, openTx.BikeTypeID ?? 1)
    : Number(input.price ?? 0);

  await transactiesModel.update({
    where: { ID: openTx.ID },
    data: {
      Date_checkout: input.transactionDate,
      Type_checkout: typeCheck,
      SectieID_uit: input.sectionID,
      BarcodeFiets_uit: input.barcodeBike ?? openTx.BarcodeFiets_uit,
      Stallingsduur: stallingsduur,
      Stallingskosten: stallingskosten,
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

function pastypeToInt(pastype: string): number {
  if (pastype === "ovchip") return 1;
  if (pastype === "barcodebike") return 2;
  return 0; // sleutelhanger
}
