/**
 * Production privacy retention. The queries in broncode/remote/cronjobs/privacy.cfm are the spec.
 * A run with no actions parameter executes cleartransactions, financialtransactions, and
 * deleteprijswinnaars. The other blocks in that file are not part of that run.
 */

import { randomInt } from "node:crypto";

export const MONTHS_18 = 18;
export const YEARS_7 = 7;
export const YEARS_10 = 10;

export const CHUNK_SIZE = 2000;
export const MAX_CHUNK_SIZE = 5000;
export const WRITE_CODE_LENGTH = 6;
const WRITE_CODE_ALPHABET = "ACEFHJKMNPRTWXY349";

export const ACTION_KEYS = [
  "cleartransactions",
  "archive_financial",
  "clear_financial_transaction_id",
  "delete_prijswinnaars",
  "delete_prijswinnaars_backup",
] as const;

export type ActionKey = (typeof ACTION_KEYS)[number];

export type RetentionMode = "dry-run" | "write";

export class RetentionGuardError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RetentionGuardError";
  }
}

export class RetentionPostConditionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RetentionPostConditionError";
  }
}

/** Tables this job changes. Matches the statements in privacy.cfm, not its header. */
export const COLUMN_MANIFEST: { table: string; column: string; treatment: "null" | "delete-row" }[] = [
  { table: "transacties", column: "*", treatment: "delete-row" },
  { table: "financialtransactions", column: "accountID", treatment: "null" },
  { table: "financialtransactions", column: "transactionID", treatment: "null" },
  { table: "historischesaldos", column: "*", treatment: "delete-row" },
  { table: "prijswinnaars", column: "*", treatment: "delete-row" },
  { table: "prijswinnaars_backup", column: "*", treatment: "delete-row" },
];

const ACTION_HEADINGS: Record<ActionKey, string> = {
  cleartransactions: "1. Transacties ouder dan 18 maanden verwijderen",
  archive_financial: "2. Betalingen ouder dan 18 maanden: saldo archiveren en accountID leegmaken",
  clear_financial_transaction_id: "3. Betalingen ouder dan 7 jaar: transactionID leegmaken",
  delete_prijswinnaars: "5. Prijswinnaars ouder dan 10 jaar verwijderen",
  delete_prijswinnaars_backup: "5b. Prijswinnaars-backup ouder dan 10 jaar verwijderen",
};

export function actionHeading(action: ActionKey): string {
  return ACTION_HEADINGS[action];
}

export function newWriteCode(): string {
  let code = "";
  for (let i = 0; i < WRITE_CODE_LENGTH; i += 1) {
    const char = WRITE_CODE_ALPHABET[randomInt(WRITE_CODE_ALPHABET.length)];
    if (!char) throw new RetentionGuardError("write code");
    code += char;
  }
  return code;
}

export function clampChunkSize(size: number): number {
  if (!Number.isInteger(size) || size < 1) {
    throw new RetentionGuardError("chunk size must be a positive integer");
  }
  return Math.min(size, MAX_CHUNK_SIZE);
}

export function assertAsOf(asOf: Date, now = new Date()): void {
  if (Number.isNaN(asOf.getTime())) {
    throw new RetentionGuardError("retention clock is invalid");
  }
  if (asOf.getTime() > now.getTime() + 36 * 60 * 60 * 1000) {
    throw new RetentionGuardError("retention clock is in the future");
  }
}

export function assertRetentionSql(sql: string, required: string[]): void {
  const compact = sql.replace(/\s+/g, " ");
  if (/\b(DROP|TRUNCATE|ALTER|CREATE|GRANT|LOAD)\b/i.test(compact)) {
    throw new RetentionGuardError("retention SQL refused");
  }
  for (const snippet of required) {
    if (!compact.includes(snippet)) {
      throw new RetentionGuardError(`retention SQL missing required predicate: ${snippet}`);
    }
  }
}

function qmarks(count: number): string {
  if (!Number.isInteger(count) || count < 1 || count > MAX_CHUNK_SIZE) {
    throw new RetentionGuardError("id list length out of range");
  }
  return new Array(count).fill("?").join(", ");
}

export type SqlStatement = { sql: string; params: unknown[] };

