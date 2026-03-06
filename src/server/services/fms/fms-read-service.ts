/**
 * FMS read-only methods: getSectors, getBikes, getBikeUpdates, getSubscriptors.
 * Mirrors ColdFusion BaseFMSService.
 */

import { prisma } from "~/server/db";
import { getSections } from "./fms-v3-service";
import { getBikeparkByExternalID } from "../queue/bikepark-service";

/** ColdFusion proxy.Sector: externalId, name, places, sectorBikeTypes, maxParkingTime */
export type SectorOutput = {
  externalId?: string;
  name?: string;
  places?: Array<{ id: number; name?: string; statuscode: number }>;
  sectorBikeTypes?: Array<{
    allowed: boolean;
    biketypeid: number;
    rates?: Array<{ timespan: number; cost: number } | null>;
    capacity?: number;
  }>;
  maxParkingTime?: number;
};

/** ColdFusion getBikes: barcode, biketypeID */
export type BikeOutput = {
  barcode: string;
  biketypeID: number;
};

/** ColdFusion getBikeUpdates: passId, saldo, RFID, RFIDBike, barcodeBike, status, bikepark, section, dateLastIdUpdate, dateLastCheck, biketypeID */
export type BikeUpdateOutput = {
  passId: string;
  saldo?: number;
  RFID?: string;
  RFIDBike?: string;
  barcodeBike?: string;
  status: "In" | "Uit";
  bikepark?: string;
  section?: string;
  dateLastIdUpdate?: string;
  dateLastCheck?: string;
  biketypeID?: number;
};

/** ColdFusion getSubscriptors: passId, expirationDate, subscriptiontypeID */
export type SubscriptorOutput = {
  passId: string;
  expirationDate: string;
  subscriptiontypeID: number;
};

/** ColdFusion proxy.Locker: name, statuscode, userlist, masterkeys, maxParkingTime */
export type LockerOutput = {
  name?: string;
  statuscode: number;
  userlist?: string;
  masterkeys?: string[];
  maxParkingTime?: number;
};

/** ColdFusion proxy.RFIDStatus: allowed, messageCode, saldo? */
export type RFIDStatusOutput = {
  allowed: boolean;
  messageCode: string;
  saldo?: number;
};

/**
 * getSectors – sector properties (name, capacity, rates, maxParkingTime).
 * ColdFusion: BaseFMSService.getSectors, proxy.Sector from BikeparkSection.
 */
export async function getSectors(bikeparkID: string): Promise<SectorOutput[]> {
  const bikepark = await getBikeparkByExternalID(bikeparkID);
  if (!bikepark?.StallingsID) return [];

  const stalling = await prisma.fietsenstallingen.findFirst({
    where: { StallingsID: bikeparkID, Status: "1" },
    select: { ID: true, MaxStallingsduur: true },
  });
  if (!stalling) return [];

  const sections = await getSections(bikeparkID, 2);
  const maxParkingTime = stalling.MaxStallingsduur ?? 0;

  return sections.map((s) => {
    const sector: SectorOutput = {
      externalId: s.sectionid ?? undefined,
      name: s.name,
      sectorBikeTypes: s.biketypes?.map((bt) => ({
        allowed: bt.allowed,
        biketypeid: bt.biketypeid,
        rates: bt.rates ?? undefined,
        capacity: bt.capacity,
      })),
    };
    if (maxParkingTime > 0) sector.maxParkingTime = maxParkingTime;
    if (s.places && s.places.length > 0) {
      sector.places = s.places.map((p) => ({
        id: p.id,
        name: p.name,
        statuscode: p.statuscode,
      }));
    }
    return sector;
  });
}

/**
 * getBikes – all registered bikes in municipality (barcoderegister).
 * ColdFusion: BaseFMSService.getBikes.
 */
export async function getBikes(bikeparkID: string): Promise<BikeOutput[]> {
  const bikepark = await getBikeparkByExternalID(bikeparkID);
  if (!bikepark?.SiteID) return [];

  const rows = await prisma.barcoderegister.findMany({
    where: { SiteID: bikepark.SiteID },
    select: { Barcode: true, BikeTypeID: true },
  });
  return rows.map((r) => ({
    barcode: r.Barcode,
    biketypeID: r.BikeTypeID,
  }));
}

