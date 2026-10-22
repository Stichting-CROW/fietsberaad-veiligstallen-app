import { createHash } from "node:crypto";

export const TEST_LOGIN_PASSWORD = "teststalling";

export type Anonymizer = {
  passwordHash: string;
  passwordApi: string;
};

const ORG_ITEM_TYPES = new Set(["organizations", "exploitant", "admin", "dataprovider"]);

const PAS_COLUMNS = new Set([
  "PasID",
  "passID",
  "RFID",
  "RFIDBike",
  "barcodeFiets",
  "BarcodeFiets_in",
  "BarcodeFiets_uit",
  "Barcode",
]);

export function stableToken(value: string, length = 32): string {
  return createHash("sha256").update(`vs-test:${value}`).digest("hex").slice(0, length);
}

export function fakeEmail(kind: string, id: string): string {
  return `${kind}-${stableToken(id, 10)}@example.test`;
}

function text(value: unknown): string {
  return value == null ? "" : String(value);
}

function clear(row: Record<string, unknown>, columns: string[]): void {
  for (const column of columns) {
    if (column in row) row[column] = null;
  }
}

function rewritePasColumns(row: Record<string, unknown>): void {
  for (const column of PAS_COLUMNS) {
    if (!(column in row)) continue;
    const current = text(row[column]).trim();
    if (!current) continue;
    const max = column === "PasID" || column === "passID" ? 32 : 32;
    row[column] = stableToken(current, max);
  }
}

function scrubIban(value: unknown): unknown {
  const current = text(value);
  if (!current) return value;
  if (/[A-Z]{2}\d{2}[A-Z0-9]{8,}/i.test(current) || current.includes("@")) return null;
  return value;
}

export function transformRow(table: string, row: Record<string, unknown>, ctx: Anonymizer): Record<string, unknown> {
  if (table === "accounts") {
    const id = text(row.ID);
    row.Email = fakeEmail("user", id);
    row.EncryptedPassword = ctx.passwordHash;
    clear(row, ["FirstName", "MiddleName", "LastName", "Address", "Address_Nr", "Zip", "City", "Phone", "Mobile", "Sex"]);
    row.FirstName = "Test";
    row.LastName = stableToken(id, 6);
    return row;
  }

  if (table === "accounts_pasids") {
    row.Naam = null;
    rewritePasColumns(row);
    return row;
  }

  if (table === "contacts") {
    const id = text(row.ID);
    const itemType = text(row.ItemType);
    clear(row, [
      "FirstName", "MiddleName", "LastName", "Initials", "Title", "Sex",
      "Address1", "Address2", "Zip1", "Zip2", "City1", "City2",
      "Phone1", "Phone2", "Mobile1", "Mobile2", "Fax1", "Fax2",
      "Email1", "Email2", "JobTitle", "Department",
    ]);
    if ("Email1" in row) row.Email1 = fakeEmail("contact", id);
    if ("Helpdesk" in row && text(row.Helpdesk).includes("@")) row.Helpdesk = null;
    if (!ORG_ITEM_TYPES.has(itemType)) row.CompanyName = "Contactpersoon";
    return row;
  }

  if (table === "security_users") {
    const id = text(row.UserID);
    const username = text(row.UserName);
    if (username !== "beheer@example.test") {
      row.UserName = fakeEmail("beheerder", id);
      row.DisplayName = "Beheerder";
    }
    row.EncryptedPassword = ctx.passwordHash;
    row.EncryptedPassword2 = ctx.passwordApi;
    return row;
  }

  if (table === "financialtransactions") {
    row.mollieTransactionID = null;
    row.description = scrubIban(row.description);
    return row;
  }

  if (table === "account_transacties") {
    row.bankrekening = null;
    row.tnv = null;
    row.MollieTransactionID = null;
    row.omschrijving = scrubIban(row.omschrijving);
    return row;
  }

  if (table === "transacties" || table === "barcoderegister") {
    rewritePasColumns(row);
    return row;
  }

  return row;
}
