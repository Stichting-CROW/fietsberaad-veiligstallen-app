/**
 * On-disk gzip cache for the CSV report exports.
 *
 * Layout: `{baseDir}/{exportType}/{gemeenteID}/{filename}.gz`
 *
 * Only exports that are actively downloaded are written (lazy, no pre-warm).
 * A cached file is only served when the reported period has been closed for at
 * least REPORT_CACHE_SETTLING_DAYS (default 14). Running and recently-closed
 * periods always regenerate. Cached files are kept indefinitely unless cleared
 * manually or after an aggregate cache refresh for the overlapping period.
 */

import { createHash, randomBytes } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";
import { prisma } from "~/server/db";
import {
  CSV_EXPORT_TYPES,
  getCsvExportPeriodEnd,
  resolveCsvExportFilename,
  type CsvExportFilenameParams,
  type CsvExportType,
} from "~/backend/services/reports/csvExportFilename";
import { type CsvExportResult } from "~/backend/services/reports/transactionsExport";

const SAFE_ID_PATTERN = /^[A-Za-z0-9_-]+$/;
const DEFAULT_SETTLING_DAYS = 14;

export type CsvExportCacheKey = {
  exportType: CsvExportType;
  gemeenteID: string;
  stallingsID?: string;
  jaar: number;
  maand?: number;
};

export type ReportFileCacheStatus = {
  status: "missing" | "available" | "error";
  size: number;
  fileCount: number;
  firstUpdate: Date | null;
  lastUpdate: Date | null;
  baseDir: string;
};

export class CsvExportCacheKeyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CsvExportCacheKeyError";
  }
}

const inFlight = new Map<string, Promise<string>>();

export const getReportCacheBaseDir = (): string => {
  if (process.env.REPORT_CACHE_DIR) return process.env.REPORT_CACHE_DIR;
  if (process.env.NODE_ENV === "production") return "/home/reportcache";
  return path.join(process.env.ROOT_DIR || process.cwd(), ".cache/reports");
};

export const getReportCacheSettlingDays = (): number => {
  const raw = process.env.REPORT_CACHE_SETTLING_DAYS;
  if (raw === undefined || raw === "") return DEFAULT_SETTLING_DAYS;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) return DEFAULT_SETTLING_DAYS;
  return Math.floor(parsed);
};

/** Returns max age in days when REPORT_CACHE_MAX_AGE_DAYS is set; otherwise null (keep forever). */
export const getReportCacheMaxAgeDays = (): number | null => {
  const raw = process.env.REPORT_CACHE_MAX_AGE_DAYS;
  if (raw === undefined || raw === "") return null;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 1) return null;
  return Math.floor(parsed);
};

const assertSafeId = (label: string, value: string): string => {
  if (!SAFE_ID_PATTERN.test(value)) {
    throw new CsvExportCacheKeyError(`Ongeldige ${label} voor cachepad: ${value}`);
  }
  return value;
};

export const resolveCsvExportCachePath = (key: CsvExportCacheKey): string => {
  const gemeenteID = assertSafeId("gemeenteID", key.gemeenteID);
  if (key.stallingsID) assertSafeId("stallingsID", key.stallingsID);

  const filename = resolveCsvExportFilename(key.exportType, {
    jaar: key.jaar,
    stallingsID: key.stallingsID,
    maand: key.maand,
  });

  // Filename is built from validated IDs and integer year/month, so it cannot
  // contain path separators. Still strip any accidental ones as defence in depth.
  const safeFilename = filename.replace(/[\\/]/g, "_");

  return path.join(
    getReportCacheBaseDir(),
    key.exportType,
    gemeenteID,
    `${safeFilename}.gz`
  );
};

/**
 * True when the reported period ended at least `settlingDays` ago, according
 * to MySQL NOW() (same clock the stallingsduur quarter filter uses).
 */
export const isCsvExportPeriodSettled = async (
  exportType: CsvExportType,
  params: CsvExportFilenameParams,
  settlingDays: number = getReportCacheSettlingDays()
): Promise<boolean> => {
  const periodEnd = getCsvExportPeriodEnd(exportType, params);
  const rows = await prisma.$queryRawUnsafe<{ settled: number | bigint }[]>(
    `SELECT CASE WHEN NOW() >= DATE_ADD(?, INTERVAL ? DAY) THEN 1 ELSE 0 END AS settled`,
    periodEnd,
    settlingDays
  );
  return Number(rows[0]?.settled ?? 0) === 1;
};

