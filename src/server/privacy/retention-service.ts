import { prisma } from "~/server/db";
import { executeActionChunk, type PrivacyDb } from "./retention-execute";
import {
  ACTION_KEYS,
  CHUNK_SIZE,
  newWriteCode,
  type ActionKey,
  type RetentionMode,
  RetentionGuardError,
  actionHeading,
} from "./retention-rules";

type RunStatus = "running" | "stepping" | "done" | "failed" | "afgebroken";

export type RetentionRun = {
  id: number;
  mode: RetentionMode;
  status: RunStatus;
  startedBy: string | null;
  startedAt: Date;
  updatedAt: Date;
  finishedAt: Date | null;
  currentAction: string | null;
  cursorId: string | null;
  logText: string | null;
  errorText: string | null;
};

export type RetentionActionRow = {
  id: number;
  runId: number;
  actionKey: string;
  heading: string;
  rowsMatched: number;
  rowsChanged: number;
  status: string;
  detail: string | null;
};

let tablesReady = false;

export function writesEnabled(): boolean {
  if (process.env.NEXT_PUBLIC_APP_ENV === "production") {
    return process.env.PRIVACY_RETENTION_WRITES === "1";
  }
  return true;
}

export function cronWriteAllowed(): boolean {
  return process.env.NEXT_PUBLIC_APP_ENV === "production" && process.env.PRIVACY_RETENTION_WRITES === "1";
}

function asDb(client: { $queryRawUnsafe: Function; $executeRawUnsafe: Function }): PrivacyDb {
  return {
    async query<T>(sql: string, params: unknown[]): Promise<T[]> {
      return client.$queryRawUnsafe(sql, ...params);
    },
    async execute(sql: string, params: unknown[]): Promise<number> {
      const count = await client.$executeRawUnsafe(sql, ...params);
      return Number(count);
    },
  };
}

function num(value: unknown): number {
  if (typeof value === "bigint") return Number(value);
  return Number(value);
}

