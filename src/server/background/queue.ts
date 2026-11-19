import { prisma } from "~/server/db";
import { ensureBackgroundTables, getSettings, parseJson, toJson } from "./db";
import { getTask } from "./registry";

export const TASK_STATUSES = ["queued", "running", "done", "failed", "cancelled"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];
export type TaskTrigger = "schedule" | "manual" | "app";

export const LEASE_MS = 2 * 60_000;

export type TaskRecord = {
  id: number;
  type: string;
  status: TaskStatus;
  stuck: boolean;
  scheduleKey: string | null;
  trigger: TaskTrigger;
  triggeredBy: string | null;
  runAfter: Date;
  attempts: number;
  maxAttempts: number;
  lockedBy: string | null;
  lockedUntil: Date | null;
  createdAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
  durationMs: number | null;
};

export type TaskDetail = TaskRecord & {
  payload: unknown;
  result: unknown;
  lastError: string | null;
  dedupeKey: string | null;
};

type Row = Record<string, unknown>;

const LIST_COLUMNS =
  "id, type, status, schedule_key, trigger_source, triggered_by, run_after, attempts, max_attempts, locked_by, locked_until, created_at, started_at, finished_at, duration_ms";

const toDate = (value: unknown): Date | null => (value instanceof Date ? value : value ? new Date(String(value)) : null);
const toNum = (value: unknown): number | null => (value === null || value === undefined ? null : Number(value));

function mapRecord(row: Row, now = new Date()): TaskRecord {
  const status = String(row.status) as TaskStatus;
  const lockedUntil = toDate(row.locked_until);
  return {
    id: Number(row.id),
    type: String(row.type),
    status,
    stuck: status === "running" && (!lockedUntil || lockedUntil < now),
    scheduleKey: (row.schedule_key as string | null) ?? null,
    trigger: String(row.trigger_source) as TaskTrigger,
    triggeredBy: (row.triggered_by as string | null) ?? null,
    runAfter: toDate(row.run_after)!,
    attempts: Number(row.attempts),
    maxAttempts: Number(row.max_attempts),
    lockedBy: (row.locked_by as string | null) ?? null,
    lockedUntil,
    createdAt: toDate(row.created_at)!,
    startedAt: toDate(row.started_at),
    finishedAt: toDate(row.finished_at),
    durationMs: toNum(row.duration_ms),
  };
}

export type EnqueueOptions = {
  runAfter?: Date;
  dedupeKey?: string;
  maxAttempts?: number;
  scheduleKey?: string;
  trigger?: TaskTrigger;
  triggeredBy?: string;
};

/** Returns the new task id, or null when a task with the same dedupeKey already exists. */
export async function enqueueTask(type: string, payload?: unknown, options: EnqueueOptions = {}): Promise<number | null> {
  const def = getTask(type);
  if (!def) throw new Error(`Onbekend taaktype: ${type}`);
  await ensureBackgroundTables();
  const now = new Date();
  const trigger = options.trigger ?? "app";
  const maxAttempts = options.maxAttempts ?? def.maxAttempts ?? (trigger === "app" ? 3 : 1);
  try {
    return await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `INSERT INTO background_tasks
          (type, payload, status, schedule_key, trigger_source, triggered_by, run_after, attempts, max_attempts, dedupe_key, created_at)
         VALUES (?, ?, 'queued', ?, ?, ?, ?, 0, ?, ?, ?)`,
        type,
        toJson(payload),
        options.scheduleKey ?? null,
        trigger,
        options.triggeredBy ?? null,
        options.runAfter ?? now,
        Math.max(1, maxAttempts),
        options.dedupeKey ?? null,
        now,
      );
      const rows = await tx.$queryRawUnsafe<{ id: unknown }[]>("SELECT LAST_INSERT_ID() AS id");
      return Number(rows[0]?.id);
    });
  } catch (error) {
    if (options.dedupeKey && isDuplicateKeyError(error)) return null;
    throw error;
  }
}

function isDuplicateKeyError(error: unknown): boolean {
  const text = error instanceof Error ? error.message : String(error);
  return /\b1062\b|Duplicate entry/i.test(text);
}

export type ClaimedTask = { id: number; type: string; payload: unknown; attempts: number; maxAttempts: number };

/**
 * Claims the oldest due task whose type is not already running somewhere with a live lease.
 * Claims are serialised on the claim_lock row so the per-type check cannot race between instances.
 */
