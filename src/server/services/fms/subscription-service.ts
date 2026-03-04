/**
 * FMS subscription methods: addSubscription, subscribe.
 * Mirrors ColdFusion BaseFMSService.
 * Writes directly to abonnementen, financialtransactions, accounts (no wachtrij).
 */

import { randomUUID } from "crypto";
import { prisma } from "~/server/db";
import { getBikeparkByExternalID } from "../queue/bikepark-service";
import { getBikepassByPassId } from "../queue/account-service";

function shortUUID(): string {
  return randomUUID().replace(/-/g, "");
}

function parseDate(val: string | undefined): Date {
  if (!val) return new Date();
  const d = new Date(val);
  if (Number.isNaN(d.getTime())) return new Date();
  return d;
}

export type AddSubscriptionInput = {
  subscriptiontypeID: number;
  passID?: string;
  accountID?: string;
  amount?: number;
  paymentTypeID?: number;
  ingangsdatum?: string;
  afloopdatum?: string;
  transactionDate?: string;
};

/**
 * addSubscription – create new subscription purchased at bikepark.
 * Creates abonnementen, financialtransactions; uses or creates account from passID.
 */
export async function addSubscription(
  bikeparkID: string,
  input: AddSubscriptionInput
): Promise<{ status: number; message: string; id?: number }> {
  const bikepark = await getBikeparkByExternalID(bikeparkID);
  if (!bikepark?.ID || !bikepark?.SiteID) {
    return { status: 0, message: "Unknown bikepark " + bikeparkID };
  }

  const subscriptiontypeID = input.subscriptiontypeID;
  if (!subscriptiontypeID) {
    return { status: 0, message: "subscriptiontypeID required" };
  }

  // Verify subscription type is available for this bikepark
  const link = await prisma.abonnementsvorm_fietsenstalling.findFirst({
    where: {
      SubscriptiontypeID: subscriptiontypeID,
      BikeparkID: bikepark.ID,
    },
  });
  if (!link) {
    return { status: 0, message: "Subscription type not available for this bikepark" };
  }

  let accountID = input.accountID;
  let bikepassID: string | null = null;

  if (input.passID) {
    const bikepass = await getBikepassByPassId(
      prisma,
      input.passID,
      bikepark.SiteID,
      "sleutelhanger",
      false
    );
    accountID = bikepass.AccountID ?? undefined;
    bikepassID = bikepass.ID;
  }

  if (!accountID) {
    return { status: 0, message: "accountID or passID required" };
  }

  const ingangsdatum = parseDate(input.ingangsdatum ?? input.transactionDate);
  const afloopdatum = parseDate(input.afloopdatum);
  const amount = input.amount ?? 0;
  const paymentTypeID = input.paymentTypeID ?? 1;

  const abonnementBikeparkID = bikepark.StallingsID ?? bikeparkID;

  const abonnement = await prisma.abonnementen.create({
    data: {
      subscriptiontypeID,
      AccountID: accountID,
      bikepassID,
      bikeparkID: abonnementBikeparkID,
      siteID: bikepark.SiteID,
      exploitantID: bikepark.ExploitantID ?? undefined,
      ingangsdatum,
      afloopdatum,
      prijsInclBtw: amount,
      isActief: true,
      isBetaald: amount <= 0,
      koppelingsdatum: bikepassID ? new Date() : undefined,
    },
  });

  if (amount > 0) {
    await prisma.financialtransactions.create({
      data: {
        ID: shortUUID(),
        accountID,
        amount,
        transactionDate: ingangsdatum,
        siteID: bikepark.SiteID,
        bikeparkID: abonnementBikeparkID,
        paymentMethod: paymentTypeID === 1 ? "betaald" : "kwijtschelding",
        code: `subscription_${subscriptiontypeID}`,
        status: "completed",
        subscriptiontypeID,
        subscriptionID: abonnement.ID,
      },
    });
  }

  return { status: 1, message: "Ok", id: abonnement.ID };
}

export type SubscribeInput = {
  subscriptionID: number;
  passID: string;
};

/**
 * subscribe – link key fob (passID) to existing subscription.
 * Updates abonnementen.bikepassID and accounts_pasids.dateLastSubscriptionUpdate.
 */
export async function subscribe(
  bikeparkID: string,
  input: SubscribeInput
): Promise<{ status: number; message: string }> {
  const bikepark = await getBikeparkByExternalID(bikeparkID);
  if (!bikepark?.ID || !bikepark?.SiteID) {
    return { status: 0, message: "Unknown bikepark " + bikeparkID };
  }

  const { subscriptionID, passID } = input;
  if (!subscriptionID || !passID) {
    return { status: 0, message: "subscriptionID and passID required" };
  }

  const abonnementBikeparkID = bikepark.StallingsID ?? bikeparkID;
  const abonnement = await prisma.abonnementen.findFirst({
    where: {
      ID: subscriptionID,
      bikeparkID: abonnementBikeparkID,
    },
  });
  if (!abonnement) {
    return { status: 0, message: "Subscription not found" };
  }

  const bikepass = await prisma.accounts_pasids.findFirst({
    where: {
      PasID: passID,
      SiteID: bikepark.SiteID,
    },
  });
  if (!bikepass) {
    return { status: 0, message: "Pass not found for this site" };
  }

  await prisma.$transaction([
    prisma.abonnementen.update({
      where: { ID: subscriptionID },
      data: {
        bikepassID: bikepass.ID,
        koppelingsdatum: new Date(),
      },
    }),
    prisma.accounts_pasids.update({
      where: { ID: bikepass.ID },
      data: { dateLastSubscriptionUpdate: new Date() },
    }),
  ]);

  return { status: 1, message: "Ok" };
}
