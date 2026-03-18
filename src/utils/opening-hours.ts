/**
 * Shared opening hours logic for stalling details (client) and FMS API (server).
 * Uses Europe/Amsterdam timezone via Intl - no moment dependency.
 */

const APP_TZ = "Europe/Amsterdam";

const DAY_ORDER = ["zo", "ma", "di", "wo", "do", "vr", "za"] as const;
type DayKey = (typeof DAY_ORDER)[number];

export type OpeningHoursSchedule = {
  Open_zo?: Date | string | null;
  Dicht_zo?: Date | string | null;
  Open_ma?: Date | string | null;
  Dicht_ma?: Date | string | null;
  Open_di?: Date | string | null;
  Dicht_di?: Date | string | null;
  Open_wo?: Date | string | null;
  Dicht_wo?: Date | string | null;
  Open_do?: Date | string | null;
  Dicht_do?: Date | string | null;
  Open_vr?: Date | string | null;
  Dicht_vr?: Date | string | null;
  Open_za?: Date | string | null;
  Dicht_za?: Date | string | null;
};

function toDate(d: Date | string | null | undefined): Date | null {
  if (d == null) return null;
  const dateObj = d instanceof Date ? d : new Date(d as string);
  return Number.isNaN(dateObj.getTime()) ? null : dateObj;
}

/** Get hour and minute of a Date in APP_TZ using Intl. */
function getHourMinuteInTz(d: Date | string | null | undefined): { hour: number; minute: number } {
  const dateObj = toDate(d);
  if (!dateObj) return { hour: 0, minute: 0 };
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = formatter.formatToParts(dateObj);
  const hour = parseInt(parts.find((p) => p.type === "hour")?.value ?? "0", 10);
  const minute = parseInt(parts.find((p) => p.type === "minute")?.value ?? "0", 10);
  return { hour, minute };
}

function toMinutesInTz(d: Date | string | null | undefined): number {
  const { hour, minute } = getHourMinuteInTz(d);
  return hour * 60 + minute;
}

/** Format a time as HH:mm for display (e.g. "19:00"). Uses APP_TZ. */
export function formatTimeHHmm(d: Date | string | null | undefined): string {
  const { hour, minute } = getHourMinuteInTz(d);
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

/** Get day of week (0=Sun, 1=Mon, ..., 6=Sat) in APP_TZ. */
function getDayInTz(d: Date): number {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TZ,
    weekday: "short",
  });
  const dayStr = formatter.format(d);
  const map: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  return map[dayStr] ?? 0;
}

function isOpeningUnknown(
  openTime: Date | string | null | undefined,
  closeTime: Date | string | null | undefined
): boolean {
  return openTime == null && closeTime == null;
}

function isOpenAllDay(
  openTime: Date | string | null | undefined,
  closeTime: Date | string | null | undefined
): boolean {
  const o = getHourMinuteInTz(openTime);
  const c = getHourMinuteInTz(closeTime);
  return o.hour === 0 && o.minute === 0 && c.hour === 23 && c.minute === 59;
}

function isClosedAllDay(
  openTime: Date | string | null | undefined,
  closeTime: Date | string | null | undefined
): boolean {
  const o = getHourMinuteInTz(openTime);
  const c = getHourMinuteInTz(closeTime);
  return o.hour === 0 && o.minute === 0 && c.hour === 0 && c.minute === 0;
}

export type IsOpenNowResult = {
  isOpen: boolean;
  /** When open, the close time to display (e.g. "sluit om 19:00"). Null when open all day or unknown. */
  closeTimeForDisplay: Date | string | null;
};

/**
 * Returns whether the location is open at the given time, based on the weekly schedule.
 * Matches ColdFusion isOpened and client formatOpeningToday logic.
 *
 * @param schedule - Open_zo/Dicht_zo, Open_ma/Dicht_ma, etc.
 * @param now - The moment to check
 * @param options.unknownAsOpen - When opening times are unknown for the day, return true (default: true)
 * @param options.withCloseTime - When true, returns { isOpen, closeTimeForDisplay }. When false, returns boolean only (backward compatible).
 */
export function isOpenNow(
  schedule: OpeningHoursSchedule,
  now: Date,
  options?: { unknownAsOpen?: boolean; withCloseTime?: false }
): boolean;
export function isOpenNow(
  schedule: OpeningHoursSchedule,
  now: Date,
  options: { unknownAsOpen?: boolean; withCloseTime: true }
): IsOpenNowResult;
export function isOpenNow(
  schedule: OpeningHoursSchedule,
  now: Date,
  options?: { unknownAsOpen?: boolean; withCloseTime?: boolean }
): boolean | IsOpenNowResult {
  const unknownAsOpen = options?.unknownAsOpen ?? true;
  const withCloseTime = options?.withCloseTime ?? false;

  const currentDay = getDayInTz(now);
  const { hour, minute } = getHourMinuteInTz(now);
  const currentMinutes = hour * 60 + minute;

  const dayKey = DAY_ORDER[currentDay];
  if (!dayKey) return withCloseTime ? { isOpen: unknownAsOpen, closeTimeForDisplay: null } : unknownAsOpen;

  const openTime = schedule[`Open_${dayKey}` as keyof OpeningHoursSchedule];
  const closeTime = schedule[`Dicht_${dayKey}` as keyof OpeningHoursSchedule];

  if (isOpeningUnknown(openTime, closeTime)) {
    return withCloseTime ? { isOpen: unknownAsOpen, closeTimeForDisplay: null } : unknownAsOpen;
  }

  const openMins = toMinutesInTz(openTime);
  const closeMins = toMinutesInTz(closeTime);

  if (isOpenAllDay(openTime, closeTime)) {
    return withCloseTime ? { isOpen: true, closeTimeForDisplay: null } : true;
  }
  if (isClosedAllDay(openTime, closeTime)) {
    return withCloseTime ? { isOpen: false, closeTimeForDisplay: null } : false;
  }

  const spansMidnight = closeMins < openMins || (closeMins === 0 && openMins > 0);
  if (spansMidnight) {
    if (currentMinutes >= openMins) {
      return withCloseTime ? { isOpen: true, closeTimeForDisplay: closeTime ?? null } : true;
    }
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const prevDay = getDayInTz(yesterday);
    const prevDayKey = DAY_ORDER[prevDay];
    if (!prevDayKey) {
      return withCloseTime ? { isOpen: unknownAsOpen, closeTimeForDisplay: null } : unknownAsOpen;
    }
    const prevOpen = schedule[`Open_${prevDayKey}` as keyof OpeningHoursSchedule];
    const prevClose = schedule[`Dicht_${prevDayKey}` as keyof OpeningHoursSchedule];
    if (isOpeningUnknown(prevOpen, prevClose)) {
      return withCloseTime ? { isOpen: unknownAsOpen, closeTimeForDisplay: null } : unknownAsOpen;
    }
    const prevCloseMins = toMinutesInTz(prevClose);
    const prevOpenMins = toMinutesInTz(prevOpen);
    if (prevCloseMins < prevOpenMins) {
      const open = currentMinutes < prevCloseMins;
      return withCloseTime
        ? { isOpen: open, closeTimeForDisplay: open ? prevClose ?? null : null }
        : open;
    }
    return withCloseTime ? { isOpen: false, closeTimeForDisplay: null } : false;
  }
  const open = currentMinutes >= openMins && currentMinutes < closeMins;
  return withCloseTime
    ? { isOpen: open, closeTimeForDisplay: open ? closeTime ?? null : null }
    : open;
}
