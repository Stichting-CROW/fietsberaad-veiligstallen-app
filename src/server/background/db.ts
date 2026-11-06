import { prisma } from "~/server/db";

let tablesReady: Promise<void> | null = null;

export function ensureBackgroundTables(): Promise<void> {
  if (!tablesReady) {
    tablesReady = createTables().catch((error) => {
      tablesReady = null;
      throw error;
    });
  }
  return tablesReady;
}

async function createTables(): Promise<void> {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS background_schedules (
      \`key\` VARCHAR(64) NOT NULL,
      task_type VARCHAR(64) NOT NULL,
      cron VARCHAR(100) NOT NULL,
      timezone VARCHAR(64) NOT NULL DEFAULT 'Europe/Amsterdam',
      enabled TINYINT(1) NOT NULL DEFAULT 1,
      payload TEXT NULL,
      next_run_at DATETIME(3) NULL,
      last_enqueued_at DATETIME(3) NULL,
      updated_at DATETIME(3) NOT NULL,
      PRIMARY KEY (\`key\`)
    ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS background_tasks (
      id INT NOT NULL AUTO_INCREMENT,
      type VARCHAR(64) NOT NULL,
      payload TEXT NULL,
      status VARCHAR(16) NOT NULL,
      schedule_key VARCHAR(64) NULL,
      trigger_source VARCHAR(16) NOT NULL,
      triggered_by VARCHAR(255) NULL,
      run_after DATETIME(3) NOT NULL,
      attempts INT NOT NULL DEFAULT 0,
      max_attempts INT NOT NULL DEFAULT 1,
      locked_by VARCHAR(128) NULL,
      locked_until DATETIME(3) NULL,
      dedupe_key VARCHAR(191) NULL,
      result MEDIUMTEXT NULL,
      last_error TEXT NULL,
      created_at DATETIME(3) NOT NULL,
      started_at DATETIME(3) NULL,
      finished_at DATETIME(3) NULL,
      duration_ms INT NULL,
      PRIMARY KEY (id),
      UNIQUE INDEX background_tasks_dedupe (dedupe_key),
      INDEX background_tasks_status_run_after (status, run_after),
      INDEX background_tasks_schedule_created (schedule_key, created_at),
      INDEX background_tasks_type_created (type, created_at),
      INDEX background_tasks_created (created_at)
    ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS background_settings (
      \`key\` VARCHAR(64) NOT NULL,
      value TEXT NULL,
      updated_at DATETIME(3) NOT NULL,
      PRIMARY KEY (\`key\`)
    ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
  `);
  await prisma.$executeRawUnsafe(
    "INSERT IGNORE INTO background_settings (`key`, value, updated_at) VALUES ('claim_lock', NULL, ?)",
    new Date(),
  );
}

export type BackgroundSettings = {
  paused: boolean;
  retentionDoneDays: number;
  retentionFailedDays: number;
  lastTickAt: Date | null;
  lastTickSource: string | null;
};

const SETTING_DEFAULTS: Record<string, string> = {
  paused: "0",
  retention_done_days: "30",
  retention_failed_days: "180",
};

export async function getSettings(): Promise<BackgroundSettings> {
  await ensureBackgroundTables();
  const rows = await prisma.$queryRawUnsafe<{ key: string; value: string | null }[]>(
    "SELECT `key`, value FROM background_settings",
  );
  const map = new Map(rows.map((row) => [row.key, row.value]));
  const get = (key: string) => map.get(key) ?? SETTING_DEFAULTS[key] ?? null;
  const lastTick = get("last_tick_at");
  return {
    paused: get("paused") === "1",
    retentionDoneDays: Number(get("retention_done_days")),
    retentionFailedDays: Number(get("retention_failed_days")),
    lastTickAt: lastTick ? new Date(lastTick) : null,
    lastTickSource: get("last_tick_source"),
  };
}

export async function setSetting(key: string, value: string | null): Promise<void> {
  await ensureBackgroundTables();
  await prisma.$executeRawUnsafe(
    "INSERT INTO background_settings (`key`, value, updated_at) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE value = VALUES(value), updated_at = VALUES(updated_at)",
    key,
    value,
    new Date(),
  );
}

export function parseJson(value: unknown): unknown {
  if (typeof value !== "string" || value === "") return null;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

export function toJson(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  return JSON.stringify(value, (_key, inner) => (typeof inner === "bigint" ? Number(inner) : inner));
}