export async function claimNextTask(workerId: string, now = new Date(), onlyId?: number): Promise<ClaimedTask | null> {
  await ensureBackgroundTables();
  return prisma.$transaction(async (tx) => {
    await tx.$queryRawUnsafe("SELECT `key` FROM background_settings WHERE `key` = 'claim_lock' FOR UPDATE");
    const rows = await tx.$queryRawUnsafe<Row[]>(
      `SELECT t.id, t.type, t.payload, t.attempts, t.max_attempts
         FROM background_tasks t
        WHERE t.status = 'queued' AND t.run_after <= ?
          ${onlyId === undefined ? "" : "AND t.id = ?"}
          AND NOT EXISTS (
            SELECT 1 FROM background_tasks r
             WHERE r.type = t.type AND r.status = 'running' AND r.locked_until > ?
          )
        ORDER BY t.run_after, t.id
        LIMIT 1`,
      ...(onlyId === undefined ? [now, now] : [now, onlyId, now]),
    );
    const row = rows[0];
    if (!row) return null;
    await tx.$executeRawUnsafe(
      `UPDATE background_tasks
          SET status = 'running', locked_by = ?, locked_until = ?, started_at = ?, attempts = attempts + 1,
              finished_at = NULL, duration_ms = NULL
        WHERE id = ?`,
      workerId,
      new Date(now.getTime() + LEASE_MS),
      now,
      row.id,
    );
    return {
      id: Number(row.id),
      type: String(row.type),
      payload: parseJson(row.payload),
      attempts: Number(row.attempts) + 1,
      maxAttempts: Number(row.max_attempts),
    };
  });
}

/** Extends the lease. Returns false when the task was cancelled or released meanwhile. */
export async function heartbeatTask(id: number, workerId: string): Promise<boolean> {
  const updated = await prisma.$executeRawUnsafe(
    "UPDATE background_tasks SET locked_until = ? WHERE id = ? AND locked_by = ? AND status = 'running'",
    new Date(Date.now() + LEASE_MS),
    id,
    workerId,
  );
  return Number(updated) > 0;
}

export async function completeTask(id: number, workerId: string, result: unknown, durationMs: number): Promise<void> {
  await prisma.$executeRawUnsafe(
    `UPDATE background_tasks
        SET status = 'done', result = ?, finished_at = ?, duration_ms = ?, locked_until = NULL
      WHERE id = ? AND locked_by = ? AND status = 'running'`,
    toJson(result),
    new Date(),
    Math.round(durationMs),
    id,
    workerId,
  );
}

export function retryDelayMs(attempt: number): number {
  return Math.min(60 * 60_000, 30_000 * 2 ** Math.max(0, attempt - 1));
}

export async function failTask(task: ClaimedTask, workerId: string, error: unknown, durationMs: number): Promise<"queued" | "failed"> {
  const message = error instanceof Error ? `${error.message}\n\n${error.stack ?? ""}`.trim() : String(error);
  const now = new Date();
  const willRetry = task.attempts < task.maxAttempts;
  await prisma.$executeRawUnsafe(
    `UPDATE background_tasks
        SET status = ?, last_error = ?, run_after = ?, finished_at = ?, duration_ms = ?, locked_until = NULL
      WHERE id = ? AND locked_by = ? AND status = 'running'`,
    willRetry ? "queued" : "failed",
    message.slice(0, 60_000),
    willRetry ? new Date(now.getTime() + retryDelayMs(task.attempts)) : now,
    willRetry ? null : now,
    Math.round(durationMs),
    task.id,
    workerId,
  );
  return willRetry ? "queued" : "failed";
}

export async function releaseTask(id: number): Promise<boolean> {
  await ensureBackgroundTables();
  const updated = await prisma.$executeRawUnsafe(
    `UPDATE background_tasks
        SET status = 'queued', run_after = ?, locked_by = NULL, locked_until = NULL
      WHERE id = ? AND status = 'running' AND (locked_until IS NULL OR locked_until < ?)`,
    new Date(),
    id,
    new Date(),
  );
  return Number(updated) > 0;
}

export async function cancelTask(id: number): Promise<boolean> {
  await ensureBackgroundTables();
  const now = new Date();
  const updated = await prisma.$executeRawUnsafe(
    `UPDATE background_tasks
        SET status = 'cancelled', finished_at = ?,
            duration_ms = IF(started_at IS NULL, NULL, TIMESTAMPDIFF(MICROSECOND, started_at, ?) DIV 1000),
            locked_by = NULL, locked_until = NULL
      WHERE id = ? AND status IN ('queued', 'running')`,
    now,
    now,
    id,
  );
  return Number(updated) > 0;
}

export async function retryTask(id: number): Promise<boolean> {
  await ensureBackgroundTables();
  const updated = await prisma.$executeRawUnsafe(
    `UPDATE background_tasks
        SET status = 'queued', run_after = ?, attempts = 0, started_at = NULL, finished_at = NULL,
            duration_ms = NULL, result = NULL
      WHERE id = ? AND status IN ('failed', 'cancelled')`,
    new Date(),
    id,
  );
  return Number(updated) > 0;
}

/** True when a run for this schedule is waiting or running with a live lease. */
export async function hasActiveRun(scheduleKey: string, now = new Date()): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<Row[]>(
    `SELECT 1 AS hit FROM background_tasks
      WHERE schedule_key = ? AND (status = 'queued' OR (status = 'running' AND locked_until > ?))
      LIMIT 1`,
    scheduleKey,
    now,
  );
  return rows.length > 0;
}