/**
 * getBikeUpdates – bikes that changed since fromDate (checkins, checkouts, etc.).
 * ColdFusion: BaseFMSService.getBikeUpdates. Joins transacties, accounts_pasids, gemeenteaccounts, accounts.
 */
export async function getBikeUpdates(
  bikeparkID: string,
  fromDate: Date,
  useNewTables = false
): Promise<BikeUpdateOutput[]> {
  const bikepark = await getBikeparkByExternalID(bikeparkID);
  if (!bikepark?.ZipID || !bikepark?.SiteID) return [];

  const maxLookBack = new Date();
  maxLookBack.setDate(maxLookBack.getDate() - 1);
  const from = fromDate < maxLookBack ? maxLookBack : fromDate;

  const zipPrefix = bikepark.ZipID + "%";

  const transactiesModel = useNewTables ? prisma.new_transacties : prisma.transacties;
  const accountsPasidsModel = useNewTables ? prisma.new_accounts_pasids : prisma.accounts_pasids;

  const rows = await transactiesModel.findMany({
    where: {
      dateModified: { gte: from },
      FietsenstallingID: { startsWith: zipPrefix },
    },
    take: 1000,
  });

  if (rows.length === 0) return [];

  const pasIds = [...new Set(rows.map((r) => r.PasID))];
  const [pasids, gemeenteAccountIds] = await Promise.all([
    accountsPasidsModel.findMany({
      where: { PasID: { in: pasIds }, SiteID: bikepark.SiteID },
      select: { PasID: true, AccountID: true, RFID: true, RFIDBike: true, barcodeFiets: true },
    }),
    prisma.gemeenteaccounts.findMany({
      where: { SiteID: bikepark.SiteID },
      select: { AccountID: true },
    }),
  ]);

  const siteAccountIds = new Set(gemeenteAccountIds.map((g) => g.AccountID));
  const pasidByPasId = new Map(pasids.map((p) => [p.PasID, p]));
  const validPasIds = new Set(
    pasids.filter((p) => p.AccountID && siteAccountIds.has(p.AccountID)).map((p) => p.PasID)
  );

  const accountIds = [...new Set(pasids.map((p) => p.AccountID).filter((id): id is string => !!id && siteAccountIds.has(id)))];
  const accounts =
    accountIds.length > 0
      ? await prisma.accounts.findMany({
          where: { ID: { in: accountIds } },
          select: { ID: true, saldo: true },
        })
      : [];
  const saldoByAccountId = new Map(accounts.map((a) => [a.ID, Number(a.saldo ?? 0)]));
  const accountIdByPasId = new Map(
    pasids.filter((p) => p.AccountID).map((p) => [p.PasID, p.AccountID!])
  );

  return rows
    .filter((r) => validPasIds.has(r.PasID))
    .map((r) => {
      const ap = pasidByPasId.get(r.PasID);
      const accId = accountIdByPasId.get(r.PasID);
      const saldo = accId ? saldoByAccountId.get(accId) ?? 0 : 0;
      const barcode = ap?.barcodeFiets ?? r.BarcodeFiets_in ?? (r as { BarcodeFiets_uit?: string }).BarcodeFiets_uit ?? "";
      const sectieIdUit = (r as { SectieID_uit?: string }).SectieID_uit;
      return {
        passId: r.PasID,
        saldo,
        RFID: ap?.RFID ?? undefined,
        RFIDBike: ap?.RFIDBike ?? undefined,
        barcodeBike: barcode || undefined,
        status: r.Date_checkout == null ? ("In" as const) : ("Uit" as const),
        bikepark: r.FietsenstallingID,
        section: r.SectieID ?? (r.Date_checkout ? sectieIdUit : undefined) ?? undefined,
        dateLastIdUpdate: r.Date_checkin?.toISOString?.(),
        dateLastCheck: (r.Date_checkout ?? r.Date_checkin)?.toISOString?.(),
        biketypeID: r.BikeTypeID,
      };
    });
}

/**
 * getSubscriptors – key fobs with active subscriptions for bikepark.
 * ColdFusion: BaseFMSService.getSubscriptors.
 */
