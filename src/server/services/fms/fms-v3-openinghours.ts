/**
 * Build opening hours in ColdFusion V3 API format.
 * Mirrors BaseRestService.cfc openingstijden logic exactly.
 * Day: 0=Sunday, 1=Monday, ..., 6=Saturday.
 * Time: "HHmm" (e.g. "0800", "1830").
 */

import { isOpenNow } from "~/utils/opening-hours";

// ColdFusion days order: ["su","mo","tu","we","th","fr","sa"]
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

// ColdFusion isOpenAllDay: open 00:00 and close 23:59
function isOpenAllDay(openTime: Date | null | undefined, closeTime: Date | null | undefined): boolean {
  if (openTime == null || closeTime == null) return false;
  const oh = openTime.getUTCHours();
  const om = openTime.getUTCMinutes();
  const ch = closeTime.getUTCHours();
  const cm = closeTime.getUTCMinutes();
  return oh === 0 && om === 0 && ch === 23 && cm === 59;
}

// ColdFusion isClosedAllDay: open 00:00 and close 00:00
function isClosedAllDay(openTime: Date | null | undefined, closeTime: Date | null | undefined): boolean {
  if (openTime == null || closeTime == null) return false;
  const oh = openTime.getUTCHours();
  const om = openTime.getUTCMinutes();
  const ch = closeTime.getUTCHours();
  const cm = closeTime.getUTCMinutes();
  return oh === 0 && om === 0 && ch === 0 && cm === 0;
}

// ColdFusion isOpeningUnknown: no open and no close
function isOpeningUnknown(openTime: Date | null | undefined, closeTime: Date | null | undefined): boolean {
  return openTime == null && closeTime == null;
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

export type OpeningHoursResult = {
  opennow: boolean;
  periods: Array<
    | { day: number; open: string }
    | { open: { day: number; time: string } }
    | { close: { day: number; time: string } }
    | { open: { day: number; time: string }; close: { day: number; time: string } }
  >;
};

/**
 * Build opening hours matching ColdFusion BaseRestService.cfc exactly.
 * - isNonStopOpen (type fietskluizen or all days 00:00-23:59): periods = [{ day: 0, open: "0000" }]
 * - Otherwise: iterate days su->sa, merge consecutive open-all-day, add open/close per ColdFusion logic.
 */
export function buildOpeningHours(
  input: OpeningHoursInput,
  options?: { locationType?: string | null; now?: Date }
): OpeningHoursResult {
  const now = options?.now ?? new Date();
  const locationType = options?.locationType;

  // ColdFusion isNonStopOpen: type fietskluizen => always 24/7
  if (locationType === "fietskluizen") {
    return {
      opennow: true,
      periods: [{ day: 0, open: "0000" }],
    };
  }

  const periods: OpeningHoursResult["periods"] = [];
  let isopen = false;
  let currentPeriod: { open?: { day: number; time: string }; close?: { day: number; time: string } } = {};

  for (const day of DAY_ORDER) {
    const openKey = `Open_${day}` as keyof OpeningHoursInput;
    const dichtKey = `Dicht_${day}` as keyof OpeningHoursInput;
    const openTime = input[openKey];
    const closeTime = input[dichtKey];
    const dayNum = DAY_TO_NUMBER[day];

    // ColdFusion: only process when StructKeyExists(openingByDay, "open") and StructKeyExists(openingByDay, "close")
    if (isOpeningUnknown(openTime, closeTime)) continue;

    const openHhmm = toHhmm(openTime ?? null);
    const closeHhmm = toHhmm(closeTime ?? null);

    if (isOpenAllDay(openTime, closeTime)) {
      // ColdFusion: if Not isopen, add { open: { day, time } }, set isopen=true
      if (!isopen) {
        periods.push({ open: { day: dayNum, time: openHhmm } });
        isopen = true;
      }
    } else if (isClosedAllDay(openTime, closeTime)) {
      // ColdFusion: if isopen, add { close: { day, time } }, set isopen=false
      if (isopen) {
        periods.push({ close: { day: dayNum, time: closeHhmm } });
        isopen = false;
      }
    } else {
      // Regular hours
      // ColdFusion: if isopen and open != "0000", add close at midnight of current day
      if (isopen && openHhmm !== "0000") {
        periods.push({ close: { day: dayNum, time: "0000" } });
        isopen = false;
      }

      // ColdFusion: if Not isopen, set open
      if (!isopen) {
        currentPeriod = { open: { day: dayNum, time: openHhmm } };
      }

      // ColdFusion: close.day = same day if Day(open)==Day(close), else (day+1) MOD 7.
      // When close is 00:00 and open is not, it spans midnight (next day).
      const spansMidnight =
        closeHhmm === "0000" && openHhmm !== "0000" ||
        (parseInt(closeHhmm.slice(0, 2), 10) * 60 + parseInt(closeHhmm.slice(2), 10)) <
          (parseInt(openHhmm.slice(0, 2), 10) * 60 + parseInt(openHhmm.slice(2), 10));
      const closeDay = spansMidnight ? (dayNum + 1) % 7 : dayNum;

      currentPeriod.close = { day: closeDay, time: closeHhmm };
      periods.push({ ...currentPeriod } as { open: { day: number; time: string }; close: { day: number; time: string } });
      isopen = false;
    }
  }

  // When no periods: either no data at all (unknown => open) or all days closed (=> closed).
  // Don't assume opennow=true; compute from isOpenNow which handles both cases correctly.
  if (periods.length === 0) {
    let opennow: boolean;
    try {
      opennow = isOpenNow(input, now, { unknownAsOpen: true });
    } catch {
      opennow = true; // Fallback: treat as open on error
    }
    return { opennow, periods: [] };
  }

  // Check if all days are open 00:00-23:59 (isNonStopOpen when not fietskluizen)
  let allOpen24h = true;
  for (const day of DAY_ORDER) {
    const openKey = `Open_${day}` as keyof OpeningHoursInput;
    const dichtKey = `Dicht_${day}` as keyof OpeningHoursInput;
    const openTime = input[openKey];
    const closeTime = input[dichtKey];
    if (!isOpeningUnknown(openTime, closeTime) && !isOpenAllDay(openTime, closeTime)) {
      allOpen24h = false;
      break;
    }
  }
  if (allOpen24h) {
    return {
      opennow: true,
      periods: [{ day: 0, open: "0000" }],
    };
  }

  // Compute opennow using shared per-day logic (ColdFusion isOpened), not merged periods.
  let opennow: boolean;
  try {
    opennow = isOpenNow(input, now, { unknownAsOpen: true });
  } catch {
    opennow = true; // Fallback: treat as open on error
  }

  return { opennow, periods };
}
