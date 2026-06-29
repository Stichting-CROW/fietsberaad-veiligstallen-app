import { prisma } from "~/server/db";
import { resolveExistingTableNames } from "~/server/utils/mysql-schema-tables";

export type BarcodeReportWachtrijRow = {
  tableName: string;
  payloadField: string;
  payload: string;
  fields: Record<string, unknown>;
};

const WACHTRIJ_CANDIDATE_TABLES = [
  "wachtrij_transacties",
  "wachtrij_transacties_archive20250406",
  "wachtrij_pasids",
  "wachtrij_pasids_archive20250406",
  "wachtrij_sync",
] as const;

type WachtrijTableKind = "transactie" | "pasids" | "sync";

function wachtrijTableKind(tableName: string): WachtrijTableKind | null {
  const lower = tableName.toLowerCase();
  if (lower.endsWith("_sync")) return "sync";
  if (lower.includes("_pasids")) return "pasids";
  if (lower.includes("_transacties")) return "transactie";
  return null;
}

function payloadFieldForKind(kind: WachtrijTableKind): string {
  switch (kind) {
    case "transactie":
      return "transaction";
    case "pasids":
      return "bike";
    case "sync":
      return "bikes";
  }
}

function escapeSqlString(value: string): string {
  return value.replace(/'/g, "''");
}

function escapeSqlLike(value: string): string {
  return escapeSqlString(value).replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

function serializeValue(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (
    value !== null &&
    typeof value === "object" &&
    "toNumber" in value &&
    typeof (value as { toNumber: () => number }).toNumber === "function"
  ) {
    return (value as { toNumber: () => number }).toNumber();
  }
  return value;
}

function serializeRecord(record: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    out[key] = serializeValue(value);
  }
  return out;
}

function toWachtrijRow(
  tableName: string,
  payloadField: string,
  record: Record<string, unknown>
): BarcodeReportWachtrijRow {
  const payload = String(record[payloadField] ?? "");
  const fields = serializeRecord(record);
  delete fields[payloadField];
  return { tableName, payloadField, payload, fields };
}

function whereClause(kind: WachtrijTableKind, barcodeFiets: string): string {
  const escaped = escapeSqlLike(barcodeFiets);
  switch (kind) {
    case "transactie":
      return `\`transaction\` LIKE '%${escaped}%' ESCAPE '\\\\'`;
    case "pasids":
      return `\`barcode\` = '${escapeSqlString(barcodeFiets)}' OR \`bike\` LIKE '%${escapeSqlLike(barcodeFiets)}%' ESCAPE '\\\\'`;
    case "sync":
      return `\`bikes\` LIKE '%${escaped}%' ESCAPE '\\\\'`;
  }
}

function orderClause(kind: WachtrijTableKind): string {
  if (kind === "sync") {
    return "ORDER BY transactionDate DESC, ID DESC";
  }
  if (kind === "pasids") {
    return "ORDER BY transactionDate DESC, ID DESC";
  }
  return "ORDER BY transactionDate DESC, ID DESC";
}

async function loadWachtrijTableRows(
  tableName: string,
  barcodeFiets: string
): Promise<BarcodeReportWachtrijRow[]> {
  const kind = wachtrijTableKind(tableName);
  if (!kind) return [];

  const payloadField = payloadFieldForKind(kind);
  const rows = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(
    `SELECT * FROM \`${tableName.replace(/`/g, "")}\`
     WHERE ${whereClause(kind, barcodeFiets)}
     ${orderClause(kind)}`
  );

  return rows.map((row) => toWachtrijRow(tableName, payloadField, row));
}

export async function loadWachtrijRowsForBarcode(
  barcodeFiets: string
): Promise<BarcodeReportWachtrijRow[]> {
  const existingTables = await resolveExistingTableNames(WACHTRIJ_CANDIDATE_TABLES);
  const existingLower = new Set(existingTables.map((name) => name.toLowerCase()));

  const tablesToQuery = WACHTRIJ_CANDIDATE_TABLES.filter((name) => existingLower.has(name.toLowerCase()));

  const rowGroups = await Promise.all(
    tablesToQuery.map(async (tableName) => {
      const actualName =
        existingTables.find((name) => name.toLowerCase() === tableName.toLowerCase()) ?? tableName;
      try {
        return await loadWachtrijTableRows(actualName, barcodeFiets);
      } catch (error) {
        console.warn(
          `[barcode-report-wachtrij] Skipping ${actualName}:`,
          error instanceof Error ? error.message : error
        );
        return [];
      }
    })
  );

  const rows = rowGroups.flat();

  rows.sort((a, b) => {
    const dateA = String(a.fields.transactionDate ?? a.fields.dateCreated ?? a.fields.DateCreated ?? "");
    const dateB = String(b.fields.transactionDate ?? b.fields.dateCreated ?? b.fields.DateCreated ?? "");
    if (dateA !== dateB) return dateB.localeCompare(dateA);
    return Number(b.fields.ID ?? 0) - Number(a.fields.ID ?? 0);
  });

  return rows;
}
