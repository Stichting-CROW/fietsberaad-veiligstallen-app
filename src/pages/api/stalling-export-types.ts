export const ALLOWED_STALLINGTYPE_NAMES_GOOGLE = [
  "Bewaakte stalling",
  "Geautomatiseerde stalling",
  "Stalling met toezicht",
  "Onbewaakte stalling",
] as const;

export const EXCLUDED_STALLINGTYPE_NAMES_OSM = [
  "fietskluizen",
] as const;

/** Max age of a data-owner datakwaliteit-controle for inclusion in public exports (Google Maps, OSM). */
export const DATAKWALITEIT_EXPORT_MAX_AGE_MONTHS = 24;

export function getDatakwaliteitControleCutoffDate(now = new Date()): Date {
  const cutoff = new Date(now);
  cutoff.setMonth(cutoff.getMonth() - DATAKWALITEIT_EXPORT_MAX_AGE_MONTHS);
  return cutoff;
}
