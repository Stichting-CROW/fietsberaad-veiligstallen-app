/**
 * Capacity stored on sectie_fietstype.
 * ColdFusion processSectionByForm sets this to 0 when the bike type is not allowed.
 */
export function storedBikeTypeCapacity(
  capaciteit: number | null | undefined,
  toegestaan: boolean | null | undefined
): number {
  if (toegestaan === false) return 0;
  const value = capaciteit ?? 0;
  return Number.isFinite(value) ? value : 0;
}

/**
 * ColdFusion BikeparkSection.getCapacity(), written back with setTotalCapacity().
 * Sum of sectie_fietstype.Capaciteit after disallowed types have been stored as 0.
 */
export function sectionTotalCapacity(capacities: Array<number | null | undefined>): number {
  return capacities.reduce((sum, capacity) => sum + (capacity ?? 0), 0);
}
