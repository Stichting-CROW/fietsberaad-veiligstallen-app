import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth";
import { authOptions } from "~/pages/api/auth/[...nextauth]";
import { userHasRight } from "~/types/utils";
import { VSSecurityTopic } from "~/types/securityprofile";
import { env } from "~/env.mjs";
import { buildTestFmsAuthHeader } from "~/server/services/fms/fms-test-credentials";
import { prisma } from "~/server/db";
import { getFullDatasetIds } from "~/server/services/fms/fms-v3-service";
import { responsesMatch, prepareForCompare, isLegacyNotFoundResponse, isLegacyUnusableOldApiError } from "~/server/utils/fms-compare";

const OLD_API_BASE = "https://remote.veiligstallen.nl";

export type FullDatasetTestResult = {
  testId: string;
  type: "city" | "location" | "section";
  citycode: string;
  locationid?: string;
  sectionid?: string;
  locationtype?: string;
  endpointId: string;
  endpointLabel: string;
  status: "identical" | "diff" | "error" | "skipped" | "uitzondering-biketypeid-sortering";
  error?: string;
};

export type FullDatasetTestResponse = {
  results: FullDatasetTestResult[];
  summary: { total: number; identical: number; diff: number; error: number; skipped: number };
};

const ENDPOINTS_OLD_API_FAILS_NON_NUMERIC: string[] = [
  "v3-location",
  "v3-sections",
  "v3-section",
  "v3-places",
  "v3-subscriptiontypes",
  "v3-balances",
  "v3-subscriptions",
  "v3-bikeupdates",
];

function isSkippedForNonNumericCitycode(citycode: string, endpointId: string): boolean {
  if (!citycode || /^\d+$/.test(citycode)) return false;
  return ENDPOINTS_OLD_API_FAILS_NON_NUMERIC.includes(endpointId);
}

/** Detect if response body indicates an error (old API may return 200 with error JSON). */
function looksLikeErrorResponse(text: string): string | null {
  if (!text || text.trim().length === 0) return "Empty response";
  try {
    const obj = JSON.parse(text) as unknown;
    if (obj && typeof obj === "object" && !Array.isArray(obj)) {
      const o = obj as Record<string, unknown>;
      if (typeof o.error === "string" && o.error.length > 0) return o.error;
    }
  } catch {
    /* not JSON */
  }
  return null;
}

async function fetchWithAuth(
  url: string,
  headers: Record<string, string>
): Promise<{ text: string; error: string | null }> {
  try {
    const res = await fetch(url, { headers });
    const text = await res.text();
    if (!res.ok) {
      return { text: "", error: `HTTP ${res.status}: ${text.slice(0, 200)}` };
    }
    const bodyError = looksLikeErrorResponse(text);
    if (bodyError) {
      return { text: "", error: bodyError };
    }
    return { text, error: null };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Fetch failed";
    return { text: "", error: msg };
  }
}

