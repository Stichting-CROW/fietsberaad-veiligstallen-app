import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth";
import { authOptions } from "~/pages/api/auth/[...nextauth]";
import { userHasRight } from "~/types/utils";
import { VSSecurityTopic } from "~/types/securityprofile";
import { env } from "~/env.mjs";
import { getFullDatasetIds } from "~/server/services/fms/fms-v3-service";
import { responsesMatch, prepareForCompare } from "~/server/utils/fms-compare";

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
  status: "identical" | "diff" | "error";
  error?: string;
};

export type FullDatasetTestResponse = {
  results: FullDatasetTestResult[];
  summary: { total: number; identical: number; diff: number; error: number };
};

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

function appendDepthParam(url: string, depth: string): string {
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}depth=${encodeURIComponent(depth)}`;
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
  if (endpointId === "v3-citycode") url = `${base}/rest/v3/citycodes/${citycode}`;
  else if (endpointId === "v3-locations") url = `${base}/rest/v3/citycodes/${citycode}/locations`;
  else if (endpointId === "v3-location" && locationid) url = `${base}/rest/v3/citycodes/${citycode}/locations/${locationid}`;
  else if (endpointId === "v3-sections" && locationid) url = `${base}/rest/v3/citycodes/${citycode}/locations/${locationid}/sections`;
  else if (endpointId === "v3-section" && locationid && sectionid) url = `${base}/rest/v3/citycodes/${citycode}/locations/${locationid}/sections/${sectionid}`;
  else if (endpointId === "v3-places" && locationid && sectionid) url = `${base}/rest/v3/citycodes/${citycode}/locations/${locationid}/sections/${sectionid}/places`;
  else if (endpointId === "v3-subscriptiontypes" && locationid) url = `${base}/rest/v3/citycodes/${citycode}/locations/${locationid}/subscriptiontypes`;
  else return "";
  return appendDepthParam(url, depth);
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
  if (endpointId === "v3-citycode") url = `${base}/api/fms/v3/citycodes/${citycode}`;
  else if (endpointId === "v3-locations") url = `${base}/api/fms/v3/citycodes/${citycode}/locations`;
  else if (endpointId === "v3-location" && locationid) url = `${base}/api/fms/v3/citycodes/${citycode}/locations/${locationid}`;
  else if (endpointId === "v3-sections" && locationid) url = `${base}/api/fms/v3/citycodes/${citycode}/locations/${locationid}/sections`;
  else if (endpointId === "v3-section" && locationid && sectionid) url = `${base}/api/fms/v3/citycodes/${citycode}/locations/${locationid}/sections/${sectionid}`;
  else if (endpointId === "v3-places" && locationid && sectionid) url = `${base}/api/fms/v3/citycodes/${citycode}/locations/${locationid}/sections/${sectionid}/places`;
  else if (endpointId === "v3-subscriptiontypes" && locationid) url = `${base}/api/fms/v3/citycodes/${citycode}/locations/${locationid}/subscriptiontypes`;
  else return "";
  return appendDepthParam(url, depth);
}

const ENDPOINT_LABELS: Record<string, string> = {
  "v3-citycode": "V3 citycodes/{citycode}",
  "v3-locations": "V3 citycodes/{citycode}/locations",
  "v3-location": "V3 locations/{locationid}",
  "v3-sections": "V3 locations/{locationid}/sections",
  "v3-section": "V3 sections/{sectionid}",
  "v3-places": "V3 sections/{sectionid}/places",
  "v3-subscriptiontypes": "V3 locations/{locationid}/subscriptiontypes",
};

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
  if (useApiCredentials && env.FMS_TEST_USER && env.FMS_TEST_PASS) {
    headers.Authorization = `Basic ${Buffer.from(`${env.FMS_TEST_USER}:${env.FMS_TEST_PASS}`).toString("base64")}`;
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
    const oldUrl = buildOldUrl(endpointId, citycode, locationid, sectionid, oldBase, depthParam);
    const newUrl = buildNewUrl(endpointId, citycode, locationid, sectionid, newBase, depthParam);
    if (!oldUrl || !newUrl) return;

    const testId = `${type}-${citycode}${locationid ? `-${locationid}` : ""}${sectionid ? `-${sectionid}` : ""}-${endpointId}`;

    const [oldRes, newRes] = await Promise.all([
      fetchWithAuth(oldUrl, headers),
      fetchWithAuth(newUrl, headers),
    ]);

    testIndex++;
    const label = ENDPOINT_LABELS[endpointId] ?? endpointId;
    const scope = sectionid ? `${citycode}/${locationid}/${sectionid}` : locationid ? `${citycode}/${locationid}` : citycode;
    console.log(`[FMS full-dataset ${testIndex}] ${label} ${scope}`);

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
    const status = identical ? "identical" : "diff";
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

  try {
    const { cities, locations, sections } = await getFullDatasetIds(citycodeFilter ? { citycode: citycodeFilter } : undefined);
    console.log(`[FMS full-dataset] Starting: ${cities.length} cities, ${locations.length} locations, ${sections.length} sections`);

    for (const { citycode } of cities) {
      await runTest("v3-citycode", "city", citycode);
      await runTest("v3-locations", "city", citycode);

      const cityLocations = locations.filter((l) => l.citycode === citycode);
      for (const { locationid, locationtype } of cityLocations) {
        await runTest("v3-location", "location", citycode, locationid, undefined, locationtype);
        await runTest("v3-sections", "location", citycode, locationid, undefined, locationtype);
        await runTest("v3-subscriptiontypes", "location", citycode, locationid, undefined, locationtype);

        const locSections = sections.filter((s) => s.citycode === citycode && s.locationid === locationid);
        for (const { sectionid, locationtype: secLocationtype } of locSections) {
          await runTest("v3-section", "section", citycode, locationid, sectionid, secLocationtype);
          await runTest("v3-places", "section", citycode, locationid, sectionid, secLocationtype);
        }
      }
    }

    const identical = results.filter((r) => r.status === "identical").length;
    const diff = results.filter((r) => r.status === "diff").length;
    const error = results.filter((r) => r.status === "error").length;

    console.log(`[FMS full-dataset] Done: ${results.length} tests, ${identical} identical, ${diff} diff, ${error} error`);

    const response: FullDatasetTestResponse = {
      results,
      summary: { total: results.length, identical, diff, error },
    };
    return res.status(200).json(response);
  } catch (err) {
    console.error("[FMS full-dataset] Error:", err);
    return res.status(500).json({
      message: err instanceof Error ? err.message : "Internal error",
    });
  }
}
