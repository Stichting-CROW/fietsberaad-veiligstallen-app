import { prisma } from "~/server/db";
import { describeCron, nextRunAfter, planSlot, validateCron } from "./cron";
import { ensureBackgroundTables, parseJson } from "./db";
import { enqueueTask, hasActiveRun } from "./queue";
import { getTask, scheduleDefaults } from "./registry";

export type ScheduleRecord = {
  key: string;
  taskType: string;
  label: string;
  cron: string;
  cronDescription: string;
  timezone: string;
  enabled: boolean;
  payload: unknown;
  nextRunAt: Date | null;
  lastEnqueuedAt: Date | null;
};

type Row = Record<string, unknown>;

let seeded: Promise<void> | null = null;

/** Inserts registry schedules that are not in the table yet; existing rows keep their edits. */
export function ensureSchedulesSeeded(): Promise<void> {
  if (!seeded) {
    seeded = (async () => {
      await ensureBackgroundTables();
      const now = new Date();
      for (const def of scheduleDefaults()) {
        await prisma.$executeRawUnsafe(
          `INSERT IGNORE INTO background_schedules (\`key\`, task_type, cron, timezone, enabled, next_run_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          def.key,
          def.taskType,
          def.cron,
          def.timezone,
          def.enabled ? 1 : 0,
          nextRunAfter(def.cron, def.timezone, now),
          now,
        );
      }
    })().catch((error) => {
      seeded = null;
      throw error;
    });
  }
  return seeded;
}

function mapSchedule(row: Row): ScheduleRecord {
  const taskType = String(row.task_type);
  const cron = String(row.cron);
  return {
    key: String(row.key),
    taskType,
    label: getTask(taskType)?.label ?? taskType,
    cron,
    cronDescription: describeCron(cron),
    timezone: String(row.timezone),
    enabled: Number(row.enabled) === 1,
    payload: parseJson(row.payload),
    nextRunAt: (row.next_run_at as Date | null) ?? null,
    lastEnqueuedAt: (row.last_enqueued_at as Date | null) ?? null,
  };
}

export async function listSchedules(): Promise<ScheduleRecord[]> {
  await ensureSchedulesSeeded();
  const rows = await prisma.$queryRawUnsafe<Row[]>("SELECT * FROM background_schedules ORDER BY `key`");
  return rows.map(mapSchedule);
}

export async function getSchedule(key: string): Promise<ScheduleRecord | null> {
  await ensureSchedulesSeeded();
  const rows = await prisma.$queryRawUnsafe<Row[]>("SELECT * FROM background_schedules WHERE `key` = ?", key);
  return rows[0] ? mapSchedule(rows[0]) : null;
}

export async function updateSchedule(key: string, changes: { enabled?: boolean; cron?: string }): Promise<ScheduleRecord> {
  const current = await getSchedule(key);
  if (!current) throw new Error(`Onbekend schema: ${key}`);
  const cron = changes.cron?.trim() ?? current.cron;
  const problem = validateCron(cron, current.timezone);
  if (problem) throw new Error(`Ongeldige cron-expressie: ${problem}`);
  const enabled = changes.enabled ?? current.enabled;
  const now = new Date();
  const recompute = cron !== current.cron || (enabled && !current.enabled) || !current.nextRunAt;
  await prisma.$executeRawUnsafe(
    "UPDATE background_schedules SET cron = ?, enabled = ?, next_run_at = ?, updated_at = ? WHERE `key` = ?",
    cron,
    enabled ? 1 : 0,
    recompute ? nextRunAfter(cron, current.timezone, now) : current.nextRunAt,
    now,
    key,
  );
  return (await getSchedule(key))!;
}

export type SchedulerSummary = {
  enqueued: string[];
  skippedOverlap: string[];
  skippedPaused: string[];
};

export async function enqueueDueSchedules(now: Date, options: { paused: boolean }): Promise<SchedulerSummary> {
  await ensureSchedulesSeeded();
  const summary: SchedulerSummary = { enqueued: [], skippedOverlap: [], skippedPaused: [] };
  const rows = await prisma.$queryRawUnsafe<Row[]>(
    "SELECT * FROM background_schedules WHERE enabled = 1 AND (next_run_at IS NULL OR next_run_at <= ?)",
    now,
  );
  for (const schedule of rows.map(mapSchedule)) {
    if (!schedule.nextRunAt) {
      await prisma.$executeRawUnsafe(
        "UPDATE background_schedules SET next_run_at = ? WHERE `key` = ? AND next_run_at IS NULL",
        nextRunAfter(schedule.cron, schedule.timezone, now),
        schedule.key,
      );
      continue;
    }
    const plan = planSlot(schedule.cron, schedule.timezone, schedule.nextRunAt, now);
    if (!plan.due) continue;
    const claimed = await prisma.$executeRawUnsafe(
      "UPDATE background_schedules SET next_run_at = ?, last_enqueued_at = ? WHERE `key` = ? AND next_run_at = ?",
      plan.next,
      now,
      schedule.key,
      plan.slot,
    );
    if (Number(claimed) === 0) continue;
    if (options.paused) {
      summary.skippedPaused.push(schedule.key);
      continue;
    }
    if (!getTask(schedule.taskType)) continue;
    if (await hasActiveRun(schedule.key, now)) {
      summary.skippedOverlap.push(schedule.key);
      continue;
    }
    const id = await enqueueTask(schedule.taskType, schedule.payload, {
      scheduleKey: schedule.key,
      trigger: "schedule",
      dedupeKey: `schedule:${schedule.key}:${plan.slot.toISOString()}`,
    });
    if (id !== null) summary.enqueued.push(schedule.key);
  }
  return summary;
}

export async function runScheduleNow(key: string, triggeredBy: string): Promise<number> {
  const schedule = await getSchedule(key);
  if (!schedule) throw new Error(`Onbekend schema: ${key}`);
  const id = await enqueueTask(schedule.taskType, schedule.payload, {
    scheduleKey: schedule.key,
    trigger: "manual",
    triggeredBy,
  });
  return id!;
}