export async function getSubscriptors(bikeparkID: string): Promise<SubscriptorOutput[]> {
  const bikepark = await getBikeparkByExternalID(bikeparkID);
  if (!bikepark?.ID || !bikepark?.SiteID) return [];

  const now = new Date();
  const rows = await prisma.abonnementen.findMany({
    where: {
      ingangsdatum: { lte: now },
      afloopdatum: { gte: now },
      isActief: true,
      abonnementsvormen: {
        abonnementsvorm_fietsenstalling: {
          some: { BikeparkID: bikepark.ID },
        },
      },
      accounts_pasids: {
        SiteID: bikepark.SiteID,
      },
    },
    select: {
      subscriptiontypeID: true,
      afloopdatum: true,
      accounts_pasids: { select: { PasID: true } },
    },
  });

  return rows
    .filter((r): r is typeof r & { accounts_pasids: { PasID: string } } => !!r.accounts_pasids)
    .map((r) => ({
      passId: r.accounts_pasids.PasID,
      expirationDate: r.afloopdatum?.toISOString?.() ?? "",
      subscriptiontypeID: r.subscriptiontypeID ?? 0,
    }));
}

/** Status codes for fietsenstalling_plek (ColdFusion Place). */
const PLACE_STATUS = { FREE: 0, OCCUPIED: 1, BLOCKED: 2, RESERVED: 3, OUT_OF_ORDER: 4 } as const;

/**
 * getLockerInfo – locker status for fietskluizen.
 * ColdFusion: BaseFMSService.getLockerInfo.
 */
export async function getLockerInfo(
  bikeparkID: string,
  sectionID: string,
  placeID: string
): Promise<LockerOutput> {
  const placeIdNum = parseInt(placeID, 10);
  if (Number.isNaN(placeIdNum)) {
    return { statuscode: PLACE_STATUS.OUT_OF_ORDER };
  }

  const sectie = await prisma.fietsenstalling_sectie.findFirst({
    where: {
      externalId: sectionID,
      fietsenstalling: { StallingsID: bikeparkID, Status: "1" },
    },
    select: { sectieId: true, fietsenstalling: { select: { MaxStallingsduur: true } } },
  });
  if (!sectie) return { statuscode: PLACE_STATUS.OUT_OF_ORDER };

  const place = await prisma.fietsenstalling_plek.findFirst({
    where: { id: BigInt(placeIdNum), sectie_id: BigInt(sectie.sectieId) },
    select: {
      id: true,
      titel: true,
      status: true,
      isActief: true,
      isGeblokkeerd: true,
    },
  });

  if (!place) return { statuscode: PLACE_STATUS.OUT_OF_ORDER };

  const name = place.titel ? `Kluis ${place.titel}` : `Kluis ${place.id}`;
  const maxParkingTime = sectie.fietsenstalling?.MaxStallingsduur ?? 0;

  if (!place.isActief) {
    return { name, statuscode: PLACE_STATUS.OUT_OF_ORDER, ...(maxParkingTime > 0 && { maxParkingTime }) };
  }
  if (place.isGeblokkeerd) {
    return { name, statuscode: PLACE_STATUS.BLOCKED, ...(maxParkingTime > 0 && { maxParkingTime }) };
  }

  const statusVal = place.status ?? 0;
  const effectiveStatus = statusVal % 10;
  if (effectiveStatus === PLACE_STATUS.OCCUPIED || effectiveStatus === 2) {
    const openTx = await prisma.transacties.findFirst({
      where: { PlaceID: place.id, Date_checkout: null },
      select: { PasID: true },
    });
    const pasid = openTx
      ? await prisma.accounts_pasids.findFirst({
          where: { PasID: openTx.PasID },
          select: { RFID: true, RFIDBike: true, PasID: true },
        })
      : null;
    const userlist = pasid?.RFID ?? pasid?.RFIDBike ?? openTx?.PasID ?? "";
    return {
      name,
      statuscode: PLACE_STATUS.OCCUPIED,
      ...(userlist && { userlist }),
      ...(maxParkingTime > 0 && { maxParkingTime }),
    };
  }

  const bezetting = await prisma.fietsenstalling_plek_bezetting.findFirst({
    where: { plek_id: place.id, verloopdatum: { gte: new Date() } },
  });
  if (bezetting) {
    return { name, statuscode: PLACE_STATUS.RESERVED, ...(maxParkingTime > 0 && { maxParkingTime }) };
  }

  return { name, statuscode: PLACE_STATUS.FREE, ...(maxParkingTime > 0 && { maxParkingTime }) };
}