export type TaskListFilter = {
  type?: string;
  status?: string;
  from?: Date;
  to?: Date;
  page?: number;
  pageSize?: number;
  sort?: "created" | "duration";
  dir?: "asc" | "desc";
};

export async function listTasks(filter: TaskListFilter): Promise<{ rows: TaskRecord[]; total: number }> {
  await ensureBackgroundTables();
  const where: string[] = [];
  const params: unknown[] = [];
  if (filter.type) {
    where.push("type = ?");
    params.push(filter.type);
  }
  if (filter.status === "stuck") {
    where.push("status = 'running' AND (locked_until IS NULL OR locked_until < ?)");
    params.push(new Date());
  } else if (filter.status) {
    where.push("status = ?");
    params.push(filter.status);
  }
  if (filter.from) {
    where.push("created_at >= ?");
    params.push(filter.from);
  }
  if (filter.to) {
    where.push("created_at < ?");
    params.push(filter.to);
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const pageSize = Math.min(200, Math.max(1, filter.pageSize ?? 50));
  const page = Math.max(0, filter.page ?? 0);
  const dir = filter.dir === "asc" ? "ASC" : "DESC";
  const order = filter.sort === "duration" ? `duration_ms ${dir}, id DESC` : `created_at ${dir}, id ${dir}`;
  const [rows, count] = await Promise.all([
    prisma.$queryRawUnsafe<Row[]>(
      `SELECT ${LIST_COLUMNS} FROM background_tasks ${whereSql} ORDER BY ${order} LIMIT ${pageSize} OFFSET ${page * pageSize}`,
      ...params,
    ),
    prisma.$queryRawUnsafe<{ total: unknown }[]>(`SELECT COUNT(*) AS total FROM background_tasks ${whereSql}`, ...params),
  ]);
  const now = new Date();
  return { rows: rows.map((row) => mapRecord(row, now)), total: Number(count[0]?.total ?? 0) };
}

export async function getTaskDetail(id: number): Promise<TaskDetail | null> {
  await ensureBackgroundTables();
  const rows = await prisma.$queryRawUnsafe<Row[]>(
    `SELECT ${LIST_COLUMNS}, payload, result, last_error, dedupe_key FROM background_tasks WHERE id = ?`,
    id,
  );
  const row = rows[0];
  if (!row) return null;
  return {
    ...mapRecord(row),
    payload: parseJson(row.payload),
    result: parseJson(row.result),
    lastError: (row.last_error as string | null) ?? null,
    dedupeKey: (row.dedupe_key as string | null) ?? null,
  };
}

/** Newest task per schedule, plus the average duration of the last 10 done runs. */
export async function scheduleRunStats(): Promise<Map<string, { last: TaskRecord | null; avgDurationMs: number | null }>> {
  await ensureBackgroundTables();
  const lastRows = await prisma.$queryRawUnsafe<Row[]>(
    `SELECT ${LIST_COLUMNS} FROM background_tasks t
      WHERE t.id IN (
        SELECT MAX(id) FROM background_tasks WHERE schedule_key IS NOT NULL GROUP BY schedule_key
      )`,
  );
  const avgRows = await prisma.$queryRawUnsafe<{ schedule_key: string; avg_ms: unknown }[]>(
    `SELECT schedule_key, AVG(duration_ms) AS avg_ms FROM (
       SELECT schedule_key, duration_ms,
              ROW_NUMBER() OVER (PARTITION BY schedule_key ORDER BY id DESC) AS rn
         FROM background_tasks
        WHERE schedule_key IS NOT NULL AND status = 'done' AND duration_ms IS NOT NULL
     ) recent
     WHERE rn <= 10
     GROUP BY schedule_key`,
  );
  const stats = new Map<string, { last: TaskRecord | null; avgDurationMs: number | null }>();
  const now = new Date();
  for (const row of lastRows) {
    stats.set(String(row.schedule_key), { last: mapRecord(row, now), avgDurationMs: null });
  }
  for (const row of avgRows) {
    const entry = stats.get(row.schedule_key) ?? { last: null, avgDurationMs: null };
    entry.avgDurationMs = row.avg_ms === null ? null : Math.round(Number(row.avg_ms));
    stats.set(row.schedule_key, entry);
  }
  return stats;
}

export async function cleanupOldTasks(): Promise<{ deletedDone: number; deletedFailed: number }> {
  const settings = await getSettings();
  const day = 24 * 60 * 60_000;
  const now = Date.now();
  const deletedDone = await prisma.$executeRawUnsafe(
    "DELETE FROM background_tasks WHERE status IN ('done', 'cancelled') AND created_at < ?",
    new Date(now - settings.retentionDoneDays * day),
  );
  const deletedFailed = await prisma.$executeRawUnsafe(
    "DELETE FROM background_tasks WHERE status = 'failed' AND created_at < ?",
    new Date(now - settings.retentionFailedDays * day),
  );
  return { deletedDone: Number(deletedDone), deletedFailed: Number(deletedFailed) };
}
