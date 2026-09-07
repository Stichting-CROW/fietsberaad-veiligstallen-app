/**
 * FMS v4 write client for parking simulation.
 * Always pass transactionDate / checkindate from the simulation clock.
 *
 * Writes use Basic Auth (operator / dataprovider.type2) plus ENABLE_WRITE_API.
 * `credentials: "include"` only forwards a session cookie harmlessly.
 */

import { citycodeFromLocationId } from "~/lib/parking-simulation/managed-transaction";
import type { ManagedWriteScope } from "~/lib/parking-simulation/credentials";

export interface FmsCredentials {
  username: string;
  password: string;
  baseUrl?: string;
}

export type FmsWriteResult = { id?: number; ids?: number[]; message?: string; status?: number };

function getBaseUrl(override?: string | null): string {
  if (override) return override;
  if (typeof window !== "undefined") return window.location.origin;
  return "http://localhost:3000";
}

function basicAuth(username: string, password: string): string {
  return `Basic ${btoa(`${username}:${password}`)}`;
}

function buildUrl(baseUrl: string, path: string): string {
  const base = baseUrl.replace(/\/$/, "");
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${base}${p}`;
}

function v4Location(citycode: string, locationid: string, suffix = ""): string {
  return `/api/fms/v4/citycodes/${encodeURIComponent(citycode)}/locations/${encodeURIComponent(locationid)}${suffix}`;
}

async function fmsPost(
  creds: FmsCredentials,
  path: string,
  body: unknown
): Promise<FmsWriteResult> {
  const url = buildUrl(creds.baseUrl ?? getBaseUrl(), path);
  const res = await fetch(url, {
    credentials: "include",
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: basicAuth(creds.username, creds.password),
    },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as FmsWriteResult & { subscriptionid?: number };
  if (!res.ok) {
    return { status: 0, message: json.message ?? res.statusText };
  }
  return { ...json, id: json.id ?? json.subscriptionid };
}

export async function uploadManagedTransaction(
  creds: FmsCredentials,
  citycode: string,
  locationid: string,
  sectionid: string,
  managed: Record<string, unknown>
): Promise<FmsWriteResult> {
  return fmsPost(
    creds,
    v4Location(citycode, locationid, `/sections/${encodeURIComponent(sectionid)}/managedtransactions`),
    { managedtransaction: managed }
  );
}

/** Bikepark-level managedtransactions (default sectionid = locationid unless set on the item). */
export async function uploadManagedTransactionAtLocation(
  creds: FmsCredentials,
  citycode: string,
  locationid: string,
  managed: Record<string, unknown>
): Promise<FmsWriteResult> {
  return fmsPost(
    creds,
    v4Location(citycode, locationid, "/managedtransactions"),
    { managedtransaction: managed }
  );
}

export async function uploadManagedTransactions(
  creds: FmsCredentials,
  citycode: string,
  locationid: string,
  items: Record<string, unknown>[],
  sectionid?: string
): Promise<FmsWriteResult> {
  const suffix = sectionid
    ? `/sections/${encodeURIComponent(sectionid)}/managedtransactions`
    : "/managedtransactions";
  return fmsPost(creds, v4Location(citycode, locationid, suffix), {
    managedtransactions: items,
  });
}

export async function postManagedTransaction(
  creds: FmsCredentials,
  citycode: string,
  locationid: string,
  sectionid: string,
  managed: Record<string, unknown>,
  scope: ManagedWriteScope = "section"
): Promise<FmsWriteResult> {
  if (scope === "location") {
    return uploadManagedTransactionAtLocation(creds, citycode, locationid, {
      ...managed,
      sectionid: managed.sectionid ?? sectionid,
    });
  }
  return uploadManagedTransaction(creds, citycode, locationid, sectionid, managed);
}

export async function postManagedTransactions(
  creds: FmsCredentials,
  citycode: string,
  locationid: string,
  sectionid: string,
  items: Record<string, unknown>[],
  scope: ManagedWriteScope = "section"
): Promise<FmsWriteResult> {
  const withSection = items.map((item) => ({
    ...item,
    sectionid: item.sectionid ?? sectionid,
  }));
  if (scope === "location") {
    return uploadManagedTransactions(creds, citycode, locationid, withSection);
  }
  return uploadManagedTransactions(creds, citycode, locationid, withSection, sectionid);
}

export async function syncSector(
  creds: FmsCredentials,
  locationid: string,
  sectionid: string,
  payload: {
    bikes: Array<{ idcode?: string; bikeid?: string; idtype?: number; transactiondate?: string }>;
    transactionDate: string;
    occupation?: number;
    capacity?: number;
  }
): Promise<FmsWriteResult> {
  const citycode = citycodeFromLocationId(locationid);
  const data: Record<string, unknown> = {
    bikes: payload.bikes,
    transactiondate: payload.transactionDate,
  };
  if (payload.occupation != null) {
    data.occupation = payload.occupation;
    data.checkins = 0;
    data.checkouts = 0;
    data.source = "Lumiguide";
    if (payload.capacity != null) data.capacity = payload.capacity;
  }
  return fmsPost(
    creds,
    v4Location(citycode, locationid, `/sections/${encodeURIComponent(sectionid)}/occupation`),
    { data }
  );
}

/** Report bezetting: POST occupation with data.occupation (not inventarisatie bikes). */
export async function reportBezetting(
  creds: FmsCredentials,
  locationid: string,
  sectionid: string,
  payload: {
    occupation: number;
    capacity?: number;
    transactionDate: string;
  }
): Promise<FmsWriteResult> {
  const citycode = citycodeFromLocationId(locationid);
  return fmsPost(
    creds,
    v4Location(citycode, locationid, `/sections/${encodeURIComponent(sectionid)}/occupation`),
    {
      data: {
        occupation: payload.occupation,
        capacity: payload.capacity,
        transactiondate: payload.transactionDate,
        checkins: 0,
        checkouts: 0,
        source: "Lumiguide",
      },
    }
  );
}

export async function addSaldo(
  creds: FmsCredentials,
  locationid: string,
  payload: {
    passID?: string;
    idcode?: string;
    idtype?: number;
    transactionDate: string;
    amount: number;
    paymentTypeID?: number;
  }
): Promise<FmsWriteResult> {
  const idcode = payload.idcode ?? payload.passID ?? "";
  const idtype = payload.idtype ?? 0;
  const citycode = citycodeFromLocationId(locationid);
  return fmsPost(
    creds,
    v4Location(citycode, locationid, `/idcodes/${idtype}/${encodeURIComponent(idcode)}/balance`),
    {
      amount: payload.amount,
      paymenttypeid: payload.paymentTypeID ?? 1,
      transactiondate: payload.transactionDate,
    }
  );
}

export async function saveBike(
  creds: FmsCredentials,
  locationid: string,
  payload: {
    barcode: string;
    passID: string;
    RFID?: string;
    RFIDBike?: string;
    biketypeID?: number;
  }
): Promise<FmsWriteResult> {
  const citycode = citycodeFromLocationId(locationid);
  return fmsPost(
    creds,
    v4Location(citycode, locationid, `/idcodes/0/${encodeURIComponent(payload.passID)}/bike`),
    {
      bikeid: payload.barcode,
      RFID: payload.RFID,
      RFIDBike: payload.RFIDBike,
      biketypeid: payload.biketypeID,
    }
  );
}

export async function addSubscription(
  creds: FmsCredentials,
  locationid: string,
  payload: {
    subscriptiontypeID: number;
    passID?: string;
    accountID?: string;
    amount?: number;
    paymentTypeID?: number;
    ingangsdatum?: string;
    afloopdatum?: string;
    transactionDate?: string;
  }
): Promise<FmsWriteResult> {
  const citycode = citycodeFromLocationId(locationid);
  return fmsPost(creds, v4Location(citycode, locationid, "/subscriptions"), {
    subscription: {
      subscriptiontypeid: payload.subscriptiontypeID,
      idcode: payload.passID,
      cost: payload.amount ?? 0,
      startdate: payload.ingangsdatum ?? payload.transactionDate,
      expirationdate: payload.afloopdatum,
      idtype: 0,
    },
  });
}

export async function subscribe(
  creds: FmsCredentials,
  locationid: string,
  payload: { subscriptionID: number; passID: string }
): Promise<FmsWriteResult> {
  const citycode = citycodeFromLocationId(locationid);
  return fmsPost(
    creds,
    v4Location(citycode, locationid, `/subscriptions/${payload.subscriptionID}`),
    { idcode: payload.passID }
  );
}
