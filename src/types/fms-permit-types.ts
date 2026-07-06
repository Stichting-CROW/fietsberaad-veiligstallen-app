/** FMS permit types (CF: application.domvalues.permittypes). */
export const FMS_PERMIT_TYPES = [
  { name: "operator", label: "Operator (alle rechten)" },
  { name: "dataprovider.type1", label: "Checkins + checkouts + bezettingsdata" },
  { name: "dataprovider.type2", label: "Afgeronde transacties + bezettingsdata" },
] as const;

export type FmsPermitTypeName = (typeof FMS_PERMIT_TYPES)[number]["name"];

const VALID_NAMES = new Set<string>(FMS_PERMIT_TYPES.map((t) => t.name));

/** Parse comma-separated Permit column into individual type names. */
export function expandPermitString(permit: string | null | undefined): string[] {
  if (!permit?.trim()) return [];
  return permit
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/** Serialize selected types to DB Permit column (sorted, stable). */
export function serializePermitTypes(types: string[]): string {
  const unique = [...new Set(types.map((t) => t.trim()).filter(Boolean))];
  unique.sort((a, b) => {
    const ai = FMS_PERMIT_TYPES.findIndex((t) => t.name === a);
    const bi = FMS_PERMIT_TYPES.findIndex((t) => t.name === b);
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
  });
  return unique.join(",");
}

export function validatePermitTypes(types: string[]): string | null {
  if (types.length === 0) return "Selecteer minimaal één recht";
  for (const t of types) {
    if (!VALID_NAMES.has(t)) return `Ongeldig recht: ${t}`;
  }
  return null;
}
