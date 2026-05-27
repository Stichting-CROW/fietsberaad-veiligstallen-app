/**
 * V3 REST write operations (ColdFusion fms_service.cfc + BaseRestService).
 */

import { prisma } from "~/server/db";
import { getBikeparkByExternalID } from "../queue/bikepark-service";
import { getBikepassByPassId } from "../queue/account-service";
import { addSubscription } from "./subscription-service";
import { updateLocker } from "./fms-locker-service";
import { reportOccupationData } from "./report-occupation-service";
import {
  addSyncToWachtrij,
  addTransactionToWachtrij,
  type TransactionInput,
} from "./wachtrij-service";
import { assertLocationInCity } from "./fms-v3-protected-reads";
import { passtype2integer, passtype2string } from "./fms-idtypes";
import { logFmsCall } from "./webservice-log";

export type FmsOkResult = { message: string; status: number; id?: number; subscriptionid?: number };

export function okResult(extra?: { id?: number; subscriptionid?: number }): FmsOkResult {
  return { message: "OK", status: 1, ...extra };
}

export function errorResult(message: string): FmsOkResult {
  return { message, status: 0 };
}

function parseDate(val: unknown): Date {
  if (val == null) return new Date();
  const d = new Date(String(val));
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

function mapV3Transaction(tx: Record<string, unknown>): TransactionInput {
  const rawType = String(tx.type ?? "in").toLowerCase();
  return {
    type: rawType === "in" ? "in" : "out",
    typeCheck: String(tx.typecheck ?? tx.typeCheck ?? "user"),
    transactionDate: String(
      tx.transactiondate ?? tx.transactionDate ?? new Date().toISOString()
    ),
    idcode: String(tx.idcode ?? ""),
    idtype: Number(tx.idtype ?? 0),
    bikeid: tx.bikeid != null ? String(tx.bikeid) : undefined,
    price: tx.price as number | string | undefined,
    paymenttypeid: Number(tx.paymenttypeid ?? tx.paymentTypeID ?? 1),
    amountpaid: tx.price as number | string | undefined,
    clienttypeid: Number(tx.clienttypeid ?? 1),
  };
}

async function getCouncilSiteId(citycode: string): Promise<string | null> {
  const council = await prisma.contacts.findFirst({
    where: { ZipID: citycode, ItemType: "organizations", Status: "1" },
    select: { ID: true },
  });
  return council?.ID ?? null;
}

export async function uploadTransactionV3(
  locationid: string,
  sectionid: string,
  transaction: Record<string, unknown>,
  placeid?: number
): Promise<FmsOkResult> {
  if (!transaction.transactiondate && !transaction.transactionDate) {
    throw new Error("Transactiondate is verplicht");
  }
  const tx = mapV3Transaction(transaction);
  const result = await addTransactionToWachtrij(
    locationid,
    sectionid,
    tx,
    placeid
  );
  void logFmsCall(
    "uploadTransaction",
    locationid,
    `${sectionid} place=${placeid ?? ""} id=${result.id}`
  );
  return okResult({ id: result.id });
}

type CompletedTxInput = Record<string, unknown>;

export async function uploadCompletedTransactionV3(
  citycode: string,
  locationid: string,
  completed: CompletedTxInput,
  sectionid?: string,
  placeid?: number
): Promise<FmsOkResult> {
  const bikepark = await getBikeparkByExternalID(locationid);
  if (!bikepark) {
    throw new Error(`Locatie ${locationid} niet gevonden`);
  }

  const checkindate = parseDate(completed.checkindate);
  const checkoutdate = parseDate(completed.checkoutdate);
  const checkintype = String(
    completed.checkintype ?? completed.typecheckin ?? "user"
  ) as "user" | "controle" | "system" | "sync" | "reservation";
  const checkouttype = String(
    completed.typecheckout ?? completed.checkouttype ?? "user"
  ) as "user" | "controle" | "system" | "sync" | "reservation";

  await prisma.transacties_archief.create({
    data: {
      citycode,
      locationid,
      sectionid: sectionid ?? locationid,
      sectionid_out: sectionid ?? null,
      placeid: placeid ?? null,
      checkindate,
      checkoutdate,
      checkintype,
      checkouttype,
      daybeginsat: new Date(1970, 0, 1, 0, 0, 0),
      price: Number(completed.price ?? 0),
      clienttypeid: Number(completed.clienttypeid ?? 0),
      biketypeid: Number(completed.biketypeid ?? 1),
      exploitantid: bikepark.ExploitantID ?? null,
      source: "fms-v3-api",
    },
  });

  return okResult();
}

export async function addSubscriptionV3(
  citycode: string,
  locationid: string,
  subscription: Record<string, unknown>,
  options?: { sectionid?: string; placeid?: string }
): Promise<FmsOkResult> {
  await assertLocationInCity(locationid, citycode);

  const subscriptiontypeID = Number(
    subscription.subscriptiontypeid ?? subscription.subscriptionTypeID ?? 0
  );
  const idcode = String(subscription.idcode ?? "");
  if (!subscriptiontypeID || !idcode) {
    return errorResult("subscriptiontypeid and idcode required");
  }

  const result = await addSubscription(locationid, {
    subscriptiontypeID,
    passID: idcode,
    idtype: subscription.idtype != null ? Number(subscription.idtype) : undefined,
    amount: Number(subscription.cost ?? subscription.price ?? 0),
    ingangsdatum: subscription.startdate
      ? String(subscription.startdate)
      : undefined,
    afloopdatum: subscription.expirationdate
      ? String(subscription.expirationdate)
      : undefined,
    paymentTypeID: 1,
  });

  if (result.status !== 1 || !result.id) {
    return { message: result.message, status: result.status };
  }

  if (options?.placeid) {
    const placeIdNum = parseInt(options.placeid, 10);
    if (!Number.isNaN(placeIdNum)) {
      await prisma.abonnementen.update({
        where: { ID: result.id },
        data: { plekID: BigInt(placeIdNum) },
      });
    }
  }

  return {
    message: result.message,
    status: result.status,
    subscriptionid: result.id,
  };
}

export async function updatePlaceV3(
  locationid: string,
  sectionid: string,
  placeid: string,
  properties: Record<string, unknown>
): Promise<FmsOkResult> {
  const placeIdNum = parseInt(placeid, 10);
  if (Number.isNaN(placeIdNum)) {
    return errorResult("Unknown place " + placeid);
  }

  const sectie = await prisma.fietsenstalling_sectie.findFirst({
    where: {
      externalId: sectionid,
      fietsenstalling: { StallingsID: locationid, Status: "1" },
    },
    select: { sectieId: true },
  });
  if (!sectie) {
    return errorResult("Unknown section " + sectionid);
  }

  const place = await prisma.fietsenstalling_plek.findFirst({
    where: { id: BigInt(placeIdNum), sectie_id: BigInt(sectie.sectieId) },
    select: { id: true },
  });
  if (!place) {
    return errorResult("Unknown place " + placeid);
  }

  const data: Record<string, unknown> = {};
  if (properties.urlwebservice != null) {
    data.urlwebservice = String(properties.urlwebservice);
  }
  if (properties.name != null) {
    data.titel = String(properties.name);
  }
  if (properties.username != null) {
    data.username = String(properties.username);
  }
  if (properties.password != null) {
    data.password = String(properties.password);
  }

  if (properties.statuscode != null) {
    const statuscode = Number(properties.statuscode);
    const transactionDate = properties.transactiondate
      ? String(properties.transactiondate)
      : new Date().toISOString();
    const lockerResult = await updateLocker(locationid, sectionid, placeid, {
      statuscode,
      transactionDate,
      cost: properties.cost != null ? Number(properties.cost) : undefined,
      paymentTypeID:
        properties.paymenttypeid != null
          ? Number(properties.paymenttypeid)
          : undefined,
    });
    if (lockerResult.status !== 1) {
      return lockerResult;
    }
  }

  if (Object.keys(data).length > 0) {
    await prisma.fietsenstalling_plek.update({
      where: { id: place.id },
      data: data as {
        urlwebservice?: string;
        titel?: string;
        username?: string;
        password?: string;
      },
    });
  }

  return okResult();
}

const LOG_TYPES = new Set([
  "debug",
  "info",
  "warning",
  "error",
  "critical",
  "notice",
]);

export async function logPlaceV3(
  locationid: string,
  sectionid: string | undefined,
  placeid: string | undefined,
  properties: Record<string, unknown>
): Promise<FmsOkResult> {
  const logType = String(properties.type ?? "info").toLowerCase();
  const typeEnum = LOG_TYPES.has(logType)
    ? (logType as "debug" | "info" | "warning" | "error" | "critical" | "notice")
    : "info";

  let plekIdInt: number | null = null;
  if (placeid) {
    const n = parseInt(placeid, 10);
    if (!Number.isNaN(n)) plekIdInt = n;
  }

  await prisma.fmsservicelog.create({
    data: {
      StallingsID: locationid,
      SectieID: sectionid ?? null,
      PlekID: plekIdInt,
      Actie: properties.action != null ? String(properties.action) : null,
      ActieID:
        properties.actionid != null ? Number(properties.actionid) : null,
      Type: typeEnum,
      PasID: properties.idcode != null ? String(properties.idcode) : null,
      Pastype:
        properties.idtype != null
          ? passtype2string(Number(properties.idtype))
          : null,
      Omschrijving:
        properties.description != null
          ? String(properties.description)
          : null,
      Tijdstip: properties.timestamp
        ? parseDate(properties.timestamp)
        : new Date(),
    },
  });

  return okResult();
}

export async function syncSectorV3(
  locationid: string,
  sectionid: string,
  data: Record<string, unknown>
): Promise<FmsOkResult> {
  const bikes = (data.bikes as Array<Record<string, unknown>>) ?? [];
  const transactionDate = String(
    data.transactiondate ?? data.transactionDate ?? new Date().toISOString()
  );
  const mapped = bikes.map((b) => ({
    idcode: b.idcode != null ? String(b.idcode) : undefined,
    bikeid: b.bikeid != null ? String(b.bikeid) : undefined,
    idtype: b.idtype != null ? Number(b.idtype) : undefined,
    transactiondate:
      b.transactiondate != null ? String(b.transactiondate) : undefined,
  }));
  const result = await addSyncToWachtrij({
    bikes: mapped,
    bikeparkID: locationid,
    sectionID: sectionid,
    transactionDate,
  });
  return okResult({ id: result.id });
}

export async function setOccupationV3(
  locationid: string,
  sectionid: string,
  data: Record<string, unknown>
): Promise<FmsOkResult> {
  const transactionDate = parseDate(data.transactiondate ?? data.transactionDate);
  const interval = Number(data.intervalinminutes ?? 15);
  const payload = {
    occupation: Number(data.occupation),
    timestamp: transactionDate,
    checkins: data.checkins != null ? Number(data.checkins) : undefined,
    checkouts: data.checkouts != null ? Number(data.checkouts) : undefined,
    interval,
    rawData: JSON.stringify(data).slice(0, 255),
  };
  const result = await reportOccupationData(locationid, sectionid, payload);
  return okResult({ id: result.tmpId });
}

export async function occupationAndSyncV3(
  locationid: string,
  sectionid: string,
  data: Record<string, unknown>
): Promise<FmsOkResult> {
  let last: FmsOkResult = okResult();
  if (data.bikes != null) {
    last = await syncSectorV3(locationid, sectionid, data);
    if (last.status !== 1) return last;
  }
  if (data.occupation != null) {
    last = await setOccupationV3(locationid, sectionid, data);
  }
  return last;
}

export async function koppelpasV3(
  citycode: string,
  locationid: string,
  idtype: number,
  idcode: string,
  newidcodes: Record<string, unknown>
): Promise<FmsOkResult> {
  if (idtype !== 3 && idtype !== 4) {
    throw new Error("Alleen tijdelijke passen (idtype=3 of 4) kunnen worden omgezet");
  }

  const siteId = await getCouncilSiteId(citycode);
  if (!siteId) {
    throw new Error(`Gemeente ${citycode} niet gevonden`);
  }

  let tempPassId = idcode;
  if (idtype === 3) {
    tempPassId = `#${idcode}`;
  }

  const tempPasstype = idtype === 4 ? "tmp_sleutelhanger" : "tijdelijk";

  const tempBikepass = await prisma.accounts_pasids.findFirst({
    where: { SiteID: siteId, PasID: tempPassId, Pastype: tempPasstype },
    select: { ID: true, PasID: true, Pastype: true, AccountID: true },
  });
  if (!tempBikepass) {
    throw new Error(`ID met id ${idcode} niet gevonden`);
  }

  const newIdcode = String(newidcodes.idcode ?? "");
  const newIdtype = Number(newidcodes.idtype ?? 1);
  if (!newIdcode) {
    return errorResult("newidcodes.idcode required");
  }
  const newPasstype = passtype2string(newIdtype);

  const newBikepass = await getBikepassByPassId(
    prisma,
    newIdcode,
    siteId,
    newPasstype,
    false
  );

  await prisma.abonnementen.updateMany({
    where: { bikepassID: tempBikepass.ID },
    data: { bikepassID: newBikepass.ID },
  });

  await prisma.transacties.updateMany({
    where: {
      PasID: tempBikepass.PasID,
      Pastype: passtype2integer(tempPasstype),
    },
    data: {
      PasID: newIdcode,
      Pastype: passtype2integer(newPasstype),
    },
  });

  await prisma.accounts_pasids.delete({
    where: { ID: tempBikepass.ID },
  });

  void logFmsCall(
    "koppelpas",
    locationid,
    `${tempPassId} -> ${newIdcode} (${newPasstype})`
  );

  return okResult();
}
