/**
 * Shared opening hours logic for stalling details (client) and FMS API (server).
 * Uses Europe/Amsterdam for real instants (`now`). Weekly `Open_*` / `Dicht_*` are MySQL `TIME`;
 * Prisma maps those to `Date` with the clock in UTC components (see `getHourMinuteFromDbTime`).
 */

import moment from "moment-timezone";

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

/**
 * Hour/minute for fietsenstallingen `Open_*` / `Dicht_*` (`@db.Time`).
 * Matches `getUTCHours()` in `fms-v3-openinghours.toHhmm` and ColdFusion `Hour()` on those values.
 */
function getHourMinuteFromDbTime(d: Date | string | null | undefined): { hour: number; minute: number } {
  const dateObj = toDate(d);
  if (!dateObj) return { hour: 0, minute: 0 };
  return { hour: dateObj.getUTCHours(), minute: dateObj.getUTCMinutes() };
}

function toMinutesFromDbTime(d: Date | string | null | undefined): number {
  const { hour, minute } = getHourMinuteFromDbTime(d);
  return hour * 60 + minute;
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

/** Format stall `TIME` as HH:mm (same interpretation as API periods / CF). */
export function formatTimeHHmm(d: Date | string | null | undefined): string {
  const { hour, minute } = getHourMinuteFromDbTime(d);
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

/** Civil Y-M-D in Europe/Amsterdam for instant `d`. */
function getYmdInAmsterdam(d: Date): { y: number; m: number; day: number } {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(d);
  const y = parseInt(parts.find((p) => p.type === "year")?.value ?? "0", 10);
  const m = parseInt(parts.find((p) => p.type === "month")?.value ?? "0", 10);
  const day = parseInt(parts.find((p) => p.type === "day")?.value ?? "0", 10);
  return { y, m, day };
}

function addCalendarDaysUtc(y: number, m: number, day: number, delta: number): { y: number; m: number; day: number } {
  const t = new Date(Date.UTC(y, m - 1, day + delta));
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, day: t.getUTCDate() };
}

/** Weekday 0=Sun..6=Sat in Amsterdam for civil calendar date. */
function getWeekdayIndexForAmsterdamCalendarDate(y: number, m: number, day: number): number {
  const instant = new Date(Date.UTC(y, m - 1, day, 12, 0, 0));
  return getDayInTz(instant);
}

/** ColdFusion DayOfWeek(): 1 = Sunday … 7 = Saturday (Amsterdam civil day of `d`). */
function cfDayOfWeekFromDate(d: Date): number {
  return getDayInTz(d) + 1;
}

/** ColdFusion helperclass.getDaycodeByDayOfWeek (1-based index into sf daycodes). */
const CF_DAYCODE_BY_DOW = ["su", "mo", "tu", "we", "th", "fr", "sa"] as const;

function cfDaycodeFromCfDow(cfDow: number): (typeof CF_DAYCODE_BY_DOW)[number] {
  return CF_DAYCODE_BY_DOW[cfDow - 1]!;
}

function cfDayOfWeekFromDaycode(daycode: string): number {
  const i = CF_DAYCODE_BY_DOW.indexOf(daycode as (typeof CF_DAYCODE_BY_DOW)[number]);
  return i + 1;
}

const CF_DAYCODE_TO_SCHEDULE: Record<
  (typeof CF_DAYCODE_BY_DOW)[number],
  { open: keyof OpeningHoursSchedule; close: keyof OpeningHoursSchedule }
> = {
  su: { open: "Open_zo", close: "Dicht_zo" },
  mo: { open: "Open_ma", close: "Dicht_ma" },
  tu: { open: "Open_di", close: "Dicht_di" },
  we: { open: "Open_wo", close: "Dicht_wo" },
  th: { open: "Open_do", close: "Dicht_do" },
  fr: { open: "Open_vr", close: "Dicht_vr" },
  sa: { open: "Open_za", close: "Dicht_za" },
};

/** ColdFusion getNextDateByDayOfWeek: align `targetCfDow` to `now` using whole-day add. */
function getNextMomentForCfDayOfWeek(targetCfDow: number, now: Date): moment.Moment {
  const m = moment.tz(now, APP_TZ);
  const currentCfDow = cfDayOfWeekFromDate(now);
  const diff = (7 + targetCfDow - currentCfDow) % 7;
  return m.clone().add(diff, "days");
}

type CfOpenCloseMoments = { open?: moment.Moment; close?: moment.Moment };

/**
 * Mirrors Bikepark.getOpeningHoursByDayCode (without exception overrides — not used in V3 row path).
 */
function buildCfOpeningHoursMoments(
  daycode: (typeof CF_DAYCODE_BY_DOW)[number],
  schedule: OpeningHoursSchedule,
  now: Date
): CfOpenCloseMoments {
  const keys = CF_DAYCODE_TO_SCHEDULE[daycode];
  const openSrc = schedule[keys.open];
  const closeSrc = schedule[keys.close];
  const out: CfOpenCloseMoments = {};
  const anchor = getNextMomentForCfDayOfWeek(cfDayOfWeekFromDaycode(daycode), now);
  const y = anchor.year();
  const mo = anchor.month();
  const d = anchor.date();

  if (openSrc != null && toDate(openSrc)) {
    const { hour, minute } = getHourMinuteFromDbTime(openSrc);
    out.open = moment.tz(
      { year: y, month: mo, day: d, hour, minute, second: 0, millisecond: 0 },
      APP_TZ
    );
  }
  if (closeSrc != null && toDate(closeSrc)) {
    const { hour, minute } = getHourMinuteFromDbTime(closeSrc);
    out.close = moment.tz(
      { year: y, month: mo, day: d, hour, minute, second: 59, millisecond: 0 },
      APP_TZ
    );
  }
  if (out.open && out.close && out.close.isBefore(out.open)) {
    out.close.add(1, "day");
  }
  return out;
}

function inCfDateRangeInstant(instant: Date, rangeStart: moment.Moment, rangeEnd: moment.Moment): boolean {
  const t = instant.getTime();
  return t >= rangeStart.valueOf() && t <= rangeEnd.valueOf();
}

/**
 * ColdFusion Bikepark.isOpened — used for FMS `openinghours.opennow` parity.
 * First tries today's daycode window; then yesterday's daycode with `date + 7 days` vs yesterday's window.
 * When open or close is missing in the struct → treated as open (true), matching CF.
 */
export function bikeparkIsOpened(schedule: OpeningHoursSchedule, now: Date): boolean {
  const daycode = cfDaycodeFromCfDow(cfDayOfWeekFromDate(now));
  let st = buildCfOpeningHoursMoments(daycode, schedule, now);
  if (st.open == null || st.close == null) {
    return true;
  }
  if (inCfDateRangeInstant(now, st.open, st.close)) {
    return true;
  }

  const yM = moment.tz(now, APP_TZ).clone().subtract(1, "day");
  const yDaycode = cfDaycodeFromCfDow(cfDayOfWeekFromDate(yM.toDate()));
  st = buildCfOpeningHoursMoments(yDaycode, schedule, now);
  if (st.open == null) {
    return false;
  }
  if (st.close == null) {
    return false;
  }
  const shifted = moment.tz(now, APP_TZ).add(7, "days").toDate();
  return inCfDateRangeInstant(shifted, st.open, st.close);
}

/** ColdFusion Bikepark.isOpened: unknown if either slot missing from getOpeningHoursByDayCode. */
function isScheduleIncomplete(
  openTime: Date | string | null | undefined,
  closeTime: Date | string | null | undefined
): boolean {
  return openTime == null || closeTime == null;
}

function isOpenAllDay(
  openTime: Date | string | null | undefined,
  closeTime: Date | string | null | undefined
): boolean {
  const o = getHourMinuteFromDbTime(openTime);
  const c = getHourMinuteFromDbTime(closeTime);
  return o.hour === 0 && o.minute === 0 && c.hour === 23 && c.minute === 59;
}

function isClosedAllDay(
  openTime: Date | string | null | undefined,
  closeTime: Date | string | null | undefined
): boolean {
  const o = getHourMinuteFromDbTime(openTime);
  const c = getHourMinuteFromDbTime(closeTime);
  return o.hour === 0 && o.minute === 0 && c.hour === 0 && c.minute === 0;
}

export type IsOpenNowResult = {
  isOpen: boolean;
  /** When open, the close time to display (e.g. "sluit om 19:00"). Null when open all day or unknown. */
  closeTimeForDisplay: Date | string | null;
};

/**
 * Returns whether the location is open at the given time (UI heuristic on wall-clock minutes).
 * For API parity with ColdFusion `Bikepark.isOpened`, use {@link bikeparkIsOpened} instead.
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

  if (isScheduleIncomplete(openTime, closeTime)) {
    return withCloseTime ? { isOpen: unknownAsOpen, closeTimeForDisplay: null } : unknownAsOpen;
  }

  const openMins = toMinutesFromDbTime(openTime);
  const closeMins = toMinutesFromDbTime(closeTime);

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
    const cal = getYmdInAmsterdam(now);
    const prevCal = addCalendarDaysUtc(cal.y, cal.m, cal.day, -1);
    const prevDay = getWeekdayIndexForAmsterdamCalendarDate(prevCal.y, prevCal.m, prevCal.day);
    const prevDayKey = DAY_ORDER[prevDay];
    if (!prevDayKey) {
      return withCloseTime ? { isOpen: unknownAsOpen, closeTimeForDisplay: null } : unknownAsOpen;
    }
    const prevOpen = schedule[`Open_${prevDayKey}` as keyof OpeningHoursSchedule];
    const prevClose = schedule[`Dicht_${prevDayKey}` as keyof OpeningHoursSchedule];
    if (isScheduleIncomplete(prevOpen, prevClose)) {
      return withCloseTime ? { isOpen: unknownAsOpen, closeTimeForDisplay: null } : unknownAsOpen;
    }
    const prevCloseMins = toMinutesFromDbTime(prevClose);
    const prevOpenMins = toMinutesFromDbTime(prevOpen);
    if (prevCloseMins < prevOpenMins) {
      const open = currentMinutes <= prevCloseMins;
      return withCloseTime
        ? { isOpen: open, closeTimeForDisplay: open ? prevClose ?? null : null }
        : open;
    }
    return withCloseTime ? { isOpen: false, closeTimeForDisplay: null } : false;
  }
  const open = currentMinutes >= openMins && currentMinutes <= closeMins;
  return withCloseTime
    ? { isOpen: open, closeTimeForDisplay: open ? closeTime ?? null : null }
    : open;
}
