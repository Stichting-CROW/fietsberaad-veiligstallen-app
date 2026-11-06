/** Comma-separated SiteIDs, or `*` for every organisatie. Unset means the Java service still owns writes. */
export function isBuurtstallingenEngineEnabled(siteId: string): boolean {
  const raw = process.env.BUURTSTALLINGEN_ENGINE_SITE_IDS?.trim() ?? "";
  if (!raw) return false;
  if (raw === "*") return true;
  return raw.split(",").map((id) => id.trim()).filter(Boolean).includes(siteId);
}

export const STALLING_TYPES = ["buurtstalling", "fietstrommel"] as const;
export type StallingType = (typeof STALLING_TYPES)[number];