const maxAgeCutoffMs = (maxAgeDays: number): number =>
  Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;

const readCachedCsv = async (cachePath: string): Promise<string | null> => {
  try {
    const compressed = await fs.readFile(cachePath);
    return gunzipSync(compressed).toString("utf8");
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return null;
    console.error(`Failed to read CSV export cache at ${cachePath}:`, error);
    return null;
  }
};

const writeCachedCsv = async (cachePath: string, csv: string): Promise<void> => {
  await fs.mkdir(path.dirname(cachePath), { recursive: true });
  const tmpPath = `${cachePath}.tmp-${randomBytes(8).toString("hex")}`;
  try {
    await fs.writeFile(tmpPath, gzipSync(Buffer.from(csv, "utf8")));
    await fs.rename(tmpPath, cachePath);
  } catch (error) {
    try {
      await fs.unlink(tmpPath);
    } catch {
      // ignore cleanup failures
    }
    throw error;
  }
};

const walkFiles = async (dir: string): Promise<string[]> => {
  const results: string[] = [];
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return results;
    throw error;
  }

  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...(await walkFiles(full)));
    } else if (entry.isFile() && entry.name.endsWith(".gz")) {
      results.push(full);
    }
  }
  return results;
};

/**
 * Delete cached `.gz` files whose mtime is older than REPORT_CACHE_MAX_AGE_DAYS.
 * No-op when REPORT_CACHE_MAX_AGE_DAYS is unset (default: keep cached files forever).
 */
export const expireOldReportFileCache = async (
  maxAgeDays: number | null = getReportCacheMaxAgeDays()
): Promise<{ deleted: number; errors: number }> => {
  if (maxAgeDays === null) return { deleted: 0, errors: 0 };

  const cutoff = maxAgeCutoffMs(maxAgeDays);
  const files = await walkFiles(getReportCacheBaseDir());
  let deleted = 0;
  let errors = 0;

  for (const file of files) {
    try {
      const stat = await fs.stat(file);
      if (stat.mtimeMs >= cutoff) continue;
      await fs.unlink(file);
      deleted += 1;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        console.error(`Failed to expire report cache file ${file}:`, error);
        errors += 1;
      }
    }
  }

  return { deleted, errors };
};

/**
 * Serve from cache when the period is settled and a file exists; otherwise
 * regenerate. Only actively requested exports are written (lazy). Concurrent
 * identical requests share one generation via `inFlight`.
 */
export const getCachedOrGenerateCsvExport = async (
  key: CsvExportCacheKey,
  generate: () => Promise<CsvExportResult>
): Promise<CsvExportResult> => {
  const filename = resolveCsvExportFilename(key.exportType, key);
  const cachePath = resolveCsvExportCachePath(key);
  const settled = await isCsvExportPeriodSettled(key.exportType, key);

  if (settled) {
    const cached = await readCachedCsv(cachePath);
    if (cached !== null) {
      return { filename, csv: cached };
    }
  }

  const existing = inFlight.get(cachePath);
  if (existing) {
    const csv = await existing;
    return { filename, csv };
  }

  const promise = (async () => {
    const result = await generate();
    // Persist only settled periods: running/settling downloads regenerate every
    // time and would just churn disk. Misses of settled periods still write.
    if (result.csv !== "" && settled) {
      try {
        await writeCachedCsv(cachePath, result.csv);
      } catch (error) {
        // Generation succeeded; a cache write failure must not fail the download.
        console.error(`Failed to write CSV export cache at ${cachePath}:`, error);
      }
    }
    return result.csv;
  })();

  inFlight.set(cachePath, promise);
  try {
    const csv = await promise;
    return { filename, csv };
  } finally {
    inFlight.delete(cachePath);
  }
};

export const getReportFileCacheStatus = async (): Promise<ReportFileCacheStatus> => {
  const baseDir = getReportCacheBaseDir();
  try {
    const files = await walkFiles(baseDir);
    if (files.length === 0) {
      return {
        status: "missing",
        size: 0,
        fileCount: 0,
        firstUpdate: null,
        lastUpdate: null,
        baseDir,
      };
    }

    let totalSize = 0;
    let firstUpdate: Date | null = null;
    let lastUpdate: Date | null = null;

    for (const file of files) {
      const stat = await fs.stat(file);
      totalSize += stat.size;
      if (!firstUpdate || stat.mtime < firstUpdate) firstUpdate = stat.mtime;
      if (!lastUpdate || stat.mtime > lastUpdate) lastUpdate = stat.mtime;
    }

    return {
      status: "available",
      size: totalSize,
      fileCount: files.length,
      firstUpdate,
      lastUpdate,
      baseDir,
    };
  } catch (error) {
    console.error("Failed to read report file cache status:", error);
    return {
      status: "error",
      size: 0,
      fileCount: 0,
      firstUpdate: null,
      lastUpdate: null,
      baseDir,
    };
  }
};

