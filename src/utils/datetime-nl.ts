import moment from "moment-timezone";

/**
 * MySQL DATETIME / TIMESTAMP display for Veiligstallen reports.
 * Prisma/mysql2 map naive DB datetimes to Date UTC components (= wall-clock in NL).
 */

export const APP_TZ = "Europe/Amsterdam";

/**
 * Wall-clock string for a report instant, in Europe/Amsterdam.
 * The browser sends local midnight as an ISO timestamp. Formatting that in the
 * server zone (UTC in production) includes the previous civil day in the SQL range.
 */
export function formatReportInstant(
  value: Date | string | moment.Moment,
  pattern: string,
  shiftMinutes = 0,
): string {
  const instant = moment(value).tz(APP_TZ);
  if (shiftMinutes !== 0) instant.add(shiftMinutes, "minutes");
  return instant.format(pattern);
}

/** Serialize a DB datetime for JSON (wall-clock, no `Z` suffix). */
export function serializeDbDateTime(d: Date | null | undefined): string | null {
  if (d == null) return null;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
}

/**
 * Format a report datetime for display in Netherlands local (civil) time.
 * Accepts naive `YYYY-MM-DD HH:mm:ss` from API or legacy ISO strings with `Z`.
 */
export function formatDateTimeNl(value: string | null | undefined): string {
  if (!value) return "—";
  const trimmed = value.trim();

  const naiveMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (naiveMatch && !/[zZ]|[+-]\d{2}:?\d{2}$/.test(trimmed)) {
    const [, y, mo, d, h, mi, s] = naiveMatch;
    return `${Number(d)}-${Number(mo)}-${y}, ${h}:${mi}:${s ?? "00"}`;
  }

  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) return trimmed;

  // Legacy API: toISOString() — UTC components match MySQL wall-clock
  if (trimmed.endsWith("Z")) {
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${date.getUTCDate()}-${date.getUTCMonth() + 1}-${date.getUTCFullYear()}, ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`;
  }

  return new Intl.DateTimeFormat("nl-NL", {
    timeZone: APP_TZ,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
}
