/**
 * Build opening hours in ColdFusion V3 API format.
 * Day: 0=Sunday, 1=Monday, ..., 6=Saturday.
 * Time: "HHmm" (e.g. "0800", "1830").
 */

type DayKey = "zo" | "ma" | "di" | "wo" | "do" | "vr" | "za";
const DAY_ORDER: DayKey[] = ["zo", "ma", "di", "wo", "do", "vr", "za"];
const DAY_TO_NUMBER: Record<DayKey, number> = {
  zo: 0,
  ma: 1,
  di: 2,
  wo: 3,
  do: 4,
  vr: 5,
  za: 6,
};

function toHhmm(d: Date | null): string {
  if (!d) return "0000";
  const h = d.getUTCHours();
  const m = d.getUTCMinutes();
  return `${String(h).padStart(2, "0")}${String(m).padStart(2, "0")}`;
}

function isMidnight(d: Date | null): boolean {
  if (!d) return true;
  return d.getUTCHours() === 0 && d.getUTCMinutes() === 0;
}

function is2359(d: Date | null): boolean {
  if (!d) return false;
  return d.getUTCHours() === 23 && d.getUTCMinutes() === 59;
}

export type OpeningHoursInput = {
  Open_zo?: Date | null;
  Dicht_zo?: Date | null;
  Open_ma?: Date | null;
  Dicht_ma?: Date | null;
  Open_di?: Date | null;
  Dicht_di?: Date | null;
  Open_wo?: Date | null;
  Dicht_wo?: Date | null;
  Open_do?: Date | null;
  Dicht_do?: Date | null;
  Open_vr?: Date | null;
  Dicht_vr?: Date | null;
  Open_za?: Date | null;
  Dicht_za?: Date | null;
};

export function buildOpeningHours(
  input: OpeningHoursInput,
  now: Date = new Date()
): { opennow: boolean; periods: Array<Record<string, unknown>> } {
  const periods: Array<Record<string, unknown>> = [];
  let allOpen24h = true;
  let hasAnyHours = false;

  for (const day of DAY_ORDER) {
    const openKey = `Open_${day}` as keyof OpeningHoursInput;
    const dichtKey = `Dicht_${day}` as keyof OpeningHoursInput;
    const openTime = input[openKey] as Date | null | undefined;
    const closeTime = input[dichtKey] as Date | null | undefined;

    if (openTime == null && closeTime == null) continue;
    hasAnyHours = true;

    const openHhmm = toHhmm(openTime ?? null);
    const closeHhmm = toHhmm(closeTime ?? null);
    const dayNum = DAY_TO_NUMBER[day];

    const isOpenAllDay =
      isMidnight(openTime ?? null) &&
      (is2359(closeTime ?? null) || isMidnight(closeTime ?? null));
    const isClosed = isMidnight(openTime ?? null) && isMidnight(closeTime ?? null);

    if (!isOpenAllDay && !isClosed) {
      allOpen24h = false;
    }

    if (isOpenAllDay) {
      if (periods.length === 0 || (periods[periods.length - 1] as { close?: unknown }).close) {
        periods.push({ open: { day: dayNum, time: "0000" } });
      }
    } else if (isClosed) {
      if (periods.length > 0 && !(periods[periods.length - 1] as { close?: unknown }).close) {
        (periods[periods.length - 1] as { close?: { day: number; time: string } }).close = {
          day: dayNum,
          time: "0000",
        };
      }
    } else {
      const period: Record<string, unknown> = {
        open: { day: dayNum, time: openHhmm },
        close: { day: dayNum, time: closeHhmm },
      };
      if (closeHhmm === "0000") {
        period.close = { day: (dayNum + 1) % 7, time: "0000" };
      }
      periods.push(period);
      allOpen24h = false;
    }
  }

  if (!hasAnyHours) {
    return { opennow: true, periods: [] };
  }

  if (allOpen24h) {
    return { opennow: true, periods: [{ open: "0000", day: 0 }] };
  }

  const currentDay = now.getDay();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  let opennow = false;

  for (const p of periods) {
    const open = p.open as { day?: number; time?: string } | string;
    const close = p.close as { day?: number; time?: string } | undefined;
    if (typeof open === "string") {
      opennow = true;
      break;
    }
    const openDay = open?.day ?? 0;
    const openTime = open?.time ?? "0000";
    const openMins = parseInt(openTime.slice(0, 2), 10) * 60 + parseInt(openTime.slice(2), 10);
    if (close) {
      const closeDay = close.day ?? 0;
      const closeTime = close.time ?? "0000";
      const closeMins = parseInt(closeTime.slice(0, 2), 10) * 60 + parseInt(closeTime.slice(2), 10);
      const spansMidnight = closeMins < openMins || closeDay !== openDay;
      if (spansMidnight) {
        if (currentDay === openDay && currentMinutes >= openMins) opennow = true;
        else if (currentDay === (openDay + 1) % 7 && currentMinutes < closeMins) opennow = true;
      } else if (currentDay === openDay && currentMinutes >= openMins && currentMinutes < closeMins) {
        opennow = true;
      }
    } else if (currentDay === openDay && currentMinutes >= openMins) {
      opennow = true;
    }
  }

  return { opennow, periods };
}
