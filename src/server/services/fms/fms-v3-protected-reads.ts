/**
 * V3 protected read endpoints (operator / dataprovider).
 * Mirrors ColdFusion BaseRestService + fms_service.cfc.
 */

import { prisma } from "~/server/db";
import { getBikeparkByExternalID } from "../queue/bikepark-service";
import { formatCfDateTime, passtype2integer, passtype2string } from "./fms-idtypes";

export type V3BalanceEntry = {
  idcode: string;
  idtype: number;
  balance: number;
};

export type V3SubscriptionEntry = {
  idcode: string;
  idtype: number;
  subscriptiontypeid: number;
  startdate: string;
  expirationdate: string;
  price?: number;
  placeid?: number;
};

export type V3BikeUpdateEntry = {
  idcode: string;
  idtype: string | number;
  barcodebike?: string;
  biketypeid?: number;
  locationid?: string;
  balance?: number;
  status: string;
  datemodified: string;
};

export type V3BikeUpdatesResponse = {
  citycode: string;
  from: string;
  data: V3BikeUpdateEntry[];
};

async function getCouncilSiteId(citycode: string): Promise<string | null> {
  const council = await prisma.contacts.findFirst({
    where: {
      ZipID: citycode,
      ItemType: "organizations",
      Status: "1",
    },
    select: { ID: true },
  });
  return council?.ID ?? null;
}

export async function assertLocationInCity(
  locationid: string,
  citycode: string
): Promise<{ bikeparkInternalId: string; zipId: string }> {
  const active = await prisma.fietsenstallingen.findFirst({
    where: { StallingsID: locationid, Status: "1" },
    select: { ID: true },
  });
  if (!active) {
    throw new Error("Stalling niet gevonden");
  }
  const bikepark = await getBikeparkByExternalID(locationid);
  if (!bikepark?.ID || !bikepark.ZipID) {
    throw new Error("Stalling niet gevonden");
  }
  if (bikepark.ZipID !== citycode) {
    throw new Error(
      `Locatie ${locationid} niet gevonden in gemeente met citycode ${citycode}. Bedoelde u citycode ${bikepark.ZipID}?`
    );
  }
  return { bikeparkInternalId: bikepark.ID, zipId: bikepark.ZipID };
}

/**
 * GET …/locations/{locationid}/balances
 * ColdFusion: BaseRestService.getBalances(citycode) — all non-zero balances in the city.
 */
export async function getBalances(citycode: string): Promise<V3BalanceEntry[]> {
  const siteId = await getCouncilSiteId(citycode);
  if (!siteId) return [];

  const rows = await prisma.$queryRaw<
    Array<{ idcode: string; pasType: string; saldo: unknown }>
  >`
    SELECT ap.PasID AS idcode, ap.Pastype AS pasType, a.saldo AS saldo
    FROM accounts_pasids ap
    INNER JOIN gemeenteaccounts g ON ap.AccountID = g.ID AND g.siteID = ${siteId}
    INNER JOIN accounts a ON a.ID = g.AccountID
    WHERE a.saldo != 0
  `;

  return rows.map((r) => ({
    idcode: r.idcode,
    idtype: passtype2integer(r.pasType),
    balance: Number(r.saldo ?? 0),
  }));
}

/**
 * GET …/idcodes/{idtype}/{idcode}/balance
 * ColdFusion: BaseRestService.getBalance
 */
export async function getBalance(
  citycode: string,
  idtype: number,
  idcode: string
): Promise<V3BalanceEntry> {
  const siteId = await getCouncilSiteId(citycode);
  if (!siteId) {
    return { idcode, idtype, balance: 0 };
  }

  const pasType = passtype2string(idtype);
  const rows = await prisma.$queryRaw<
    Array<{ saldo: unknown }>
  >`
    SELECT a.saldo AS saldo
    FROM accounts_pasids ap
    INNER JOIN gemeenteaccounts g ON ap.AccountID = g.ID AND g.siteID = ${siteId}
    INNER JOIN accounts a ON a.ID = g.AccountID
    WHERE ap.PasID = ${idcode}
      AND ap.Pastype = ${pasType}
    LIMIT 1
  `;

  const balance = rows.length > 0 ? Number(rows[0]!.saldo ?? 0) : 0;
  return { idcode, idtype, balance };
}

/**
 * GET …/locations/{locationid}/subscriptions
 * ColdFusion: BaseRestService.getSubscriptions
 */
