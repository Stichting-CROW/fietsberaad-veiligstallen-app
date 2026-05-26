/**
 * Passtype / idtype mapping (ColdFusion TransactionGateway).
 */

const PASSTYPE_TO_INTEGER: Record<string, number> = {
  sleutelhanger: 0,
  ovchip: 1,
  cijfercode: 2,
  tijdelijk: 3,
  tmp_sleutelhanger: 4,
  biesieklette: 10,
  plek: 20,
};

const INTEGER_TO_PASSTYPE: Record<number, string> = {
  0: "sleutelhanger",
  1: "ovchip",
  2: "cijfercode",
  3: "tijdelijk",
  4: "tmp_sleutelhanger",
  10: "biesieklette",
  20: "plek",
};

/** ColdFusion TransactionGateway.passtype2integer / convertStringPasstype2integer */
export function passtype2integer(passtype: string | number | null | undefined): number {
  if (passtype == null || passtype === "") return 99;
  if (typeof passtype === "number" && !Number.isNaN(passtype)) return passtype;
  const s = String(passtype).trim();
  if (/^\d+$/.test(s)) return parseInt(s, 10);
  const key = s.toLowerCase();
  return PASSTYPE_TO_INTEGER[key] ?? 99;
}

/** ColdFusion TransactionGateway.passtype2string for DB Pastype column */
export function passtype2string(idtype: number): string {
  const s = INTEGER_TO_PASSTYPE[idtype];
  if (!s) throw new Error(`Onbekend idtype ${idtype}`);
  return s;
}

/** ColdFusion helperclass.dateTimeToString(..., true) — local time, no timezone suffix */
export function formatCfDateTime(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
