/** Shared comparison logic for FMS API old vs new. */

export type DynamicDiffOptions = {
  allowDynamicDiffs?: boolean;
  maxverschil?: number;
};

/**
 * Recursively strips occupied/free from objects where the difference is within maxverschil
 * and totals to 0 (occDiff + freeDiff === 0). Used to filter out dynamic buurtstalling differences.
 */
function stripDynamicOccupationDifferences(
  oldObj: unknown,
  newObj: unknown,
  maxverschil: number
): { old: unknown; new: unknown } {
  if (maxverschil <= 0) return { old: oldObj, new: newObj };

  if (Array.isArray(oldObj) && Array.isArray(newObj)) {
    const resultOld: unknown[] = [];
    const resultNew: unknown[] = [];
    const len = Math.max(oldObj.length, newObj.length);
    for (let i = 0; i < len; i++) {
      const { old: o, new: n } = stripDynamicOccupationDifferences(oldObj[i], newObj[i], maxverschil);
      resultOld.push(o);
      resultNew.push(n);
    }
    return { old: resultOld, new: resultNew };
  }

  if (
    oldObj !== null &&
    typeof oldObj === "object" &&
    !Array.isArray(oldObj) &&
    newObj !== null &&
    typeof newObj === "object" &&
    !Array.isArray(newObj)
  ) {
    const oldRec = oldObj as Record<string, unknown>;
    const newRec = newObj as Record<string, unknown>;

    const oldOcc = typeof oldRec.occupied === "number" ? oldRec.occupied : null;
    const newOcc = typeof newRec.occupied === "number" ? newRec.occupied : null;
    const oldFree = typeof oldRec.free === "number" ? oldRec.free : null;
    const newFree = typeof newRec.free === "number" ? newRec.free : null;

    let shouldStrip = false;
    if (oldOcc !== null && newOcc !== null && oldFree !== null && newFree !== null) {
      const occDiff = oldOcc - newOcc;
      const freeDiff = oldFree - newFree;
      if (
        Math.abs(occDiff) <= maxverschil &&
        Math.abs(freeDiff) <= maxverschil &&
        occDiff + freeDiff === 0
      ) {
        shouldStrip = true;
      }
    }

    const resultOld: Record<string, unknown> = {};
    const resultNew: Record<string, unknown> = {};
    const allKeys = new Set([...Object.keys(oldRec), ...Object.keys(newRec)]);

    for (const k of allKeys) {
      if (shouldStrip && (k === "occupied" || k === "free")) continue;
      const { old: o, new: n } = stripDynamicOccupationDifferences(oldRec[k], newRec[k], maxverschil);
      resultOld[k] = o;
      resultNew[k] = n;
    }
    return { old: resultOld, new: resultNew };
  }

  return { old: oldObj, new: newObj };
}

/**
 * Prepares old/new API responses for comparison by optionally stripping dynamic
 * occupied/free differences (buurtstalling timing differences).
 */
export function prepareForCompare(
  oldRes: string,
  newRes: string,
  options: DynamicDiffOptions
): { old: string; new: string } {
  if (!options.allowDynamicDiffs || (options.maxverschil ?? 0) <= 0) {
    return { old: oldRes, new: newRes };
  }
  try {
    const oldObj = JSON.parse(oldRes);
    const newObj = JSON.parse(newRes);
    const max = options.maxverschil ?? 1;
    const { old: o, new: n } = stripDynamicOccupationDifferences(oldObj, newObj, max);
    return { old: JSON.stringify(o), new: JSON.stringify(n) };
  } catch {
    return { old: oldRes, new: newRes };
  }
}

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
