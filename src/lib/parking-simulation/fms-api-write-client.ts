/**
 * Client for FMS REST v2 API write calls.
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

export async function reportOccupationData(
  creds: FmsCredentials,
  bikeparkID: string,
  sectionID: string,
  payload: {
    occupation: number;
    timestamp?: string | Date;
    capacity?: number;
    checkins?: number;
    checkouts?: number;
    open?: boolean;
    interval?: number;
    source?: string;
    rawData?: string;
  }
): Promise<{ id?: number; message?: string; status?: number }> {
  const url = buildUrl(creds.baseUrl ?? getBaseUrl(), `/api/fms/v2/reportOccupationData/${bikeparkID}/${sectionID}`);
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

// ─── Bulk write methods ─────────────────────────────────────────────────────

export async function uploadTransactions(
  creds: FmsCredentials,
  bikeparkID: string,
  sectionID: string,
  txs: Array<{
    type: "in" | "out" | "In" | "Out";
    transactionDate: string;
    passID?: string;
    idcode?: string;
    idtype?: number;
    barcodeBike?: string;
    bikeid?: string;
    price?: number;
    placeID?: number;
    externalPlaceID?: string;
    typeCheck?: string;
    [key: string]: unknown;
  }>
): Promise<{ ids?: number[]; message?: string; status?: number }> {
  const url = buildUrl(creds.baseUrl ?? getBaseUrl(), `/api/fms/v2/uploadJsonTransactions/${bikeparkID}/${sectionID}`);
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: basicAuth(creds.username, creds.password),
    },
    body: JSON.stringify(txs),
  });
  return res.json();
}

export async function addSaldos(
  creds: FmsCredentials,
  bikeparkID: string,
  saldos: Array<{
    passID?: string;
    idcode?: string;
    idtype?: number;
    transactionDate: string;
    amount: number;
    paymentTypeID?: number;
  }>
): Promise<{ ids?: number[]; message?: string; status?: number }> {
  const url = buildUrl(creds.baseUrl ?? getBaseUrl(), `/api/fms/v2/addJsonSaldos/${bikeparkID}`);
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: basicAuth(creds.username, creds.password),
    },
    body: JSON.stringify(saldos),
  });
  return res.json();
}

export async function saveBikes(
  creds: FmsCredentials,
  bikeparkID: string,
  bikes: Array<{
    barcode: string;
    passID: string;
    RFID?: string;
    RFIDBike?: string;
    biketypeID?: number;
  }>
): Promise<{ ids?: number[]; message?: string; status?: number }> {
  const url = buildUrl(creds.baseUrl ?? getBaseUrl(), `/api/fms/v2/saveJsonBikes/${bikeparkID}`);
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: basicAuth(creds.username, creds.password),
    },
    body: JSON.stringify(bikes),
  });
  return res.json();
}

export async function updateLocker(
  creds: FmsCredentials,
  bikeparkID: string,
  sectionID: string,
  placeID: string,
  payload: {
    statuscode: number;
    transactionDate?: string;
    transactionExpiryDate?: string;
    cost?: number;
    paymentTypeID?: number;
    typeCheck?: string;
  }
): Promise<{ message?: string; status?: number }> {
  const url = buildUrl(creds.baseUrl ?? getBaseUrl(), `/api/fms/v2/updateLocker/${bikeparkID}/${sectionID}/${placeID}`);
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

// ─── Subscription methods ────────────────────────────────────────────────────

export async function addSubscription(
  creds: FmsCredentials,
  bikeparkID: string,
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
): Promise<{ id?: number; message?: string; status?: number }> {
  const url = buildUrl(creds.baseUrl ?? getBaseUrl(), `/api/fms/v2/addSubscription/${bikeparkID}`);
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

export async function subscribe(
  creds: FmsCredentials,
  bikeparkID: string,
  payload: { subscriptionID: number; passID: string }
): Promise<{ message?: string; status?: number }> {
  const url = buildUrl(creds.baseUrl ?? getBaseUrl(), `/api/fms/v2/subscribe/${bikeparkID}`);
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