export async function getSubscriptions(locationid: string): Promise<V3SubscriptionEntry[]> {
  const bikepark = await getBikeparkByExternalID(locationid);
  if (!bikepark?.ID) {
    throw new Error("Stalling niet gevonden");
  }

  const rows = await prisma.abonnementen.findMany({
    where: {
      bikepassID: { not: null },
      abonnementsvormen: {
        abonnementsvorm_fietsenstalling: {
          some: { BikeparkID: bikepark.ID },
        },
      },
    },
    select: {
      subscriptiontypeID: true,
      ingangsdatum: true,
      afloopdatum: true,
      prijsInclBtw: true,
      plekID: true,
      accounts_pasids: {
        select: { PasID: true, Pastype: true },
      },
    },
  });

  const result: V3SubscriptionEntry[] = [];
  for (const row of rows) {
    const pass = row.accounts_pasids;
    if (!pass?.PasID || row.subscriptiontypeID == null) continue;
    if (!row.ingangsdatum || !row.afloopdatum) continue;

    const entry: V3SubscriptionEntry = {
      idcode: pass.PasID,
      idtype: passtype2integer(pass.Pastype),
      subscriptiontypeid: row.subscriptiontypeID,
      startdate: formatCfDateTime(row.ingangsdatum),
      expirationdate: formatCfDateTime(row.afloopdatum),
    };
    if (row.prijsInclBtw != null) {
      entry.price = Number(row.prijsInclBtw);
    }
    if (row.plekID != null) {
      entry.placeid = Number(row.plekID);
    }
    result.push(entry);
  }
  return result;
}

/**
 * GET …/locations/{locationid}/bikeupdates?from=…
 * ColdFusion: BaseRestService.getBikeUpdates (struct with citycode, from, data).
 */
export async function getBikeUpdatesV3(
  citycode: string,
  locationid: string,
  fromDate: Date
): Promise<V3BikeUpdatesResponse> {
  await assertLocationInCity(locationid, citycode);

  const bikepark = await getBikeparkByExternalID(locationid);
  if (!bikepark?.SiteID || !bikepark.ZipID) {
    return { citycode, from: formatCfDateTime(fromDate), data: [] };
  }

  const maxLookBack = new Date();
  maxLookBack.setDate(maxLookBack.getDate() - 7);
  const from = fromDate < maxLookBack ? maxLookBack : fromDate;

  const zipPrefix = `${bikepark.ZipID}%`;

  const rows = await prisma.transacties.findMany({
    where: {
      dateModified: { gte: from },
      FietsenstallingID: { startsWith: zipPrefix },
    },
    orderBy: { dateModified: "asc" },
    select: {
      PasID: true,
      Pastype: true,
      BarcodeFiets_in: true,
      FietsenstallingID: true,
      Date_checkout: true,
      Date_checkin: true,
      BikeTypeID: true,
      dateModified: true,
    },
  });

  if (rows.length === 0) {
    return { citycode, from: formatCfDateTime(from), data: [] };
  }

  const pasIds = [...new Set(rows.map((r) => r.PasID))];
  const pasLinks = await prisma.accounts_pasids.findMany({
    where: { PasID: { in: pasIds }, SiteID: bikepark.SiteID },
    select: { PasID: true, Pastype: true, AccountID: true },
  });
  const pasByPasId = new Map(pasLinks.map((p) => [p.PasID, p]));

  const accountIds = [
    ...new Set(pasLinks.map((p) => p.AccountID).filter((id): id is string => !!id)),
  ];
  const gemeenteLinks =
    accountIds.length > 0
      ? await prisma.gemeenteaccounts.findMany({
          where: { SiteID: bikepark.SiteID, AccountID: { in: accountIds } },
          select: { AccountID: true },
        })
      : [];
  const validAccountIds = new Set(gemeenteLinks.map((g) => g.AccountID));

  const saldoAccountIds = accountIds.filter((id) => validAccountIds.has(id));
  const accounts =
    saldoAccountIds.length > 0
      ? await prisma.accounts.findMany({
          where: { ID: { in: saldoAccountIds } },
          select: { ID: true, saldo: true },
        })
      : [];
  const saldoByAccountId = new Map(accounts.map((a) => [a.ID, Number(a.saldo ?? 0)]));

  const bikes = new Map<string, V3BikeUpdateEntry>();

  for (const t of rows) {
    const link = pasByPasId.get(t.PasID);
    if (!link?.AccountID || !validAccountIds.has(link.AccountID)) continue;
    if (!t.dateModified) continue;

    const status = t.Date_checkout == null ? "In" : "Uit";
    const saldo = saldoByAccountId.get(link.AccountID) ?? 0;

    const entry: V3BikeUpdateEntry = {
      idcode: t.PasID,
      idtype: t.Pastype ?? 99,
      barcodebike: t.BarcodeFiets_in ?? "",
      biketypeid: t.BikeTypeID ?? undefined,
      status,
      datemodified: formatCfDateTime(t.dateModified),
    };
    if (status === "In" && t.FietsenstallingID) {
      entry.locationid = t.FietsenstallingID;
    }
    if (saldo !== 0) {
      entry.balance = saldo;
    }
    bikes.set(t.PasID, entry);
  }

  return {
    citycode,
    from: formatCfDateTime(from),
    data: [...bikes.values()],
  };
}
