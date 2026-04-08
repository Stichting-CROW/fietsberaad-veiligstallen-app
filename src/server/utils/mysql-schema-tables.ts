import { prisma } from "~/server/db";

/**
 * Returns TABLE_NAME values as stored in the current DATABASE() for allowlisted
 * names (case-insensitive match). On failure (no permission, etc.), returns [] so
 * callers can assume optional tables are absent.
 */
export async function resolveExistingTableNames(allowlist: readonly string[]): Promise<string[]> {
  if (allowlist.length === 0) return [];
  try {
    const lowered = [...new Set(allowlist.map((t) => String(t).toLowerCase()))]
      .map((t) => `'${t.replace(/'/g, "''")}'`)
      .join(",");
    const rows = await prisma.$queryRawUnsafe<{ TABLE_NAME: string }[]>(
      `SELECT TABLE_NAME FROM information_schema.TABLES
       WHERE TABLE_SCHEMA = DATABASE()
       AND LOWER(TABLE_NAME) IN (${lowered})`
    );
    return rows.map((r) => r.TABLE_NAME);
  } catch (e) {
    console.warn("[mysql-schema-tables] resolveExistingTableNames failed; skipping optional tables:", e);
    return [];
  }
}

/**
 * Which of the given table names exist in the current DATABASE(), as a lowercase set
 * (for case-insensitive checks).
 */
export async function filterExistingTables(allowlist: readonly string[]): Promise<Set<string>> {
  const names = await resolveExistingTableNames(allowlist);
  return new Set(names.map((n) => n.toLowerCase()));
}
