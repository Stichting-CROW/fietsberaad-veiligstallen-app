/**
 * Client for FMS REST v2 API calls.
 * Used by simulation; credentials from session/settings.
 * Always pass transactionDate from simulation clock.
 */

export interface FmsCredentials {
  username: string;
  password: string;
  baseUrl?: string;
}

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

export async function uploadTransaction(
  creds: FmsCredentials,
  bikeparkID: string,
  sectionID: string,
  tx: {
    type: "in" | "out" | "In" | "Out";
    transactionDate: string;
    passID?: string;
    idcode?: string;
    idtype?: number;
    barcodeBike?: string;
    bikeid?: string;
    price?: number;
    placeID?: number;
    typeCheck?: string;
    [key: string]: unknown;
  }
): Promise<{ id?: number; message?: string; status?: number }> {
  const url = buildUrl(creds.baseUrl ?? getBaseUrl(), `/api/fms/v2/uploadJsonTransaction/${bikeparkID}/${sectionID}`);
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: basicAuth(creds.username, creds.password),
    },
    body: JSON.stringify(tx),
  });
  return res.json();
}

export async function syncSector(
  creds: FmsCredentials,
  bikeparkID: string,
  sectionID: string,
  payload: {
    bikes: Array<{ idcode?: string; bikeid?: string; idtype?: number; transactiondate?: string }>;
    transactionDate: string;
  }
): Promise<{ id?: number; message?: string; status?: number }> {
  const url = buildUrl(creds.baseUrl ?? getBaseUrl(), `/api/fms/v2/syncSector/${bikeparkID}/${sectionID}`);
  const res = await fetch(url, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: basicAuth(creds.username, creds.password),
    },
    body: JSON.stringify(payload),
  });
  return res.json();
}

export async function addSaldo(
  creds: FmsCredentials,
  bikeparkID: string,
  payload: {
    passID?: string;
    idcode?: string;
    idtype?: number;
    transactionDate: string;
    amount: number;
    paymentTypeID?: number;
  }
): Promise<{ id?: number; message?: string; status?: number }> {
  const url = buildUrl(creds.baseUrl ?? getBaseUrl(), `/api/fms/v2/addJsonSaldo/${bikeparkID}`);
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: basicAuth(creds.username, creds.password),
    },
    body: JSON.stringify(payload),
  });
  return res.json();
}

export async function saveBike(
  creds: FmsCredentials,
  bikeparkID: string,
  payload: {
    barcode: string;
    passID: string;
    RFID?: string;
    RFIDBike?: string;
    biketypeID?: number;
  }
): Promise<{ id?: number; message?: string; status?: number }> {
  const url = buildUrl(creds.baseUrl ?? getBaseUrl(), `/api/fms/v2/saveJsonBike/${bikeparkID}`);
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: basicAuth(creds.username, creds.password),
    },
    body: JSON.stringify(payload),
  });
  return res.json();
}
