import { Cron } from "croner";

export const DEFAULT_TIMEZONE = "Europe/Amsterdam";

function pattern(expr: string, timezone: string): Cron {
  return new Cron(expr.trim(), { timezone, paused: true });
}

export function validateCron(expr: string, timezone = DEFAULT_TIMEZONE): string | null {
  if (!expr || expr.trim().split(/\s+/).length !== 5) {
    return "Gebruik vijf velden: minuut uur dag maand weekdag";
  }
  try {
    pattern(expr, timezone);
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

export function nextRunAfter(expr: string, timezone: string, after: Date): Date | null {
  return pattern(expr, timezone).nextRun(after) ?? null;
}

export function nextRuns(expr: string, timezone: string, count: number, after = new Date()): Date[] {
  return pattern(expr, timezone).nextRuns(count, after);
}

export type SlotPlan = { due: false } | { due: true; slot: Date; next: Date | null };

/** Missed slots collapse into one run; the next slot is always after `now`. */
export function planSlot(cron: string, timezone: string, nextRunAt: Date | null, now: Date): SlotPlan {
  if (!nextRunAt || nextRunAt > now) return { due: false };
  return { due: true, slot: nextRunAt, next: nextRunAfter(cron, timezone, now) };
}

const pad = (value: string) => value.padStart(2, "0");
const isNum = (value: string) => /^\d+$/.test(value);

export function describeCron(expr: string): string {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return expr;
  const [min, hour, dom, mon, dow] = parts as [string, string, string, string, string];
  const everyDay = dom === "*" && mon === "*" && dow === "*";
  if (!everyDay) return expr;
  if (min === "*" && hour === "*") return "elke minuut";
  const stepMin = /^\*\/(\d+)$/.exec(min);
  if (stepMin && hour === "*") return `elke ${stepMin[1]} minuten`;
  if (stepMin) return `elke ${stepMin[1]} minuten (uur ${hour})`;
  if (isNum(min) && isNum(hour)) return `dagelijks ${pad(hour)}:${pad(min)}`;
  if (isNum(min) && hour === "*") return `elk uur om :${pad(min)}`;
  return expr;
}
