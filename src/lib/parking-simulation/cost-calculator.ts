/**
 * Transaction cost calculation from tariff rates and parking duration.
 * Uses full-period summation (no proration for partial periods).
 */

import type { TariffRate } from "./types";
import type { TariffTimespanUnit } from "./types";

/**
 * Calculate transaction cost from stepped tariff rates and duration.
 * Each rule: timespan (duration of period), cost (price for that period).
 * Formula: sum cost for each complete period that fits in duration.
 *
 * @param durationMinutes - Parking duration in minutes
 * @param rates - Rates ordered by index (asc)
 * @param unit - Timespan unit in rates ('hours' or 'minutes')
 */
export function calculateTransactionCost(
  durationMinutes: number,
  rates: TariffRate[],
  unit: TariffTimespanUnit = "hours"
): number {
  if (rates.length === 0) return 0;
  if (durationMinutes <= 0) return 0;

  const durationInUnit = unit === "hours" ? durationMinutes / 60 : durationMinutes;

  let totalCost = 0;
  let elapsed = 0;

  for (const rule of rates) {
    if (elapsed >= durationInUnit) break;
    const periods = Math.floor((durationInUnit - elapsed) / rule.timespan);
    totalCost += periods * rule.cost;
    elapsed += periods * rule.timespan;
  }

  return Math.round(totalCost * 100) / 100;
}
