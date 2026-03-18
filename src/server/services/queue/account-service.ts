/**
 * Account and bikepass operations for queue processor.
 * Mirrors ColdFusion: getBikepassByPassId, addSaldoObject.
 */

import { PrismaClient } from "@prisma/client";
import { randomUUID } from "crypto";

/** UUID without hyphens (32 chars) for VarChar(35) columns. */
function shortUUID(): string {
  return randomUUID().replace(/-/g, "");
}

type Prisma = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$use" | "$extends" | "$transaction"
>;

export type BikepassInfo = {
  ID: string;
  AccountID: string | null;
  SiteID: string | null;
  PasID: string;
  Pastype: string;
  barcodeFiets: string | null;
  huidigeFietsenstallingId: string | null;
  huidigeSectieId: string | null;
};

/**
 * Get or create bikepass (accounts_pasids) for passID.
 * SiteID comes from the stalling's SiteID (contacts/gemeente).
 * Creates account and accounts_pasids if they don't exist.
 */
export async function getBikepassByPassId(
  prisma: Prisma,
  passID: string,
  siteID: string,
  pastype: string,
  useNewTables: boolean
): Promise<BikepassInfo> {
  const pasidsModel = useNewTables ? prisma.new_accounts_pasids : prisma.accounts_pasids;
  const accountsModel = useNewTables ? prisma.new_accounts : prisma.accounts;

  const existing = await pasidsModel.findFirst({
    where: { SiteID: siteID, PasID: passID, Pastype: pastype },
  });

  if (existing) {
    return {
      ID: existing.ID,
      AccountID: existing.AccountID,
      SiteID: existing.SiteID,
      PasID: existing.PasID,
      Pastype: existing.Pastype,
      barcodeFiets: existing.barcodeFiets,
      huidigeFietsenstallingId: existing.huidigeFietsenstallingId,
      huidigeSectieId: existing.huidigeSectieId,
    };
  }

  // Create account and bikepass (ID must fit VarChar(35))
  const accountID = shortUUID();
  await accountsModel.create({
    data: {
      ID: accountID,
      saldo: 0,
    },
  });

  const bikepassID = shortUUID();
  await pasidsModel.create({
    data: {
      ID: bikepassID,
      AccountID: accountID,
      SiteID: siteID,
      PasID: passID,
      Pastype: pastype,
    },
  });

  return {
    ID: bikepassID,
    AccountID: accountID,
    SiteID: siteID,
    PasID: passID,
    Pastype: pastype,
    barcodeFiets: null,
    huidigeFietsenstallingId: null,
    huidigeSectieId: null,
  };
}

/**
 * Add saldo to account (from wachtrij_betalingen).
 * Updates account balance and creates financialtransactions record.
 */
export async function addSaldoObject(
  prisma: Prisma,
  passID: string,
  amount: number,
  transactionDate: Date,
  paymentTypeID: number,
  bikeparkID: string,
  siteID: string,
  useNewTables: boolean
): Promise<void> {
  const pasidsModel = useNewTables ? prisma.new_accounts_pasids : prisma.accounts_pasids;
  const accountsModel = useNewTables ? prisma.new_accounts : prisma.accounts;
  const ftModel = useNewTables ? prisma.new_financialtransactions : prisma.financialtransactions;

  const bikepass = await pasidsModel.findFirst({
    where: { PasID: passID },
    select: { AccountID: true },
  });

  if (!bikepass?.AccountID) {
    throw new Error(`Geen account gevonden voor passID ${passID}`);
  }

  const account = await accountsModel.findUnique({
    where: { ID: bikepass.AccountID },
    select: { saldo: true },
  });

  if (!account) {
    throw new Error(`Account ${bikepass.AccountID} niet gevonden`);
  }

  const currentSaldo = Number(account.saldo ?? 0);
  const newSaldo = currentSaldo + amount;

  await accountsModel.update({
    where: { ID: bikepass.AccountID },
    data: {
      saldo: newSaldo,
      dateLastSaldoUpdate: new Date(),
    },
  });

  await ftModel.create({
    data: {
      ID: shortUUID(),
      accountID: bikepass.AccountID,
      amount,
      transactionDate,
      siteID,
      bikeparkID,
      paymentMethod: paymentTypeID === 1 ? "betaald" : "kwijtschelding",
      code: `saldo_${paymentTypeID}`,
      status: "completed",
    },
  });
}
