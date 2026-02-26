/** Shared comparison logic for FMS API old vs new. */

function canonicalJson(obj: unknown): string {
  if (obj === null || typeof obj !== "object") return JSON.stringify(obj);
  if (Array.isArray(obj)) return "[" + obj.map(canonicalJson).join(",") + "]";
  const keys = Object.keys(obj as object).sort();
  return "{" + keys.map((k) => JSON.stringify(k) + ":" + canonicalJson((obj as Record<string, unknown>)[k])).join(",") + "}";
}

function normalizePriceForCompare(obj: unknown): unknown {
  if (obj === null || typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map(normalizePriceForCompare);
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    result[k] = k === "price" ? 0 : normalizePriceForCompare(v);
  }
  return result;
}

export function responsesMatch(endpointId: string, oldRes: string, newRes: string): boolean {
  if (endpointId === "v2-getServerTime") {
    try {
      const toMs = (s: string): number => {
        let v: string | number = s.trim();
        try {
          v = JSON.parse(s);
        } catch {
          /* use raw string */
        }
        return new Date(v as string | number).getTime();
      };
      const oldMs = toMs(oldRes);
      const newMs = toMs(newRes);
      if (Number.isNaN(oldMs) || Number.isNaN(newMs)) return false;
      return Math.abs(oldMs - newMs) < 1000;
    } catch {
      return false;
    }
  }
  if (endpointId === "v3-subscriptiontypes") {
    try {
      const oldData = JSON.parse(oldRes);
      const newData = JSON.parse(newRes);
      return canonicalJson(normalizePriceForCompare(oldData)) === canonicalJson(normalizePriceForCompare(newData));
    } catch {
      return false;
    }
  }
  try {
    const a = JSON.parse(oldRes);
    const b = JSON.parse(newRes);
    return canonicalJson(a) === canonicalJson(b);
  } catch {
    return oldRes.trim() === newRes.trim();
  }
}