/** Exact statement from privacy.cfm. It has no date predicate; nothing else may use that shape. */
export const DELETE_ZERO_SALDO = "DELETE FROM historischesaldos WHERE saldo = 0";

export type ActionPlan = {
  key: ActionKey;
  heading: string;
  /** Snippets that must appear in every write for this action. */
  required: string[];
  count: (asOf: Date) => SqlStatement;
  selectIds: (asOf: Date, cursor: string | null, chunkSize: number) => SqlStatement;
  writes: (asOf: Date, ids: unknown[]) => SqlStatement[];
  /** Runs once when the action has no rows left, including when it never had any. */
  finish?: (asOf: Date) => SqlStatement[];
  survivor: (asOf: Date) => SqlStatement;
};

function olderThan(column: string, amount: number, unit: "MONTH" | "YEAR"): string {
  return `${column} IS NOT NULL AND ${column} < DATE_SUB(?, INTERVAL ${amount} ${unit})`;
}

export function planAction(action: ActionKey): ActionPlan {
  switch (action) {
    case "cleartransactions": {
      const required = [`INTERVAL ${MONTHS_18} MONTH`, "Date_checkout <"];
      const where = `Date_checkout < DATE_SUB(?, INTERVAL ${MONTHS_18} MONTH)`;
      return {
        key: action,
        heading: actionHeading(action),
        required,
        count: (asOf) => ({
          sql: `SELECT COUNT(*) AS n FROM transacties WHERE ${where}`,
          params: [asOf],
        }),
        selectIds: (asOf, cursor, chunkSize) => ({
          sql: `SELECT ID FROM transacties WHERE ${where} AND (? IS NULL OR ID > ?) ORDER BY ID LIMIT ${clampChunkSize(chunkSize)} FOR UPDATE`,
          params: [asOf, cursor, cursor],
        }),
        writes: (asOf, ids) => [
          {
            sql: `DELETE FROM transacties WHERE ID IN (${qmarks(ids.length)}) AND ${where}`,
            params: [...ids, asOf],
          },
        ],
        survivor: (asOf) => ({
          sql: `SELECT ID, PasID, PassUUID, BarcodeFiets_in, BarcodeFiets_uit, FietsenstallingID, Stallingskosten
            FROM transacties
            WHERE Date_checkout IS NULL OR Date_checkout >= DATE_SUB(?, INTERVAL ${MONTHS_18} MONTH)
            ORDER BY ID LIMIT 1`,
          params: [asOf],
        }),
      };
    }
    case "archive_financial": {
      const required = [`INTERVAL ${MONTHS_18} MONTH`, "status = 'ok'"];
      const where = `status = 'ok' AND ${olderThan("transactionDate", MONTHS_18, "MONTH")}`;
      return {
        key: action,
        heading: actionHeading(action),
        required,
        count: (asOf) => ({
          sql: `SELECT COUNT(*) AS n FROM financialtransactions WHERE ${where}`,
          params: [asOf],
        }),
        selectIds: (asOf, cursor, chunkSize) => ({
          sql: `SELECT ID FROM financialtransactions WHERE ${where} AND (? IS NULL OR ID > ?) ORDER BY ID LIMIT ${clampChunkSize(chunkSize)} FOR UPDATE`,
          params: [asOf, cursor, cursor],
        }),
        writes: (asOf, ids) => {
          const inList = qmarks(ids.length);
          const dated = `f.ID IN (${inList}) AND f.status = 'ok' AND f.transactionDate < DATE_SUB(?, INTERVAL ${MONTHS_18} MONTH)`;
          return [
            {
              sql: `INSERT INTO historischesaldos (accountID, siteID, exploitantID, saldo, dateCreated)
                SELECT accountID, siteID, exploitantID, stallingstegoed, CURRENT_TIMESTAMP FROM (
                  SELECT f.accountID AS accountID, f.siteID AS siteID,
                    COALESCE(f.paidToSiteID, f.paidBySiteID, f.sourceSiteID) AS exploitantID,
                    COALESCE(SUM(f.amount), 0) AS stallingstegoed
                  FROM financialtransactions f
                  WHERE ${dated}
                    AND COALESCE(f.paidToSiteID, f.paidBySiteID, f.sourceSiteID) <> '1'
                  GROUP BY f.accountID, COALESCE(f.paidToSiteID, f.paidBySiteID, f.sourceSiteID), f.siteID
                ) x
                WHERE x.stallingstegoed <> 0
                ON DUPLICATE KEY UPDATE saldo = saldo + VALUES(saldo)`,
              params: [...ids, asOf],
            },
            {
              sql: `UPDATE financialtransactions SET status = 'archived', accountID = NULL
                WHERE ID IN (${inList}) AND status = 'ok'
                AND transactionDate < DATE_SUB(?, INTERVAL ${MONTHS_18} MONTH)`,
              params: [...ids, asOf],
            },
          ];
        },
        finish: () => [{ sql: DELETE_ZERO_SALDO, params: [] }],
        survivor: (asOf) => ({
          sql: `SELECT ID, accountID, amount, status, transactionID
            FROM financialtransactions
            WHERE transactionDate IS NULL OR transactionDate >= DATE_SUB(?, INTERVAL ${MONTHS_18} MONTH)
            ORDER BY ID LIMIT 1`,
          params: [asOf],
        }),
      };
    }
    case "clear_financial_transaction_id": {
      const required = [`INTERVAL ${YEARS_7} YEAR`, "transactionID IS NOT NULL"];
      const where = `transactionID IS NOT NULL AND ${olderThan("transactionDate", YEARS_7, "YEAR")}`;
      return {
        key: action,
        heading: actionHeading(action),
        required,
        count: (asOf) => ({
          sql: `SELECT COUNT(*) AS n FROM financialtransactions WHERE ${where}`,
          params: [asOf],
        }),
        selectIds: (asOf, cursor, chunkSize) => ({
          sql: `SELECT ID FROM financialtransactions WHERE ${where} AND (? IS NULL OR ID > ?) ORDER BY ID LIMIT ${clampChunkSize(chunkSize)} FOR UPDATE`,
          params: [asOf, cursor, cursor],
        }),
        writes: (asOf, ids) => [
          {
            sql: `UPDATE financialtransactions SET transactionID = NULL
              WHERE ID IN (${qmarks(ids.length)}) AND transactionID IS NOT NULL AND transactionDate IS NOT NULL
              AND transactionDate < DATE_SUB(?, INTERVAL ${YEARS_7} YEAR)`,
            params: [...ids, asOf],
          },
        ],
        survivor: (asOf) => ({
          sql: `SELECT ID, accountID, amount, status, transactionID
            FROM financialtransactions
            WHERE transactionDate IS NULL OR transactionDate >= DATE_SUB(?, INTERVAL ${YEARS_7} YEAR)
            ORDER BY ID LIMIT 1`,
          params: [asOf],
        }),
      };
    }
    case "delete_prijswinnaars": {
      const required = [`INTERVAL ${YEARS_10} YEAR`, "TijdstipTrekking IS NOT NULL"];
      const where = `t.TijdstipTrekking IS NOT NULL AND t.TijdstipTrekking < DATE_SUB(?, INTERVAL ${YEARS_10} YEAR)`;
      return {
        key: action,
        heading: actionHeading(action),
        required,
        count: (asOf) => ({
          sql: `SELECT COUNT(DISTINCT pw.ID) AS n
            FROM prijswinnaars pw
            INNER JOIN prijzenpot pp ON pp.PrijsID = pw.PrijsID
            INNER JOIN trekkingen t ON t.ID = pp.TrekkingID
            WHERE ${where}`,
          params: [asOf],
        }),
        selectIds: (asOf, cursor, chunkSize) => ({
          sql: `SELECT DISTINCT pw.ID AS ID
            FROM prijswinnaars pw
            INNER JOIN prijzenpot pp ON pp.PrijsID = pw.PrijsID
            INNER JOIN trekkingen t ON t.ID = pp.TrekkingID
            WHERE ${where} AND (? IS NULL OR pw.ID > ?)
            ORDER BY pw.ID LIMIT ${clampChunkSize(chunkSize)}`,
          params: [asOf, cursor, cursor],
        }),
        writes: (asOf, ids) => [
          {
            sql: `DELETE pw FROM prijswinnaars pw
              INNER JOIN prijzenpot pp ON pp.PrijsID = pw.PrijsID
              INNER JOIN trekkingen t ON t.ID = pp.TrekkingID
              WHERE pw.ID IN (${qmarks(ids.length)}) AND ${where}`,
            params: [...ids, asOf],
          },
        ],
        survivor: (asOf) => ({
          sql: `SELECT pw.ID, pw.PasID FROM prijswinnaars pw
            INNER JOIN prijzenpot pp ON pp.PrijsID = pw.PrijsID
            INNER JOIN trekkingen t ON t.ID = pp.TrekkingID
            WHERE t.TijdstipTrekking IS NULL OR t.TijdstipTrekking >= DATE_SUB(?, INTERVAL ${YEARS_10} YEAR)
            ORDER BY pw.ID LIMIT 1`,
          params: [asOf],
        }),
      };
    }
    case "delete_prijswinnaars_backup": {
      const required = [`INTERVAL ${YEARS_10} YEAR`, "TijdstipTrekking IS NOT NULL"];
      const where = `t.TijdstipTrekking IS NOT NULL AND t.TijdstipTrekking < DATE_SUB(?, INTERVAL ${YEARS_10} YEAR)`;
      return {
        key: action,
        heading: actionHeading(action),
        required,
        count: (asOf) => ({
          sql: `SELECT COUNT(*) AS n FROM prijswinnaars_backup b
            INNER JOIN trekkingen t ON t.ID = b.TrekkingID
            WHERE ${where}`,
          params: [asOf],
        }),
        selectIds: (asOf, cursor, chunkSize) => ({
          sql: `SELECT b.ID FROM prijswinnaars_backup b
            INNER JOIN trekkingen t ON t.ID = b.TrekkingID
            WHERE ${where} AND (? IS NULL OR b.ID > ?)
            ORDER BY b.ID LIMIT ${clampChunkSize(chunkSize)}`,
          params: [asOf, cursor, cursor],
        }),
        writes: (asOf, ids) => [
          {
            sql: `DELETE b FROM prijswinnaars_backup b
              INNER JOIN trekkingen t ON t.ID = b.TrekkingID
              WHERE b.ID IN (${qmarks(ids.length)}) AND ${where}`,
            params: [...ids, asOf],
          },
        ],
        survivor: (asOf) => ({
          sql: `SELECT b.ID, b.PasID, b.Email FROM prijswinnaars_backup b
            INNER JOIN trekkingen t ON t.ID = b.TrekkingID
            WHERE t.TijdstipTrekking IS NULL OR t.TijdstipTrekking >= DATE_SUB(?, INTERVAL ${YEARS_10} YEAR)
            ORDER BY b.ID LIMIT 1`,
          params: [asOf],
        }),
      };
    }
    default: {
      const never: never = action;
      throw new RetentionGuardError(`unknown action ${String(never)}`);
    }
  }
}

