/**
 * Account and bikepass operations for queue processor.
 * Mirrors ColdFusion: getBikepassByPassId, addSaldoObject.
 */

import { PrismaClient } from "@prisma/client";
import { randomUUID } from "crypto";
import { prisma as defaultPrisma } from "~/server/db";

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
  /** gemeenteaccounts.ID (ColdFusion CouncilAccount), as stored in accounts_pasids.AccountID. */
  AccountID: string | null;
  /** accounts.ID behind the pass (BikePass.getTopAccount); use this for saldo and financialtransactions. */
  topAccountID: string | null;
  SiteID: string | null;
  PasID: string;
  Pastype: string;
  barcodeFiets: string | null;
  huidigeFietsenstallingId: string | null;
  huidigeSectieId: string | null;
};

/**
 * accounts_pasids.AccountID holds gemeenteaccounts.ID in ColdFusion data. Older rows written by Next.js
 * hold accounts.ID directly, so an ID without a council account is taken as the account itself.
 */
export async function passTopAccountId(prisma: Prisma, passAccountID: string | null): Promise<string | null> {
  if (!passAccountID) return null;
  const link = await prisma.gemeenteaccounts.findUnique({
    where: { ID: passAccountID },
    select: { AccountID: true },
  });
  return link?.AccountID ?? passAccountID;
}

/** Splits pass AccountIDs into gemeenteaccounts IDs and the accounts IDs behind them (test teardown). */
export async function passAccountIds(
  passAccountIDs: Array<string | null>,
  prisma: Prisma = defaultPrisma
): Promise<{ councilIDs: string[]; accountIDs: string[] }> {
  const ids = [...new Set(passAccountIDs.filter((id): id is string => !!id))];
  if (ids.length === 0) return { councilIDs: [], accountIDs: [] };
  const links: Array<{ ID: string; AccountID: string }> = await prisma.gemeenteaccounts.findMany({
    where: { ID: { in: ids } },
    select: { ID: true, AccountID: true },
  });
  const linked = new Map<string, string>(links.map((l) => [l.ID, l.AccountID]));
  return {
    councilIDs: [...linked.keys()],
    accountIDs: [...new Set(ids.map((id) => linked.get(id) ?? id))],
  };
}

/** BikeparkAccount.getCouncilAccountByCouncil: find or create the account's gemeenteaccounts row. */
export async function councilAccountFor(prisma: Prisma, accountID: string, siteID: string): Promise<string> {
  const where = { AccountID: accountID, SiteID: siteID };
  const existing = await prisma.gemeenteaccounts.findFirst({ where, select: { ID: true } });
  if (existing) return existing.ID;
  const id = shortUUID();
  try {
    await prisma.gemeenteaccounts.create({ data: { ID: id, ...where } });
    return id;
  } catch (error) {
    const raced = await prisma.gemeenteaccounts.findFirst({ where, select: { ID: true } });
    if (raced) return raced.ID;
    throw error;
  }
}

/**
 * Get or create bikepass (accounts_pasids) for passID.
 * SiteID comes from the stalling's SiteID (contacts/gemeente).
 * Creates account and accounts_pasids if they don't exist.
 */
export async function getBikepassByPassId(
  prisma: Prisma,
  passID: string,
  siteID: string,
  pastype: string
): Promise<BikepassInfo> {
  const pasidsModel = prisma.accounts_pasids;
  const accountsModel = prisma.accounts;

  const existing = await pasidsModel.findFirst({
    where: { SiteID: siteID, PasID: passID, Pastype: pastype },
  });

  if (existing) {
    return {
      ID: existing.ID,
      AccountID: existing.AccountID,
      topAccountID: await passTopAccountId(prisma, existing.AccountID),
      SiteID: existing.SiteID,
      PasID: existing.PasID,
      Pastype: existing.Pastype,
      barcodeFiets: existing.barcodeFiets,
      huidigeFietsenstallingId: existing.huidigeFietsenstallingId,
      huidigeSectieId: existing.huidigeSectieId,
    };
  }

  // service.getBikepassByPassId: a pass already known in another municipality gets a row here on the same
  // account and with the same name; an unknown pass gets a new SYSTEM account (getNewSystemAccount(council)).
  const elsewhere = await pasidsModel.findFirst({
    where: { PasID: passID, Pastype: pastype, NOT: { SiteID: siteID } },
    select: { AccountID: true, Naam: true },
  });
  let accountID = elsewhere ? await passTopAccountId(prisma, elsewhere.AccountID) : null;
  if (accountID && !(await accountsModel.findUnique({ where: { ID: accountID }, select: { ID: true } }))) accountID = null;
  if (!accountID) {
    accountID = shortUUID();
    await accountsModel.create({
      data: {
        ID: accountID,
        saldo: 0,
        account_type: "SYSTEM",
        DateRegistration: new Date(),
      },
    });
  }
  const councilAccountID = await councilAccountFor(prisma, accountID, siteID);

  const bikepassID = shortUUID();
  await pasidsModel.create({
    data: {
      ID: bikepassID,
      AccountID: councilAccountID,
      SiteID: siteID,
      PasID: passID,
      Pastype: pastype,
      Naam: elsewhere?.Naam ?? null,
    },
  });

  return {
    ID: bikepassID,
    AccountID: councilAccountID,
    topAccountID: accountID,
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
  siteID: string
): Promise<void> {
  const pasidsModel = prisma.accounts_pasids;
  const accountsModel = prisma.accounts;
  const ftModel = prisma.financialtransactions;

  const bikepass = await pasidsModel.findFirst({
    where: { PasID: passID },
    select: { AccountID: true },
  });

  const accountID = await passTopAccountId(prisma, bikepass?.AccountID ?? null);
  if (!accountID) {
    throw new Error(`Geen account gevonden voor passID ${passID}`);
  }

  const account = await accountsModel.findUnique({
    where: { ID: accountID },
    select: { saldo: true },
  });

  if (!account) {
    throw new Error(`Account ${accountID} niet gevonden`);
  }

  const currentSaldo = Number(account.saldo ?? 0);
  const newSaldo = currentSaldo + amount;

  await accountsModel.update({
    where: { ID: accountID },
    data: {
      saldo: newSaldo,
      dateLastSaldoUpdate: new Date(),
    },
  });

  await ftModel.create({
    data: {
      ID: shortUUID(),
      accountID,
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