export async function ensureRetentionTables(): Promise<void> {
  if (tablesReady) return;
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS privacy_retention_runs (
      id INT NOT NULL AUTO_INCREMENT,
      mode VARCHAR(16) NOT NULL,
      status VARCHAR(16) NOT NULL,
      startedBy VARCHAR(255) NULL,
      startedAt DATETIME(0) NOT NULL,
      updatedAt DATETIME(0) NOT NULL,
      finishedAt DATETIME(0) NULL,
      currentAction VARCHAR(64) NULL,
      cursorId VARCHAR(64) NULL,
      logText MEDIUMTEXT NULL,
      errorText TEXT NULL,
      PRIMARY KEY (id),
      INDEX privacy_retention_runs_status (status)
    ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS privacy_retention_actions (
      id INT NOT NULL AUTO_INCREMENT,
      runId INT NOT NULL,
      actionKey VARCHAR(64) NOT NULL,
      heading VARCHAR(255) NOT NULL,
      rowsMatched INT NOT NULL DEFAULT 0,
      rowsChanged INT NOT NULL DEFAULT 0,
      status VARCHAR(16) NOT NULL,
      detail TEXT NULL,
      PRIMARY KEY (id),
      INDEX privacy_retention_actions_run (runId)
    ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
  `);
  tablesReady = true;
}

function asDate(value: unknown): Date {
  return value instanceof Date ? value : new Date(String(value));
}

function mapRun(row: Record<string, unknown>): RetentionRun {
  return {
    id: num(row.id),
    mode: row.mode === "write" ? "write" : "dry-run",
    status: String(row.status) as RunStatus,
    startedBy: row.startedBy == null ? null : String(row.startedBy),
    startedAt: asDate(row.startedAt),
    updatedAt: asDate(row.updatedAt),
    finishedAt: row.finishedAt == null ? null : asDate(row.finishedAt),
    currentAction: row.currentAction == null ? null : String(row.currentAction),
    cursorId: row.cursorId == null ? null : String(row.cursorId),
    logText: row.logText == null ? null : String(row.logText),
    errorText: row.errorText == null ? null : String(row.errorText),
  };
}

async function readRun(id: number, client: PrivacyDb = asDb(prisma)): Promise<RetentionRun | null> {
  const rows = await client.query<Record<string, unknown>>(
    "SELECT * FROM privacy_retention_runs WHERE id = ?",
    [id],
  );
  return rows[0] ? mapRun(rows[0]) : null;
}

export async function listRuns(): Promise<RetentionRun[]> {
  await ensureRetentionTables();
  const rows = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(
    "SELECT * FROM privacy_retention_runs ORDER BY id DESC LIMIT 50",
  );
  return rows.map(mapRun);
}

export async function getRun(id: number): Promise<{ run: RetentionRun; actions: RetentionActionRow[] } | null> {
  await ensureRetentionTables();
  const run = await readRun(id);
  if (!run) return null;
  const actions = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(
    "SELECT * FROM privacy_retention_actions WHERE runId = ? ORDER BY id",
    id,
  );
  return {
    run,
    actions: actions.map((row) => ({
      id: num(row.id),
      runId: num(row.runId),
      actionKey: String(row.actionKey),
      heading: String(row.heading),
      rowsMatched: num(row.rowsMatched),
      rowsChanged: num(row.rowsChanged),
      status: String(row.status),
      detail: row.detail == null ? null : String(row.detail),
    })),
  };
}

const WRITE_CODE_TTL_MS = 30 * 60 * 1000;
const writeCodes = new Map<string, { code: string; expiresAt: number }>();

export function issueWriteCode(userKey: string): string {
  const existing = writeCodes.get(userKey);
  if (existing && existing.expiresAt > Date.now()) return existing.code;
  const code = newWriteCode();
  writeCodes.set(userKey, { code, expiresAt: Date.now() + WRITE_CODE_TTL_MS });
  return code;
}

function assertPageWriteCode(userKey: string, typed: string): void {
  const existing = writeCodes.get(userKey);
  if (!existing || existing.expiresAt <= Date.now() || typed !== existing.code) {
    throw new RetentionGuardError("herhaal de code om een schrijfrun te starten");
  }
}

export function rotateWriteCode(userKey: string): string {
  const code = newWriteCode();
  writeCodes.set(userKey, { code, expiresAt: Date.now() + WRITE_CODE_TTL_MS });
  return code;
}

async function findActive(): Promise<RetentionRun | null> {
  const rows = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(
    `SELECT * FROM privacy_retention_runs
     WHERE status IN ('running', 'stepping')
     ORDER BY id DESC LIMIT 1`,
  );
  return rows[0] ? mapRun(rows[0]) : null;
}

export async function startRun(input: {
  mode: RetentionMode;
  startedBy: string;
  confirm: string;
  source: "page" | "cron";
}): Promise<RetentionRun> {
  if (input.mode === "write" && input.source === "page") {
    assertPageWriteCode(input.startedBy, input.confirm);
    if (!writesEnabled()) {
      throw new RetentionGuardError("schrijven op productie staat uit tot PRIVACY_RETENTION_WRITES=1");
    }
  }
  if (input.mode === "write" && input.source === "cron" && !cronWriteAllowed()) {
    throw new RetentionGuardError("cron mag alleen schrijven op productie met PRIVACY_RETENTION_WRITES=1");
  }

  await ensureRetentionTables();
  const active = await findActive();
  if (active && active.updatedAt.getTime() > Date.now() - 10 * 60 * 1000) {
    throw new RetentionGuardError(`run ${active.id} is nog bezig`);
  }
  if (active) {
    await prisma.$executeRawUnsafe(
      "UPDATE privacy_retention_runs SET status = 'failed', errorText = ?, finishedAt = NOW(), updatedAt = NOW() WHERE id = ?",
      "geen voortgang, run afgebroken",
      active.id,
    );
  }

  const first = ACTION_KEYS[0];
  const id = await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(
      `INSERT INTO privacy_retention_runs
        (mode, status, startedBy, startedAt, updatedAt, currentAction, logText)
       VALUES (?, 'running', ?, NOW(), NOW(), ?, ?)`,
      input.mode,
      input.startedBy.slice(0, 255),
      first,
      `${input.mode === "write" ? "Schrijfrun" : "Simulatie"} gestart door ${input.startedBy}`,
    );
    const inserted = await tx.$queryRawUnsafe<{ id: unknown }[]>("SELECT LAST_INSERT_ID() AS id");
    const runId = num(inserted[0]?.id);
    for (const key of ACTION_KEYS) {
      await tx.$executeRawUnsafe(
        `INSERT INTO privacy_retention_actions (runId, actionKey, heading, rowsMatched, rowsChanged, status)
         VALUES (?, ?, ?, 0, 0, 'pending')`,
        runId,
        key,
        actionHeading(key),
      );
    }
    return runId;
  });
  const run = await readRun(id);
  if (!run) throw new RetentionGuardError("run kon niet worden gelezen");
  return run;
}

export async function abortRun(runId: number): Promise<RetentionRun> {
  await ensureRetentionTables();
  const stopped = await prisma.$executeRawUnsafe(
    `UPDATE privacy_retention_runs
     SET status = 'afgebroken', errorText = NULL, finishedAt = NOW(), updatedAt = NOW(),
         logText = CONCAT(IFNULL(logText, ''), '\nRun afgebroken.')
     WHERE id = ? AND status IN ('running', 'stepping')`,
    runId,
  );
  if (Number(stopped) === 1) {
    await prisma.$executeRawUnsafe(
      `UPDATE privacy_retention_actions SET status = 'afgebroken', detail = 'afgebroken'
       WHERE runId = ? AND status = 'running'`,
      runId,
    );
  }
  const run = await readRun(runId);
  if (!run) throw new RetentionGuardError("run niet gevonden");
  return run;
}

export async function stepRun(runId: number): Promise<RetentionRun> {
  await ensureRetentionTables();
  const locked = await prisma.$executeRawUnsafe(
    `UPDATE privacy_retention_runs
     SET status = 'stepping', updatedAt = NOW()
     WHERE id = ?
     AND (
       status = 'running'
       OR (status = 'stepping' AND updatedAt < DATE_SUB(NOW(), INTERVAL 10 MINUTE))
     )`,
    runId,
  );
  if (Number(locked) !== 1) {
    const current = await readRun(runId);
    if (!current) throw new RetentionGuardError("run niet gevonden");
    if (current.status === "done" || current.status === "failed" || current.status === "afgebroken") return current;
    throw new RetentionGuardError("deze run wordt al uitgevoerd");
  }

  try {
    await prisma.$transaction(
      async (tx) => {
        const db = asDb(tx);
        const run = await readRun(runId, db);
        if (!run) throw new RetentionGuardError("run niet gevonden");
        const action = (run.currentAction ?? ACTION_KEYS[0]) as ActionKey;
        if (!ACTION_KEYS.includes(action)) throw new RetentionGuardError("onbekende actie");
        const clockRows = await db.query<{ d: Date }>("SELECT CURDATE() AS d", []);
        const rawClock = clockRows[0]?.d;
        const asOf = rawClock instanceof Date ? rawClock : new Date(String(rawClock));
        const chunk = await executeActionChunk(db, action, run.cursorId, asOf, CHUNK_SIZE, run.mode);
        const log = `${run.logText ?? ""}\n${chunk.logLine}`.slice(-200_000);
        await tx.$executeRawUnsafe(
          `UPDATE privacy_retention_actions
           SET rowsMatched = rowsMatched + ?, rowsChanged = rowsChanged + ?, status = ?, detail = ?
           WHERE runId = ? AND actionKey = ?`,
          chunk.rowsMatched,
          chunk.rowsChanged,
          chunk.doneAction ? "done" : "running",
          chunk.logLine,
          runId,
          action,
        );
        if (!chunk.doneAction) {
          await tx.$executeRawUnsafe(
            `UPDATE privacy_retention_runs
             SET status = 'running', cursorId = ?, logText = ?, updatedAt = NOW(), errorText = NULL
             WHERE id = ?`,
            chunk.nextCursor,
            log,
            runId,
          );
          return;
        }
        const index = ACTION_KEYS.indexOf(action);
        const next = ACTION_KEYS[index + 1];
        if (!next) {
          await tx.$executeRawUnsafe(
            `UPDATE privacy_retention_runs
             SET status = 'done', currentAction = NULL, cursorId = NULL, logText = ?, finishedAt = NOW(), updatedAt = NOW(), errorText = NULL
             WHERE id = ?`,
            `${log}\nKlaar.`,
            runId,
          );
          return;
        }
        await tx.$executeRawUnsafe(
          `UPDATE privacy_retention_runs
           SET status = 'running', currentAction = ?, cursorId = NULL, logText = ?, updatedAt = NOW(), errorText = NULL
           WHERE id = ?`,
          next,
          log,
          runId,
        );
      },
      { timeout: 120_000, maxWait: 10_000 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await prisma.$executeRawUnsafe(
      `UPDATE privacy_retention_runs
       SET status = 'failed', errorText = ?, finishedAt = NOW(), updatedAt = NOW(),
           logText = CONCAT(IFNULL(logText, ''), '\nMislukt: ', ?)
       WHERE id = ?`,
      message.slice(0, 4000),
      message.slice(0, 1000),
      runId,
    );
    throw error;
  }

  const updated = await readRun(runId);
  if (!updated) throw new RetentionGuardError("run niet gevonden");
  return updated;
}

export async function cronTick(write: boolean): Promise<{ done: boolean; skipped?: string; run: RetentionRun | null }> {
  if (write && !cronWriteAllowed()) {
    throw new RetentionGuardError("cron mag alleen schrijven op productie met PRIVACY_RETENTION_WRITES=1");
  }
  await ensureRetentionTables();
  const active = await findActive();
  if (active && active.mode === "write" && !write) {
    return { done: true, skipped: "write-run-in-progress", run: active };
  }
  if (active && active.mode === "dry-run" && write) {
    return { done: true, skipped: "dry-run-in-progress", run: active };
  }
  const run = active ?? (await startRun({
    mode: write ? "write" : "dry-run",
    startedBy: "cron",
    confirm: "",
    source: "cron",
  }));
  const stepped = await stepRun(run.id);
  return { done: stepped.status === "done" || stepped.status === "failed" || stepped.status === "afgebroken", run: stepped };
}