export function assertWrites(action: ActionKey, statements: SqlStatement[]): void {
  const plan = planAction(action);
  if (statements.length === 0) {
    throw new RetentionGuardError("retention write has no statement");
  }
  for (const statement of statements) {
    assertRetentionSql(statement.sql, plan.required);
  }
}

/** The zero-balance delete is the only write allowed without a date predicate. */
export function assertFinish(statements: SqlStatement[]): void {
  if (statements.length === 0) {
    throw new RetentionGuardError("retention finish has no statement");
  }
  for (const statement of statements) {
    const compact = statement.sql.replace(/\s+/g, " ").trim();
    if (compact !== DELETE_ZERO_SALDO || statement.params.length !== 0) {
      throw new RetentionGuardError("retention finish refused");
    }
  }
}

/** Request bodies cannot change cutoffs. Unknown fields are ignored. */
export function parseRunBody(body: unknown): { op: "start" | "step" | "abort"; mode: RetentionMode; confirm: string; runId: number | null } {
  const record = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const op = record.op === "step" ? "step" : record.op === "abort" ? "abort" : record.op === "start" ? "start" : null;
  if (!op) throw new RetentionGuardError("unknown operation");
  const mode: RetentionMode = record.mode === "write" ? "write" : "dry-run";
  const confirm = typeof record.confirm === "string" ? record.confirm : "";
  const runId = typeof record.runId === "number" && Number.isInteger(record.runId) ? record.runId : null;
  return { op, mode, confirm, runId };
}