function appendDepthParam(url: string, depth: string, endpointId: string): string {
  if (endpointId.startsWith("v2-")) return url;
  const skipQuery = new Set([
    "v3-balances",
    "v3-subscriptions",
    "v3-bikeupdates",
    "v3-balance",
    "v3-biketypes",
    "v3-paymenttypes",
    "v3-servertime",
  ]);
  if (skipQuery.has(endpointId)) return url;
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}depth=${encodeURIComponent(depth)}&fields=${encodeURIComponent("*")}`;
}

function buildOldUrlV2Protected(
  endpointId: string,
  bikeparkID: string,
  sectionid: string | undefined,
  placeid: string | undefined,
  fromDate: string,
  oldBase: string,
  citycode: string = TESTGEMEENTE_CITYCODE
): string {
  const base = oldBase.replace(/\/$/, "");
  const loc = `${base}/rest/v3/citycodes/${citycode}/locations/${bikeparkID}`;
  if (endpointId === "v2-getJsonSectors") return `${loc}/sections`;
  if (endpointId === "v2-getJsonBikeUpdates") {
    return `${loc}/bikeupdates?from=${encodeURIComponent(fromDate)}`;
  }
  if (endpointId === "v2-getJsonSubscriptors") return `${loc}/subscriptions`;
  if (endpointId === "v2-getLockerInfo" && sectionid && placeid) {
    return `${loc}/sections/${sectionid}/places/${placeid}`;
  }
  return "";
}

function buildNewUrlV2Protected(
  endpointId: string,
  bikeparkID: string,
  sectionid: string | undefined,
  placeid: string | undefined,
  fromDate: string,
  newBase: string,
  citycode: string
): string {
  const base = newBase.replace(/\/$/, "");
  const loc = `${base}/api/fms/v4/citycodes/${citycode}/locations/${bikeparkID}`;
  if (endpointId === "v2-getJsonSectors") return `${loc}/sections`;
  if (endpointId === "v2-getJsonBikeUpdates") {
    return `${loc}/bikeupdates?from=${encodeURIComponent(fromDate)}`;
  }
  if (endpointId === "v2-getJsonSubscriptors") return `${loc}/subscriptions`;
  if (endpointId === "v2-getLockerInfo" && sectionid && placeid) {
    return `${loc}/sections/${sectionid}/places/${placeid}`;
  }
  return "";
}

function buildOldUrl(
  endpointId: string,
  citycode: string,
  locationid?: string,
  sectionid?: string,
  oldBase: string = OLD_API_BASE,
  depth: string = "3"
): string {
  const base = oldBase.replace(/\/$/, "");
  let url: string;
  if (endpointId === "v3-biketypes") url = `${base}/rest/v3/biketypes`;
  else if (endpointId === "v3-paymenttypes") url = `${base}/rest/v3/paymenttypes`;
  else if (endpointId === "v3-citycode") url = `${base}/rest/v3/citycodes/${citycode}`;
  else if (endpointId === "v3-locations") url = `${base}/rest/v3/citycodes/${citycode}/locations`;
  else if (endpointId === "v3-location" && locationid) url = `${base}/rest/v3/citycodes/${citycode}/locations/${locationid}`;
  else if (endpointId === "v3-sections" && locationid) url = `${base}/rest/v3/citycodes/${citycode}/locations/${locationid}/sections`;
  else if (endpointId === "v3-section" && locationid && sectionid) url = `${base}/rest/v3/citycodes/${citycode}/locations/${locationid}/sections/${sectionid}`;
  else if (endpointId === "v3-places" && locationid && sectionid) url = `${base}/rest/v3/citycodes/${citycode}/locations/${locationid}/sections/${sectionid}/places`;
  else if (endpointId === "v3-subscriptiontypes" && locationid) url = `${base}/rest/v3/citycodes/${citycode}/locations/${locationid}/subscriptiontypes`;
  else if (endpointId === "v3-balances" && locationid) url = `${base}/rest/v3/citycodes/${citycode}/locations/${locationid}/balances`;
  else if (endpointId === "v3-subscriptions" && locationid) url = `${base}/rest/v3/citycodes/${citycode}/locations/${locationid}/subscriptions`;
  else if (endpointId === "v3-bikeupdates" && locationid) url = `${base}/rest/v3/citycodes/${citycode}/locations/${locationid}/bikeupdates`;
  else return "";
  return appendDepthParam(url, depth, endpointId);
}

function buildNewUrl(
  endpointId: string,
  citycode: string,
  locationid?: string,
  sectionid?: string,
  newBase: string = "",
  depth: string = "3"
): string {
  const base = newBase.replace(/\/$/, "");
  let url: string;
  if (endpointId === "v3-biketypes") url = `${base}/api/fms/v4/biketypes`;
  else if (endpointId === "v3-paymenttypes") url = `${base}/api/fms/v4/paymenttypes`;
  else if (endpointId === "v3-citycode") url = `${base}/api/fms/v4/citycodes/${citycode}`;
  else if (endpointId === "v3-locations") url = `${base}/api/fms/v4/citycodes/${citycode}/locations`;
  else if (endpointId === "v3-location" && locationid) url = `${base}/api/fms/v4/citycodes/${citycode}/locations/${locationid}`;
  else if (endpointId === "v3-sections" && locationid) url = `${base}/api/fms/v4/citycodes/${citycode}/locations/${locationid}/sections`;
  else if (endpointId === "v3-section" && locationid && sectionid) url = `${base}/api/fms/v4/citycodes/${citycode}/locations/${locationid}/sections/${sectionid}`;
  else if (endpointId === "v3-places" && locationid && sectionid) url = `${base}/api/fms/v4/citycodes/${citycode}/locations/${locationid}/sections/${sectionid}/places`;
  else if (endpointId === "v3-subscriptiontypes" && locationid) url = `${base}/api/fms/v4/citycodes/${citycode}/locations/${locationid}/subscriptiontypes`;
  else if (endpointId === "v3-balances" && locationid) url = `${base}/api/fms/v4/citycodes/${citycode}/locations/${locationid}/balances`;
  else if (endpointId === "v3-subscriptions" && locationid) url = `${base}/api/fms/v4/citycodes/${citycode}/locations/${locationid}/subscriptions`;
  else if (endpointId === "v3-bikeupdates" && locationid) url = `${base}/api/fms/v4/citycodes/${citycode}/locations/${locationid}/bikeupdates`;
  else return "";
  return appendDepthParam(url, depth, endpointId);
}

const ENDPOINT_LABELS: Record<string, string> = {
  "v3-biketypes": "V3 biketypes",
  "v3-paymenttypes": "V3 paymenttypes",
  "v3-citycode": "V3 citycodes/{citycode}",
  "v3-locations": "V3 citycodes/{citycode}/locations",
  "v3-location": "V3 locations/{locationid}",
  "v3-sections": "V3 locations/{locationid}/sections",
  "v3-section": "V3 sections/{sectionid}",
  "v3-places": "V3 sections/{sectionid}/places",
  "v3-subscriptiontypes": "V3 locations/{locationid}/subscriptiontypes",
  "v3-balances": "V3 locations/{locationid}/balances",
  "v3-subscriptions": "V3 locations/{locationid}/subscriptions",
  "v3-bikeupdates": "V3 locations/{locationid}/bikeupdates",
  "v2-getJsonSectors": "V2 getJsonSectors/{bikeparkID}",
  "v2-getJsonBikeUpdates": "V2 getJsonBikeUpdates/{bikeparkID}",
  "v2-getJsonSubscriptors": "V2 getJsonSubscriptors/{bikeparkID}",
  "v2-getLockerInfo": "V2 getLockerInfo/{bikeparkID}/{sectionID}/{placeID}",
};

const V2_PROTECTED_READS = [
  "v2-getJsonSectors",
  "v2-getJsonBikeUpdates",
  "v2-getJsonSubscriptors",
] as const;

const TESTGEMEENTE_CITYCODE = "9933";
const V2_BIKE_UPDATES_FROM = "2020-01-01T00:00:00.000Z";

/**
 * Full dataset FMS API comparison. Fetches all cities/locations/sections from DB,
 * runs old vs new API for each endpoint, logs progress to CLI, returns JSON.
 */
export default async function handle(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ message: "Method not allowed" });
  }

  const session = await getServerSession(req, res, authOptions);
  if (!session?.user) {
    return res.status(401).json({ message: "Niet ingelogd" });
  }
  if (!userHasRight(session.user.securityProfile, VSSecurityTopic.fietsberaad_superadmin)) {
    return res.status(403).json({ message: "Geen rechten" });
  }

  const { oldApiUrl, newApiUrl, useApiCredentials, authorizationHeader, depth, citycode, allowDynamicDiffs, maxverschil } = req.body as {
    oldApiUrl?: string;
    newApiUrl?: string;
    useApiCredentials?: boolean;
    authorizationHeader?: string;
    depth?: string;
    citycode?: string;
    allowDynamicDiffs?: boolean;
    maxverschil?: number;
  };
  const depthParam = typeof depth === "string" && depth ? depth : "3";
  const citycodeFilter = typeof citycode === "string" && citycode ? citycode : undefined;

  const oldBase = typeof oldApiUrl === "string" && oldApiUrl ? oldApiUrl : OLD_API_BASE;
  const protocol = (req.headers["x-forwarded-proto"] as string) || (req.headers["x-forwarded-ssl"] === "on" ? "https" : "http");
  const host = (req.headers["host"] as string) || `localhost:${process.env.PORT ?? 3000}`;
  const newBase = typeof newApiUrl === "string" && newApiUrl ? newApiUrl : `${protocol}://${host}`;

  const headers: Record<string, string> = { Accept: "application/json" };
  if (useApiCredentials) {
    const auth = await buildTestFmsAuthHeader();
    if (auth) headers.Authorization = auth;
  } else if (typeof authorizationHeader === "string" && authorizationHeader.startsWith("Basic ")) {
    headers.Authorization = authorizationHeader;
  }

  const results: FullDatasetTestResult[] = [];
  let testIndex = 0;

  const runTest = async (
    endpointId: string,
    type: "city" | "location" | "section",
    citycode: string,
    locationid?: string,
    sectionid?: string,
    locationtype?: string
  ): Promise<void> => {
    const testId = `${type}-${citycode}${locationid ? `-${locationid}` : ""}${sectionid ? `-${sectionid}` : ""}-${endpointId}`;
    const label = ENDPOINT_LABELS[endpointId] ?? endpointId;

    if (isSkippedForNonNumericCitycode(citycode, endpointId)) {
      results.push({
        testId,
        type,
        citycode,
        locationid,
        sectionid,
        locationtype,
        endpointId,
        endpointLabel: label,
        status: "skipped",
      });
      return;
    }

    const oldUrl = buildOldUrl(endpointId, citycode, locationid, sectionid, oldBase, depthParam);
    const newUrl = buildNewUrl(endpointId, citycode, locationid, sectionid, newBase, depthParam);
    if (!oldUrl || !newUrl) return;

    const [oldRes, newRes] = await Promise.all([
      fetchWithAuth(oldUrl, headers),
      fetchWithAuth(newUrl, headers),
    ]);

    testIndex++;
    const scope = sectionid ? `${citycode}/${locationid}/${sectionid}` : locationid ? `${citycode}/${locationid}` : citycode;
    console.log(`[FMS full-dataset ${testIndex}] ${label} ${scope}`);

    if (!oldRes.error && isLegacyNotFoundResponse(oldRes.text)) {
      results.push({
        testId,
        type,
        citycode,
        locationid,
        sectionid,
        locationtype,
        endpointId,
        endpointLabel: label,
        status: "skipped",
      });
      console.log(`  -> skipped (old API: stall not found)`);
      return;
    }

    if (isLegacyUnusableOldApiError(oldRes.error)) {
      results.push({
        testId,
        type,
        citycode,
        locationid,
        sectionid,
        locationtype,
        endpointId,
        endpointLabel: label,
        status: "skipped",
      });
      console.log(`  -> skipped (old API: ${oldRes.error})`);
      return;
    }

    if (oldRes.error || newRes.error) {
      const err = [oldRes.error, newRes.error].filter(Boolean).join("; ");
      console.log(`  -> error: ${err}`);
      results.push({
        testId,
        type,
        citycode,
        locationid,
        sectionid,
        locationtype,
        endpointId,
        endpointLabel: label,
        status: "error",
        error: err,
      });
      return;
    }

    const maxVal =
      typeof maxverschil === "number"
        ? maxverschil
        : typeof maxverschil === "string"
          ? parseInt(maxverschil, 10)
          : 1;
    const { old: oldForCompare, new: newForCompare } = prepareForCompare(oldRes.text, newRes.text, {
      allowDynamicDiffs: !!allowDynamicDiffs,
      maxverschil: allowDynamicDiffs ? maxVal : 0,
    });
    const identical = responsesMatch(endpointId, oldForCompare, newForCompare);
    const status: FullDatasetTestResult["status"] = identical ? "identical" : "diff";
    if (!identical) console.log(`  -> ${status}`);
    results.push({
      testId,
      type,
      citycode,
      locationid,
      sectionid,
      locationtype,
      endpointId,
      endpointLabel: label,
      status,
    });
  };

  const runV2ProtectedTest = async (
    endpointId: string,
    bikeparkID: string,
    sectionid?: string,
    placeid?: string
  ): Promise<void> => {
    const testId = `v2-${bikeparkID}${sectionid ? `-${sectionid}` : ""}${placeid ? `-${placeid}` : ""}-${endpointId}`;
    const label = ENDPOINT_LABELS[endpointId] ?? endpointId;
    const oldUrl = buildOldUrlV2Protected(
      endpointId,
      bikeparkID,
      sectionid,
      placeid,
      V2_BIKE_UPDATES_FROM,
      oldBase
    );
    const newUrl = buildNewUrlV2Protected(
      endpointId,
      bikeparkID,
      sectionid,
      placeid,
      V2_BIKE_UPDATES_FROM,
      newBase,
      TESTGEMEENTE_CITYCODE
    );
    if (!oldUrl || !newUrl) return;

    const [oldRes, newRes] = await Promise.all([
      fetchWithAuth(oldUrl, headers),
      fetchWithAuth(newUrl, headers),
    ]);

    testIndex++;
    console.log(`[FMS full-dataset ${testIndex}] ${label} ${bikeparkID}`);

    if (!oldRes.error && isLegacyNotFoundResponse(oldRes.text)) {
      results.push({
        testId,
        type: "location",
        citycode: TESTGEMEENTE_CITYCODE,
        locationid: bikeparkID,
        sectionid,
        endpointId,
        endpointLabel: label,
        status: "skipped",
      });
      return;
    }

    if (isLegacyUnusableOldApiError(oldRes.error)) {
      results.push({
        testId,
        type: "location",
        citycode: TESTGEMEENTE_CITYCODE,
        locationid: bikeparkID,
        sectionid,
        endpointId,
        endpointLabel: label,
        status: "skipped",
      });
      console.log(`  -> skipped (old API: ${oldRes.error})`);
      return;
    }

    if (oldRes.error || newRes.error) {
      const err = [oldRes.error, newRes.error].filter(Boolean).join("; ");
      results.push({
        testId,
        type: "location",
        citycode: TESTGEMEENTE_CITYCODE,
        locationid: bikeparkID,
        sectionid,
        endpointId,
        endpointLabel: label,
        status: "error",
        error: err,
      });
      return;
    }

    const maxVal =
      typeof maxverschil === "number"
        ? maxverschil
        : typeof maxverschil === "string"
          ? parseInt(maxverschil, 10)
          : 1;
    const { old: oldForCompare, new: newForCompare } = prepareForCompare(oldRes.text, newRes.text, {
      allowDynamicDiffs: !!allowDynamicDiffs,
      maxverschil: allowDynamicDiffs ? maxVal : 0,
    });
    const identical = responsesMatch(endpointId, oldForCompare, newForCompare);
    if (!identical) console.log(`  -> diff`);
    results.push({
      testId,
      type: "location",
      citycode: TESTGEMEENTE_CITYCODE,
      locationid: bikeparkID,
      sectionid,
      endpointId,
      endpointLabel: label,
      status: identical ? "identical" : "diff",
    });
  };

  try {
    const { cities, locations, sections } = await getFullDatasetIds(citycodeFilter ? { citycode: citycodeFilter } : undefined);
    console.log(`[FMS full-dataset] Starting: ${cities.length} cities, ${locations.length} locations, ${sections.length} sections`);

    // Catalog aux follows the V3 contract (not V2 REST/v1). Run once, not per city.
    await runTest("v3-biketypes", "city", "catalog");
    await runTest("v3-paymenttypes", "city", "catalog");

    for (const { citycode } of cities) {
      await runTest("v3-citycode", "city", citycode);
      await runTest("v3-locations", "city", citycode);

      const cityLocations = locations.filter((l) => l.citycode === citycode);
      for (const { locationid, locationtype } of cityLocations) {
        await runTest("v3-location", "location", citycode, locationid, undefined, locationtype);
        await runTest("v3-sections", "location", citycode, locationid, undefined, locationtype);
        await runTest("v3-subscriptiontypes", "location", citycode, locationid, undefined, locationtype);
        // Operator reads: testgemeente credentials only. Other cities 401 on both sides.
        if (headers.Authorization && citycode === TESTGEMEENTE_CITYCODE) {
          await runTest("v3-balances", "location", citycode, locationid, undefined, locationtype);
          await runTest("v3-subscriptions", "location", citycode, locationid, undefined, locationtype);
          await runTest("v3-bikeupdates", "location", citycode, locationid, undefined, locationtype);
        }

        const locSections = sections.filter((s) => s.citycode === citycode && s.locationid === locationid);
        for (const { sectionid, locationtype: secLocationtype } of locSections) {
          await runTest("v3-section", "section", citycode, locationid, sectionid, secLocationtype);
          await runTest("v3-places", "section", citycode, locationid, sectionid, secLocationtype);
        }
      }
    }

    // V2 protected reads: testgemeente locations only (requires operator credentials).
    if (headers.Authorization && (!citycodeFilter || citycodeFilter === TESTGEMEENTE_CITYCODE)) {
      const tgLocations = locations.filter((l) => l.citycode === TESTGEMEENTE_CITYCODE);
      for (const { locationid } of tgLocations) {
        for (const endpointId of V2_PROTECTED_READS) {
          await runV2ProtectedTest(endpointId, locationid);
        }
      }
      // Fietskluizen locker read (9933_003) — first section + place from DB when available.
      const lockerLocation = "9933_003";
      const lockerSection = "9933_003_1";
      const sectie = await prisma.fietsenstalling_sectie.findFirst({
        where: { externalId: lockerSection },
        select: { sectieId: true },
      });
      const place = sectie
        ? await prisma.fietsenstalling_plek.findFirst({
            where: { sectie_id: BigInt(sectie.sectieId) },
            select: { id: true },
            orderBy: { id: "asc" },
          })
        : null;
      if (place) {
        await runV2ProtectedTest(
          "v2-getLockerInfo",
          lockerLocation,
          lockerSection,
          String(place.id)
        );
      }
    }

    const identical = results.filter((r) => r.status === "identical").length;
    const diff = results.filter((r) => r.status === "diff").length;
    const error = results.filter((r) => r.status === "error").length;
    const skipped = results.filter((r) => r.status === "skipped").length;

    console.log(
      `[FMS full-dataset] Done: ${results.length} tests, ${identical} identical, ${diff} diff, ${error} error, ${skipped} skipped`
    );

    const response: FullDatasetTestResponse = {
      results,
      summary: { total: results.length, identical, diff, error, skipped },
    };
    return res.status(200).json(response);
  } catch (err) {
    console.error("[FMS full-dataset] Error:", err);
    return res.status(500).json({
      message: err instanceof Error ? err.message : "Internal error",
    });
  }
}