/**
 * Parse the year (and optional month) covered by a cached filename so a date
 * range purge can decide which files overlap.
 */
export const parseCsvExportCachePeriod = (
  exportType: CsvExportType,
  filenameGz: string
): { jaar: number; maand?: number } | null => {
  const filename = filenameGz.replace(/\.gz$/, "");

  if (exportType === "ruwedata") {
    const match = filename.match(/^(\d{4})_(\d{2})_/);
    if (!match) return null;
    return { jaar: Number(match[1]), maand: Number(match[2]) };
  }

  const match = filename.match(/^(\d{4})_/);
  if (!match) return null;
  return { jaar: Number(match[1]) };
};

const periodsOverlap = (
  periodStart: Date,
  periodEnd: Date,
  rangeStart: Date,
  rangeEnd: Date
): boolean => periodStart < rangeEnd && periodEnd > rangeStart;

const periodBounds = (jaar: number, maand?: number): { start: Date; end: Date } => {
  if (maand !== undefined) {
    const start = new Date(Date.UTC(jaar, maand - 1, 1));
    const end =
      maand === 12
        ? new Date(Date.UTC(jaar + 1, 0, 1))
        : new Date(Date.UTC(jaar, maand, 1));
    return { start, end };
  }
  return {
    start: new Date(Date.UTC(jaar, 0, 1)),
    end: new Date(Date.UTC(jaar + 1, 0, 1)),
  };
};

/**
 * Delete every cached CSV whose reported period overlaps `[startDate, endDate)`.
 * Used after the aggregate report caches are refreshed so late check-outs
 * land in the next download.
 */
export const clearReportFileCacheForDateRange = async (
  startDate: Date,
  endDate: Date
): Promise<{ deleted: number; errors: number }> => {
  const baseDir = getReportCacheBaseDir();
  let deleted = 0;
  let errors = 0;

  for (const exportType of CSV_EXPORT_TYPES) {
    const typeDir = path.join(baseDir, exportType);
    const files = await walkFiles(typeDir);
    for (const file of files) {
      const period = parseCsvExportCachePeriod(exportType, path.basename(file));
      if (!period) continue;
      const { start, end } = periodBounds(period.jaar, period.maand);
      if (!periodsOverlap(start, end, startDate, endDate)) continue;
      try {
        await fs.unlink(file);
        deleted += 1;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
          console.error(`Failed to delete report cache file ${file}:`, error);
          errors += 1;
        }
      }
    }
  }

  return { deleted, errors };
};

/** Delete the entire report file cache tree. */
export const clearAllReportFileCache = async (): Promise<{
  deleted: number;
  errors: number;
}> => {
  const baseDir = getReportCacheBaseDir();
  const files = await walkFiles(baseDir);
  let deleted = 0;
  let errors = 0;

  for (const file of files) {
    try {
      await fs.unlink(file);
      deleted += 1;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        console.error(`Failed to delete report cache file ${file}:`, error);
        errors += 1;
      }
    }
  }

  // Best-effort cleanup of empty directories left behind.
  try {
    for (const exportType of CSV_EXPORT_TYPES) {
      const typeDir = path.join(baseDir, exportType);
      let gemeenteDirs;
      try {
        gemeenteDirs = await fs.readdir(typeDir, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const entry of gemeenteDirs) {
        if (!entry.isDirectory()) continue;
        const gemeenteDir = path.join(typeDir, entry.name);
        try {
          await fs.rmdir(gemeenteDir);
        } catch {
          // not empty or already gone
        }
      }
      try {
        await fs.rmdir(typeDir);
      } catch {
        // not empty or already gone
      }
    }
  } catch {
    // ignore
  }

  return { deleted, errors };
};

/** Stable fingerprint used only for logging/diagnostics. */
export const csvExportCacheKeyFingerprint = (key: CsvExportCacheKey): string =>
  createHash("sha1").update(resolveCsvExportCachePath(key)).digest("hex").slice(0, 12);
