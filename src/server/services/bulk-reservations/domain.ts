/** ColdFusion Bulkreservation / BikeparkSection overlap and datetime rules. */

export type BulkHoldInput = {
  sectieId: number;
  aantal: number;
  start: Date;
  end: Date;
  recurrent: boolean;
};

export type BulkHoldLike = {
  id?: number;
  sectieId: number;
  start: Date;
  end: Date;
  recurrent: boolean;
};

export const BULK_ERROR_CAPACITY =
  "Aantal plaatsen bulkreservering kan niet groter zijn dan totale capaciteit van de sectie";
export const BULK_ERROR_OVERLAP = "Nieuwe bulkreservering overlapt bestaande";
export const BULK_ERROR_EXCEPTION_WEEKDAY =
  "Uitzondering valt niet op dezelfde dag als deze bulkreservering";
export const BULK_ERROR_EXCEPTION_DUPLICATE = "Er bestaat al een uitzondering voor deze dag";
export const BULK_ERROR_EXCEPTION_RECURRENT_ONLY = "Uitzonderingen zijn alleen mogelijk voor wekelijks terugkerende bulkreserveringen";

/** Two ranges overlap when start1 < end2 && start2 < end1 (ColdFusion helperclass.dateRangesOverlap). */
export function dateRangesOverlap(start1: Date, end1: Date, start2: Date, end2: Date): boolean {
  return start1.getTime() < end2.getTime() && start2.getTime() < end1.getTime();
}

function timeOfDayMs(d: Date): number {
  return d.getHours() * 3600000 + d.getMinutes() * 60000 + d.getSeconds() * 1000;
}

/** Normalize clock span to [baseDay, baseDay+1) for overnight end-before-start. */
function clockSpan(start: Date, end: Date): { startMs: number; endMs: number } {
  const base = new Date(2000, 0, 1).getTime();
  let startMs = base + timeOfDayMs(start);
  let endMs = base + timeOfDayMs(end);
  if (endMs <= startMs) {
    endMs += 86400000;
  }
  return { startMs, endMs };
}

function clockSpansOverlap(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  const spanA = clockSpan(aStart, aEnd);
  const spanB = clockSpan(bStart, bEnd);
  return dateRangesOverlap(
    new Date(spanA.startMs),
    new Date(spanA.endMs),
    new Date(spanB.startMs),
    new Date(spanB.endMs)
  );
}

/** Weekly bulk applies on calendar day D from its first start date onward (same weekday). */
export function recurrentAppliesOnDay(recurrentStart: Date, day: Date): boolean {
  if (day.getDay() !== recurrentStart.getDay()) return false;
  return startOfLocalDay(day).getTime() >= startOfLocalDay(recurrentStart).getTime();
}

/**
 * ColdFusion Bulkreservation.overlapsBulkreservation, with a fix for one-off vs weekly:
 * a one-off on date D only conflicts with a weekly hold if that weekly pattern applies on D
 * (not merely because both fall on the same weekday in the abstract).
 */
export function bulkHoldsOverlap(a: BulkHoldLike, b: BulkHoldLike): boolean {
  if (a.sectieId !== b.sectieId) return false;

  if (!a.recurrent && !b.recurrent) {
    return dateRangesOverlap(a.start, a.end, b.start, b.end);
  }

  if (a.recurrent && b.recurrent) {
    if (a.start.getDay() !== b.start.getDay()) return false;
    return clockSpansOverlap(a.start, a.end, b.start, b.end);
  }

  const oneOff = a.recurrent ? b : a;
  const recurrent = a.recurrent ? a : b;
  if (!recurrentAppliesOnDay(recurrent.start, oneOff.start)) return false;
  return clockSpansOverlap(oneOff.start, oneOff.end, recurrent.start, recurrent.end);
}

/** Parse YYYY-MM-DD from the date input as local calendar date (no UTC shift). */
export function parseLocalDateInput(isoDate: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate.trim());
  if (!m) throw new BulkValidationError("Ongeldige datum");
  return new Date(Number(m[1]), Number(m[2]!) - 1, Number(m[3]), 12, 0, 0, 0);
}

export function localDateInputValue(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function buildBulkWindow(
  calendarDate: Date,
  startTime: string,
  endTime: string
): { start: Date; end: Date } {
  const [sh, sm] = parseHm(startTime);
  const [eh, em] = parseHm(endTime);
  const start = new Date(calendarDate);
  start.setHours(sh, sm, 0, 0);
  const end = new Date(calendarDate);
  end.setHours(eh, em, 0, 0);
  if (start.getTime() > end.getTime()) {
    end.setDate(end.getDate() + 1);
  }
  return { start, end };
}

function parseHm(hm: string): [number, number] {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hm.trim());
  if (!m) throw new Error("Invalid time");
  return [Number(m[1]), Number(m[2])];
}

export function startOfLocalDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function sameCalendarDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function exceptionMatchesBulkWeekday(bulkStart: Date, exceptionDate: Date): boolean {
  return bulkStart.getDay() === exceptionDate.getDay();
}

export function findOverlappingIds(holds: BulkHoldLike[]): Set<number> {
  const overlapping = new Set<number>();
  for (let i = 0; i < holds.length; i++) {
    for (let j = i + 1; j < holds.length; j++) {
      const a = holds[i]!;
      const b = holds[j]!;
      if (bulkHoldsOverlap(a, b)) {
        if (a.id != null) overlapping.add(a.id);
        if (b.id != null) overlapping.add(b.id);
      }
    }
  }
  return overlapping;
}

export function assertNoOverlapWithExisting(
  candidate: BulkHoldLike,
  existing: BulkHoldLike[]
): void {
  for (const e of existing) {
    if (candidate.id != null && e.id === candidate.id) continue;
    if (bulkHoldsOverlap(candidate, e)) {
      throw new BulkValidationError(BULK_ERROR_OVERLAP);
    }
  }
}

export class BulkValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BulkValidationError";
  }
}

export function addWeeks(d: Date, weeks: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + weeks * 7);
  return x;
}

/** One catch-up step: archive if needed, then shift one week. Returns updated start/end or null if nothing to do. */
export function nextRollForwardState(
  start: Date,
  end: Date,
  today: Date
): { archive: boolean; start: Date; end: Date } | null {
  const todayStart = startOfLocalDay(today);
  const endDay = startOfLocalDay(end);
  if (endDay.getTime() >= todayStart.getTime()) {
    return null;
  }
  return {
    archive: true,
    start: addWeeks(start, 1),
    end: addWeeks(end, 1),
  };
}
