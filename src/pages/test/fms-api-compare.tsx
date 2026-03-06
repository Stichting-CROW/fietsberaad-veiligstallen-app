import React, { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import Autocomplete from "@mui/material/Autocomplete";
import TextField from "@mui/material/TextField";
import { diff } from "deep-object-diff";
import { userHasRight } from "~/types/utils";
import { VSSecurityTopic } from "~/types/securityprofile";
import { EndpointComparisonTable, type EndpointDef } from "~/components/beheer/test/EndpointComparisonTable";
import { prepareForCompare, applyBiketypeSortForCitycode7300, V3_ENDPOINTS_WITH_BIKETYPES } from "~/server/utils/fms-compare";

/** Returns { oldOnly, newOnly } with only differing paths. Uses deep-object-diff: diff(a,b) = values from b that differ from a. */
function getDiffOnly(oldJson: string, newJson: string): { oldOnly: string; newOnly: string } | null {
  try {
    const oldObj = JSON.parse(oldJson) as object;
    const newObj = JSON.parse(newJson) as object;
    const newDiff = diff(oldObj, newObj);
    const oldDiff = diff(newObj, oldObj);
    const newKeys = Object.keys(newDiff);
    const oldKeys = Object.keys(oldDiff);
    if (newKeys.length === 0 && oldKeys.length === 0) {
      return { oldOnly: "{}", newOnly: "{}" };
    }
    return {
      oldOnly: JSON.stringify(oldDiff, null, 2),
      newOnly: JSON.stringify(newDiff, null, 2),
    };
  } catch {
    return null;
  }
}

const OLD_API_BASE = "https://remote.veiligstallen.nl";
// Endpoints aligned with ColdFusion REST (remote/REST/FMSService.cfc) and V3 (fms_service.cfc).
// Old V2: REST/v1/ uses getBikeTypes, getPaymentTypes, getClientTypes, getServerTime (not getJson*).
// getJsonBikeType/{id} omitted: not in REST API; new API matches old.
const ENDPOINTS: { id: string; label: string; path: string; params: string[]; oldPath?: string }[] = [
  { id: "v2-getServerTime", label: "V2 getServerTime", path: "/v2/getServerTime", params: [], oldPath: "/REST/v1/getServerTime" },
  { id: "v2-getJsonBikeTypes", label: "V2 getJsonBikeTypes", path: "/v2/getJsonBikeTypes", params: [], oldPath: "/REST/v1/getBikeTypes" },
  { id: "v2-getJsonPaymentTypes", label: "V2 getJsonPaymentTypes", path: "/v2/getJsonPaymentTypes", params: [], oldPath: "/REST/v1/getPaymentTypes" },
  { id: "v2-getJsonClientTypes", label: "V2 getJsonClientTypes", path: "/v2/getJsonClientTypes", params: [], oldPath: "/REST/v1/getClientTypes" },
  { id: "v3-citycodes", label: "V3 citycodes", path: "/rest/v3/citycodes", params: [] },
  { id: "v3-citycode", label: "V3 citycodes/{citycode}", path: "/rest/v3/citycodes", params: ["citycode"] },
  { id: "v3-locations", label: "V3 citycodes/{citycode}/locations", path: "/rest/v3/citycodes", params: ["citycode"] },
  { id: "v3-location", label: "V3 locations/{locationid}", path: "/rest/v3/citycodes", params: ["citycode", "locationid"] },
  { id: "v3-sections", label: "V3 locations/{locationid}/sections", path: "/rest/v3/citycodes", params: ["citycode", "locationid"] },
  { id: "v3-section", label: "V3 sections/{sectionid}", path: "/rest/v3/citycodes", params: ["citycode", "locationid", "sectionid"] },
  { id: "v3-places", label: "V3 sections/{sectionid}/places", path: "/rest/v3/citycodes", params: ["citycode", "locationid", "sectionid"] },
  { id: "v3-subscriptiontypes", label: "V3 locations/{locationid}/subscriptiontypes", path: "/rest/v3/citycodes", params: ["citycode", "locationid"] },
];

const GLOBAL_ENDPOINTS = ENDPOINTS.filter((e) => e.id.startsWith("v2-") || e.id === "v3-citycodes") as EndpointDef[];
const LOCATION_ENDPOINTS = ENDPOINTS.filter((e) => !GLOBAL_ENDPOINTS.includes(e)) as EndpointDef[];

/** Old API fails for non-numeric citycode (ColdFusion citycode type=numeric). These endpoints are skipped. */
const ENDPOINTS_OLD_API_FAILS_NON_NUMERIC: string[] = [
  "v3-location",
  "v3-sections",
  "v3-section",
  "v3-places",
  "v3-subscriptiontypes",
];

function isSkippedForNonNumericCitycode(citycode: string, endpointId: string): boolean {
  if (!citycode || /^\d+$/.test(citycode)) return false;
  return ENDPOINTS_OLD_API_FAILS_NON_NUMERIC.includes(endpointId);
}

function buildFullDatasetTestId(
  type: "city" | "location" | "section",
  citycode: string,
  locationid?: string,
  sectionid?: string,
  endpointId?: string
): string {
  return `${type}-${citycode}${locationid ? `-${locationid}` : ""}${sectionid ? `-${sectionid}` : ""}${endpointId ? `-${endpointId}` : ""}`;
}

function getTypeForEndpoint(endpointId: string): "city" | "location" | "section" {
  if (endpointId === "v3-citycode" || endpointId === "v3-locations") return "city";
  if (endpointId === "v3-section" || endpointId === "v3-places") return "section";
  return "location";
}

const STORAGE_KEY = "fms-api-compare-params";
const STORAGE_KEY_URLS = "fms-api-compare-urls";
const STORAGE_KEY_FULL_DATASET = "fms-api-compare-full-dataset";
const STORAGE_KEY_SETTINGS = "fms-api-compare-settings";

const DEFAULT_PARAMS: Record<string, string> = {
  citycode: "9933",
  locationid: "9933_001",
  sectionid: "9933_001_1",
  depth: "3",
};

function loadStoredParams(): Record<string, string> {
  if (typeof window === "undefined") return { ...DEFAULT_PARAMS };
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as Record<string, string>;
      return { ...DEFAULT_PARAMS, ...parsed };
    }
  } catch {
    /* ignore */
  }
  return { ...DEFAULT_PARAMS };
}

type CompareSettings = { allowDynamicDiffs: boolean; maxverschil: number; showStallingNames: boolean };

function loadStoredSettings(): CompareSettings {
  if (typeof window === "undefined") return { allowDynamicDiffs: false, maxverschil: 1, showStallingNames: true };
  try {
    const stored = localStorage.getItem(STORAGE_KEY_SETTINGS);
    if (stored) {
      const parsed = JSON.parse(stored) as Partial<CompareSettings>;
      return {
        allowDynamicDiffs: parsed.allowDynamicDiffs ?? false,
        maxverschil: typeof parsed.maxverschil === "number" ? parsed.maxverschil : 1,
        showStallingNames: parsed.showStallingNames ?? true,
      };
    }
  } catch {
    /* ignore */
  }
  return { allowDynamicDiffs: false, maxverschil: 1, showStallingNames: true };
}

function loadStoredUrls(): { oldApiUrl: string; newApiUrl: string } {
  if (typeof window === "undefined") return { oldApiUrl: OLD_API_BASE, newApiUrl: "" };
  try {
    const stored = localStorage.getItem(STORAGE_KEY_URLS);
    if (stored) {
      const parsed = JSON.parse(stored) as { oldApiUrl?: string; newApiUrl?: string };
      return {
        oldApiUrl: parsed.oldApiUrl ?? OLD_API_BASE,
        newApiUrl: parsed.newApiUrl ?? "",
      };
    }
  } catch {
    /* ignore */
  }
  return { oldApiUrl: OLD_API_BASE, newApiUrl: "" };
}

type FullDatasetTestResult = {
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


type FullDatasetTestResponse = {
  results: FullDatasetTestResult[];
  summary: { total: number; identical: number; diff: number; error: number; skipped: number; uitzonderingBiketypeidSortering: number };
};

function loadStoredFullDataset(): FullDatasetTestResponse | null {
  if (typeof window === "undefined") return null;
  try {
    const stored = localStorage.getItem(STORAGE_KEY_FULL_DATASET);
    if (stored) return JSON.parse(stored) as FullDatasetTestResponse;
  } catch {
    /* ignore */
  }
  return null;
}

function saveFullDatasetToStorage(data: FullDatasetTestResponse) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY_FULL_DATASET, JSON.stringify(data));
  } catch {
    /* ignore */
  }
}

/** True if all params required by the endpoint have non-empty values. When false, URL builders return "" or wrong paths. */
function hasRequiredParams(endpoint: (typeof ENDPOINTS)[0], params: Record<string, string>): boolean {
  return endpoint.params.every((p) => (params[p] ?? "").trim().length > 0);
}

function appendDepthParam(url: string, depth: string, endpointId: string): string {
  if (!url) return url; // Avoid returning "?depth=3" when url is empty (causes fetch to fail in Node)
  if (!endpointId.startsWith("v3-")) return url;
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}depth=${encodeURIComponent(depth)}`;
}

function getOldUrl(endpoint: typeof ENDPOINTS[0], paramValues: Record<string, string>, oldApiBase: string): string {
  let url: string;
  if (paramValues.citycode && endpoint.params.includes("citycode")) {
    let path = `/rest/v3/citycodes/${paramValues.citycode}`;
    if (endpoint.id === "v3-citycode") url = `${oldApiBase}${path}`;
    else if (endpoint.id === "v3-locations") url = `${oldApiBase}${path}/locations`;
    else if (paramValues.locationid) {
      path += `/locations/${paramValues.locationid}`;
      if (endpoint.id === "v3-subscriptiontypes") url = `${oldApiBase}${path}/subscriptiontypes`;
      else if (endpoint.id === "v3-sections") url = `${oldApiBase}${path}/sections`;
      else if (endpoint.id === "v3-location") url = `${oldApiBase}${path}`;
      else if (paramValues.sectionid) {
        path += `/sections/${paramValues.sectionid}`;
        if (endpoint.id === "v3-places") url = `${oldApiBase}${path}/places`;
        else if (endpoint.id === "v3-section") url = `${oldApiBase}${path}`;
        else url = "";
      } else url = "";
    } else url = "";
  } else if (endpoint.id === "v3-citycodes") {
    url = `${oldApiBase}/rest/v3/citycodes`;
  } else {
    const path = "oldPath" in endpoint && endpoint.oldPath ? endpoint.oldPath : endpoint.path;
    url = `${oldApiBase}${path}`;
  }
  return appendDepthParam(url, paramValues.depth ?? "3", endpoint.id);
}

function getNewUrl(endpoint: typeof ENDPOINTS[0], paramValues: Record<string, string>, baseNew: string): string {
  const base = "/api/fms";
  let url: string;
  if (endpoint.id.startsWith("v2-")) {
    const method = endpoint.path.split("/").pop() ?? "";
    url = `${baseNew}${base}/v2/${method}`;
  } else if (endpoint.id.startsWith("v3-")) {
    if (endpoint.id === "v3-citycodes") url = `${baseNew}${base}/v3/citycodes`;
    else if (!paramValues.citycode) url = `${baseNew}${base}/v3/citycodes`;
    else {
      let p = `${baseNew}${base}/v3/citycodes/${paramValues.citycode}`;
      if (endpoint.id === "v3-citycode") url = p;
      else if (endpoint.id === "v3-locations") url = `${p}/locations`;
      else if (paramValues.locationid) {
        p += `/locations/${paramValues.locationid}`;
        if (endpoint.id === "v3-location") url = p;
        else if (endpoint.id === "v3-subscriptiontypes") url = `${p}/subscriptiontypes`;
        else if (endpoint.id === "v3-sections") url = `${p}/sections`;
        else if ((endpoint.id === "v3-places" || endpoint.id === "v3-section") && paramValues.sectionid) {
          p += `/sections/${paramValues.sectionid}`;
          if (endpoint.id === "v3-section") url = p;
          else url = `${p}/places`;
        } else if (endpoint.id === "v3-places" || endpoint.id === "v3-section") url = "";
        else url = p;
      } else if (endpoint.id === "v3-location" || endpoint.id === "v3-sections" || endpoint.id === "v3-subscriptiontypes") url = "";
      else url = p;
    }
  } else {
    return "";
  }
  return appendDepthParam(url, paramValues.depth ?? "3", endpoint.id);
}

function canonicalJson(obj: unknown): string {
  if (obj === null || typeof obj !== "object") return JSON.stringify(obj);
  if (Array.isArray(obj)) return "[" + obj.map(canonicalJson).join(",") + "]";
  const keys = Object.keys(obj as object).sort();
  return "{" + keys.map((k) => JSON.stringify(k) + ":" + canonicalJson((obj as Record<string, unknown>)[k])).join(",") + "}";
}

function responsesIdentical(oldRes: string, newRes: string): boolean {
  try {
    const a = JSON.parse(oldRes);
    const b = JSON.parse(newRes);
    return canonicalJson(a) === canonicalJson(b);
  } catch {
    return oldRes.trim() === newRes.trim();
  }
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

/** Prepares responses and returns status + strings for display. For V3 biketype endpoints, sorts biketypes first; if identical then status is uitzondering-biketypeid-sortering (all stallingen). */
function getCompareStatus(
  endpointId: string,
  oldRes: string,
  newRes: string,
  citycode: string,
  prepareOptions: { allowDynamicDiffs: boolean; maxverschil: number }
): { status: "identical" | "diff" | "uitzondering-biketypeid-sortering"; oldForDisplay: string; newForDisplay: string } {
  const { old: afterBiketypeSort, new: afterBiketypeSortNew } = applyBiketypeSortForCitycode7300(
    oldRes,
    newRes,
    citycode,
    endpointId
  );
  const isBiketypeEndpoint = (V3_ENDPOINTS_WITH_BIKETYPES as readonly string[]).includes(endpointId);
  const { old: oldForCompare, new: newForCompare } = prepareForCompare(afterBiketypeSort, afterBiketypeSortNew, prepareOptions);
  const identical = responsesMatch(endpointId, oldForCompare, newForCompare);
  let status: "identical" | "diff" | "uitzondering-biketypeid-sortering";
  if (identical && isBiketypeEndpoint) status = "uitzondering-biketypeid-sortering";
  else status = identical ? "identical" : "diff";
  const oldForDisplay = (() => {
    try {
      return JSON.stringify(JSON.parse(oldForCompare), null, 2);
    } catch {
      return oldForCompare;
    }
  })();
  const newForDisplay = (() => {
    try {
      return JSON.stringify(JSON.parse(newForCompare), null, 2);
    } catch {
      return newForCompare;
    }
  })();
  return { status, oldForDisplay, newForDisplay };
}

function responsesMatch(endpointId: string, oldRes: string, newRes: string): boolean {
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
  return responsesIdentical(oldRes, newRes);
}

type RowStatus = "pending" | "loading" | "identical" | "diff" | "error" | "skipped" | "uitzondering-biketypeid-sortering";

type OptionItem = { value: string; label: string };

const FmsApiComparePage: React.FC = () => {
  const { data: session } = useSession();
  const [paramValues, setParamValues] = useState<Record<string, string>>(loadStoredParams);
  const [oldApiUrl, setOldApiUrl] = useState(() => loadStoredUrls().oldApiUrl);
  const [newApiUrl, setNewApiUrl] = useState(() => loadStoredUrls().newApiUrl);

  const [cityOptions, setCityOptions] = useState<OptionItem[]>([]);
  const [locationOptions, setLocationOptions] = useState<OptionItem[]>([]);
  const [sectionOptions, setSectionOptions] = useState<OptionItem[]>([]);
  const [optionsLoading, setOptionsLoading] = useState({ city: false, location: false, section: false });
  /** Maps citycode (ZipID) → SiteID for fetching locations */
  const [cityCodeToSiteId, setCityCodeToSiteId] = useState<Record<string, string>>({});
  /** Maps locationid (StallingsID) → internal fietsenstalling ID for fetching sections */
  const [locationIdToInternalId, setLocationIdToInternalId] = useState<Record<string, string>>({});
  /** Pre-loaded: key "citycode-locationid" → "Title (StallingsID)" for all cities */
  const [allLocationLabels, setAllLocationLabels] = useState<Record<string, string>>({});
  /** Pre-loaded: citycode → OptionItem[] for Locatie-specifieke tab */
  const [allLocationOptionsByCity, setAllLocationOptionsByCity] = useState<Record<string, OptionItem[]>>({});
  const [dataLoading, setDataLoading] = useState(true);

  const apiBase = typeof window !== "undefined" ? (newApiUrl || window.location.origin) : "";

  // Load cities + all locations on page load (re-used across tabs)
  useEffect(() => {
    if (typeof window === "undefined") return;
    setDataLoading(true);
    fetch("/api/protected/gemeenten")
      .then((r) => (r.ok ? r.json() : { data: [] }))
      .then((res: { data?: Array<{ ID?: string; ZipID?: string; CompanyName?: string | null; fietsenstallingen_fietsenstallingen_SiteIDTocontacts?: unknown[] }> }) => {
        const list = res.data ?? [];
        const withStallingen = list.filter(
          (g) => g.ZipID && (g.fietsenstallingen_fietsenstallingen_SiteIDTocontacts?.length ?? 0) > 0
        );
        const opts: OptionItem[] = withStallingen
          .map((c) => ({
            value: c.ZipID ?? "",
            label: c.CompanyName ? `${c.CompanyName} (${c.ZipID})` : (c.ZipID ?? ""),
          }))
          .filter((o) => o.value)
          .sort((a, b) => a.label.localeCompare(b.label));
        const cityCodeToSiteIdMap: Record<string, string> = {};
        for (const g of withStallingen) {
          if (g.ZipID && g.ID) cityCodeToSiteIdMap[g.ZipID] = g.ID;
        }
        setCityOptions(opts);
        setCityCodeToSiteId(cityCodeToSiteIdMap);

        const siteIds = Object.values(cityCodeToSiteIdMap);
        if (siteIds.length === 0) {
          setAllLocationLabels({});
          setAllLocationOptionsByCity({});
          setDataLoading(false);
          return;
        }

        const labelsMap: Record<string, string> = {};
        const optionsByCity: Record<string, OptionItem[]> = {};
        const idToInternal: Record<string, string> = {};

        return Promise.all(
          siteIds.map((siteId) =>
            fetch(`/api/protected/fietsenstallingen?GemeenteID=${encodeURIComponent(siteId)}`)
              .then((r) => (r.ok ? r.json() : { data: [] }))
              .then((res: { data?: Array<{ ID?: string; StallingsID?: string; Title?: string | null }> }) => {
                const locList = res.data ?? [];
                const citycode = Object.entries(cityCodeToSiteIdMap).find(([, id]) => id === siteId)?.[0];
                if (!citycode) return;
                const optsForCity: OptionItem[] = locList
                  .filter((f) => f.StallingsID)
                  .map((l) => {
                    if (l.ID && l.StallingsID) idToInternal[l.StallingsID] = l.ID;
                    const label = l.Title ? `${l.Title} (${l.StallingsID})` : (l.StallingsID ?? "");
                    if (l.StallingsID) labelsMap[`${citycode}-${l.StallingsID}`] = label;
                    return { value: l.StallingsID ?? "", label };
                  })
                  .filter((o) => o.value)
                  .sort((a, b) => a.label.localeCompare(b.label));
                optionsByCity[citycode] = optsForCity;
              })
          )
        ).then(() => {
          setAllLocationLabels(labelsMap);
          setAllLocationOptionsByCity(optionsByCity);
          setLocationIdToInternalId(idToInternal);
        });
      })
      .catch(() => {
        setCityOptions([]);
        setCityCodeToSiteId({});
        setAllLocationLabels({});
        setAllLocationOptionsByCity({});
      })
      .finally(() => setDataLoading(false));
  }, []);

  // Derive locationOptions from pre-loaded data when city changes
  useEffect(() => {
    const cc = paramValues.citycode;
    if (!cc) {
      setLocationOptions([]);
      return;
    }
    const opts = allLocationOptionsByCity[cc ?? ""] ?? [];
    setLocationOptions(opts);
    if (opts.length > 0) {
      setParamValues((p) => (p.locationid === "" ? { ...p, locationid: opts[0]!.value, sectionid: "" } : p));
    }
  }, [paramValues.citycode, allLocationOptionsByCity]);

  // Sections: /api/protected/fietsenstallingen/secties/all?fietsenstallingId=internalId
  useEffect(() => {
    const lid = paramValues.locationid;
    const internalId = locationIdToInternalId[lid ?? ""];
    if (!internalId || !lid) {
      setSectionOptions([]);
      setOptionsLoading((o) => ({ ...o, section: false }));
      return;
    }
    setOptionsLoading((o) => ({ ...o, section: true }));
    fetch(`/api/protected/fietsenstallingen/secties/all?fietsenstallingId=${encodeURIComponent(internalId)}`)
      .then((r) => (r.ok ? r.json() : { data: [] }))
      .then((res: { data?: Array<{ externalId?: string | null; titel?: string }> }) => {
        const list = res.data ?? [];
        const opts: OptionItem[] = list
          .filter((s) => s.externalId)
          .map((s) => ({
            value: s.externalId ?? "",
            label: s.titel ? `${s.titel} (${s.externalId})` : (s.externalId ?? ""),
          }))
          .filter((o) => o.value);
        setSectionOptions(opts);
        if (opts.length > 0) {
          setParamValues((p) =>
            p.sectionid === "" ? { ...p, sectionid: opts[0]!.value } : p
          );
        }
      })
      .catch(() => setSectionOptions([]))
      .finally(() => setOptionsLoading((o) => ({ ...o, section: false })));
  }, [paramValues.locationid, locationIdToInternalId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(paramValues));
    } catch {
      /* ignore */
    }
  }, [paramValues]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem(STORAGE_KEY_URLS, JSON.stringify({ oldApiUrl, newApiUrl }));
    } catch {
      /* ignore */
    }
  }, [oldApiUrl, newApiUrl]);

  const [rowStatus, setRowStatus] = useState<Record<string, RowStatus>>({});
  const [rowError, setRowError] = useState<Record<string, string>>({});
  const [rowResults, setRowResults] = useState<Record<string, { old: string; new: string }>>({});
  const [rowTiming, setRowTiming] = useState<Record<string, { oldSeconds: number; newSeconds: number }>>({});
  const [rowExpanded, setRowExpanded] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const locationIds = LOCATION_ENDPOINTS.map((e) => e.id);
    setRowStatus((s) => {
      const next = { ...s };
      for (const id of locationIds) delete next[id];
      return next;
    });
    setRowError((e) => {
      const next = { ...e };
      for (const id of locationIds) delete next[id];
      return next;
    });
    setRowResults((r) => {
      const next = { ...r };
      for (const id of locationIds) delete next[id];
      return next;
    });
    setRowTiming((t) => {
      const next = { ...t };
      for (const id of locationIds) delete next[id];
      return next;
    });
    setRowExpanded((x) => {
      const next = { ...x };
      for (const id of locationIds) delete next[id];
      return next;
    });
  }, [paramValues.depth]);
  const [showOnlyDifferences, setShowOnlyDifferences] = useState(true);
  const [fullDatasetLoading, setFullDatasetLoading] = useState(false);
  const [fullDatasetResults, setFullDatasetResults] = useState<FullDatasetTestResponse | null>(() => loadStoredFullDataset());
  const [showOnlyFailedFullDataset, setShowOnlyFailedFullDataset] = useState(true);
  const [fullDatasetLocationtypeFilter, setFullDatasetLocationtypeFilter] = useState("");
  const [activeTab, setActiveTab] = useState<"algemeen" | "specifiek" | "geautomatiseerd" | "instellingen">("algemeen");
  const [allowDynamicDiffs, setAllowDynamicDiffs] = useState(() => loadStoredSettings().allowDynamicDiffs);
  const [maxverschil, setMaxverschil] = useState(() => loadStoredSettings().maxverschil);
  const [showStallingNames, setShowStallingNames] = useState(() => loadStoredSettings().showStallingNames);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem(
        STORAGE_KEY_SETTINGS,
        JSON.stringify({ allowDynamicDiffs, maxverschil, showStallingNames })
      );
    } catch {
      /* ignore */
    }
  }, [allowDynamicDiffs, maxverschil, showStallingNames]);

  /** Geautomatiseerd tab: depth (separate from other tabs) */
  const [fullDatasetDepth, setFullDatasetDepth] = useState("3");
  /** Geautomatiseerd tab: "Alle Data-eigenaren" (default) or citycode for single data-owner */
  const [fullDatasetScope, setFullDatasetScope] = useState("");
  /** Geautomatiseerd tab: row clicked in full-dataset table; shows comparison component for that test case */
  const [selectedFullDatasetRow, setSelectedFullDatasetRow] = useState<FullDatasetTestResult | null>(null);
  /** Geautomatiseerd tab: comparison state for the selected row (separate from Locatie-specifieke tab) */
  const [autoCompareParamValues, setAutoCompareParamValues] = useState<Record<string, string>>({});
  const [autoCompareRowStatus, setAutoCompareRowStatus] = useState<Record<string, RowStatus>>({});
  const [autoCompareRowError, setAutoCompareRowError] = useState<Record<string, string>>({});
  const [autoCompareRowResults, setAutoCompareRowResults] = useState<Record<string, { old: string; new: string }>>({});
  const [autoCompareRowTiming, setAutoCompareRowTiming] = useState<Record<string, { oldSeconds: number; newSeconds: number }>>({});
  const [autoCompareRowExpanded, setAutoCompareRowExpanded] = useState<Record<string, boolean>>({});
  const [autoCompareLoading, setAutoCompareLoading] = useState(false);

  const prevFullDatasetDepthRef = useRef<string | null>(null);
  useEffect(() => {
    if (prevFullDatasetDepthRef.current === null) {
      prevFullDatasetDepthRef.current = fullDatasetDepth;
      return;
    }
    if (prevFullDatasetDepthRef.current === fullDatasetDepth) return;
    prevFullDatasetDepthRef.current = fullDatasetDepth;
    setFullDatasetResults(null);
    setSelectedFullDatasetRow(null);
    setAutoCompareParamValues({});
    setAutoCompareRowStatus({});
    setAutoCompareRowError({});
    setAutoCompareRowResults({});
    setAutoCompareRowTiming({});
    setAutoCompareRowExpanded({});
    if (typeof window !== "undefined") {
      try {
        localStorage.removeItem(STORAGE_KEY_FULL_DATASET);
      } catch {
        /* ignore */
      }
    }
  }, [fullDatasetDepth]);

  const hasAccess = userHasRight(session?.user?.securityProfile, VSSecurityTopic.fietsberaad_superadmin);

  const [authUsername, setAuthUsername] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [credentialsFromApi, setCredentialsFromApi] = useState(false);
  const useAuth = !!(authUsername && authPassword);

  useEffect(() => {
    if (hasAccess && session) {
      fetch("/api/protected/fms-test-credentials")
        .then((r) => (r.ok ? r.json() : { username: "", password: "" }))
        .then((data: { username?: string; password?: string }) => {
          if (data.username && data.password) {
            setAuthUsername(data.username);
            setAuthPassword(data.password);
            setCredentialsFromApi(true);
          }
        })
        .catch(() => {});
    }
  }, [hasAccess, session]);

  const handleCompareAll = async (
    overrideParams?: Record<string, string>,
    endpointsSubset?: typeof ENDPOINTS
  ) => {
    const params = overrideParams ?? paramValues;
    const endpoints = endpointsSubset ?? ENDPOINTS;
    const baseNew = newApiUrl || (typeof window !== "undefined" ? window.location.origin : "");
    setLoading(true);
    if (endpointsSubset) {
      const loadingStatus: Record<string, RowStatus> = {};
      for (const e of endpoints) loadingStatus[e.id] = "loading";
      setRowStatus((s) => ({ ...s, ...loadingStatus }));
      setRowError((err) => {
        const next = { ...err };
        for (const e of endpoints) delete next[e.id];
        return next;
      });
      setRowResults((r) => {
        const next = { ...r };
        for (const e of endpoints) delete next[e.id];
        return next;
      });
      setRowTiming((t) => {
        const next = { ...t };
        for (const e of endpoints) delete next[e.id];
        return next;
      });
    } else {
      setRowStatus({});
      setRowError({});
      setRowResults({});
      setRowTiming({});
    }

    const body: { useApiCredentials?: boolean; authorizationHeader?: string } = {};
    if (credentialsFromApi && useAuth) {
      body.useApiCredentials = true;
    } else if (useAuth) {
      body.authorizationHeader = `Basic ${btoa(`${authUsername}:${authPassword}`)}`;
    }

    const citycode = params.citycode ?? "";
    for (const endpoint of endpoints) {
      if (isSkippedForNonNumericCitycode(citycode, endpoint.id)) {
        setRowStatus((s) => ({ ...s, [endpoint.id]: "skipped" }));
        setRowError((e) => ({ ...e, [endpoint.id]: "Overgeslagen (non-numeric citycode)" }));
        continue;
      }
      setRowStatus((s) => ({ ...s, [endpoint.id]: "loading" }));
      if (!hasRequiredParams(endpoint, params)) {
        setRowStatus((s) => ({ ...s, [endpoint.id]: "identical" }));
        setRowResults((r) => ({ ...r, [endpoint.id]: { old: "[]", new: "[]" } }));
        setRowExpanded((x) => ({ ...x, [endpoint.id]: false }));
        continue;
      }
      const oldUrl = getOldUrl(endpoint, params, oldApiUrl);
      const newUrl = getNewUrl(endpoint, params, baseNew);

      try {
        const res = await fetch("/api/protected/fms-api-compare", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...body, oldUrl, newUrl }),
        });
        const data = await res.json();
        const { oldError, newError } = data as { oldError?: string; newError?: string };
        const hasFetchError = !!oldError || !!newError;

        if (!res.ok) {
          const parts: string[] = [];
          if (oldError) parts.push(`Oude API: ${oldError}`);
          if (newError) parts.push(`Nieuwe API: ${newError}`);
          setRowStatus((s) => ({ ...s, [endpoint.id]: "error" }));
          setRowError((e) => ({ ...e, [endpoint.id]: parts.length > 0 ? parts.join("; ") : data.message ?? "Request failed" }));
          continue;
        }
        if (hasFetchError) {
          const parts: string[] = [];
          if (oldError) parts.push(`Oude API: ${oldError}`);
          if (newError) parts.push(`Nieuwe API: ${newError}`);
          setRowStatus((s) => ({ ...s, [endpoint.id]: "error" }));
          setRowError((e) => ({ ...e, [endpoint.id]: parts.join("; ") }));
          const formatResult = (s: string) => {
            try {
              return JSON.stringify(JSON.parse(s), null, 2);
            } catch {
              return s;
            }
          };
          setRowResults((r) => ({
            ...r,
            [endpoint.id]: {
              old: oldError ? `[Fout Oude API: ${oldError}]` : formatResult(data.oldResult ?? ""),
              new: newError ? `[Fout Nieuwe API: ${newError}]` : formatResult(data.newResult ?? ""),
            },
          }));
          if (data.oldDurationSeconds != null || data.newDurationSeconds != null) {
            setRowTiming((t) => ({
              ...t,
              [endpoint.id]: {
                oldSeconds: data.oldDurationSeconds ?? 0,
                newSeconds: data.newDurationSeconds ?? 0,
              },
            }));
          }
          setRowExpanded((x) => ({ ...x, [endpoint.id]: false }));
          continue;
        }

        const { oldResult: oldRes, newResult: newRes, oldDurationSeconds, newDurationSeconds } = data as {
          oldResult: string;
          newResult: string;
          oldDurationSeconds?: number;
          newDurationSeconds?: number;
        };
        if (oldDurationSeconds != null && newDurationSeconds != null) {
          setRowTiming((t) => ({ ...t, [endpoint.id]: { oldSeconds: oldDurationSeconds, newSeconds: newDurationSeconds } }));
        }
        const citycode = paramValues.citycode ?? "";
        const { status, oldForDisplay, newForDisplay } = getCompareStatus(endpoint.id, oldRes, newRes, citycode, {
          allowDynamicDiffs,
          maxverschil: allowDynamicDiffs ? maxverschil : 0,
        });
        setRowStatus((s) => ({ ...s, [endpoint.id]: status }));
        setRowResults((r) => ({ ...r, [endpoint.id]: { old: oldForDisplay, new: newForDisplay } }));
        setRowExpanded((x) => ({ ...x, [endpoint.id]: false }));
      } catch (err) {
        setRowStatus((s) => ({ ...s, [endpoint.id]: "error" }));
        setRowError((e) => ({ ...e, [endpoint.id]: err instanceof Error ? err.message : "Fetch failed" }));
        setRowExpanded((x) => ({ ...x, [endpoint.id]: false }));
      }
    }
    setLoading(false);
  };

  const handleFullDatasetTest = async (citycodeFilter?: string) => {
    setFullDatasetLoading(true);
    setFullDatasetResults(null);
    const body: {
      useApiCredentials?: boolean;
      authorizationHeader?: string;
      oldApiUrl?: string;
      newApiUrl?: string;
      depth?: string;
      citycode?: string;
      allowDynamicDiffs?: boolean;
      maxverschil?: number;
    } = {
      oldApiUrl: oldApiUrl || OLD_API_BASE,
      newApiUrl: newApiUrl || (typeof window !== "undefined" ? window.location.origin : ""),
      depth: fullDatasetDepth ?? "3",
      ...(citycodeFilter && { citycode: citycodeFilter }),
      allowDynamicDiffs,
      maxverschil,
    };
    if (credentialsFromApi && useAuth) {
      body.useApiCredentials = true;
    } else if (useAuth) {
      body.authorizationHeader = `Basic ${btoa(`${authUsername}:${authPassword}`)}`;
    }
    try {
      const res = await fetch("/api/protected/fms-api-compare-full-dataset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as FullDatasetTestResponse & { message?: string };
      if (!res.ok) {
        throw new Error(data.message ?? "Request failed");
      }
      setFullDatasetResults(data);
      saveFullDatasetToStorage(data);
    } catch (err) {
      setFullDatasetResults({
        results: [],
        summary: { total: 0, identical: 0, diff: 0, error: 1, skipped: 0, uitzonderingBiketypeidSortering: 0 },
      });
      console.error("Full dataset test failed:", err);
    } finally {
      setFullDatasetLoading(false);
    }
  };

  const updateFullDatasetRowStatus = useCallback(
    (endpointId: string, status: "identical" | "diff" | "error" | "skipped" | "uitzondering-biketypeid-sortering", error?: string, paramsOverride?: Record<string, string>) => {
      const params = paramsOverride ?? autoCompareParamValues;
      const type = getTypeForEndpoint(endpointId);
      const citycode = params.citycode ?? "";
      const locationid = type === "location" || type === "section" ? (params.locationid ?? "") : undefined;
      const sectionid = type === "section" ? (params.sectionid ?? "") : undefined;

      const matchesRow = (row: FullDatasetTestResult) => {
        if (row.endpointId !== endpointId || row.citycode !== citycode) return false;
        if (type === "city") return row.type === "city";
        if (type === "location") return row.type === "location" && (row.locationid ?? "") === (locationid ?? "");
        return row.type === "section" && (row.locationid ?? "") === (locationid ?? "") && (row.sectionid ?? "") === (sectionid ?? "");
      };

      setFullDatasetResults((prev) => {
        if (!prev) return prev;
        const next = prev.results.map((row) =>
          matchesRow(row) ? { ...row, status, ...(error && { error }) } : row
        );
        const identical = next.filter((r) => r.status === "identical").length;
        const uitzonderingBiketypeidSortering = next.filter((r) => r.status === "uitzondering-biketypeid-sortering").length;
        const diff = next.filter((r) => r.status === "diff").length;
        const err = next.filter((r) => r.status === "error").length;
        const skipped = next.filter((r) => r.status === "skipped").length;
        const updated = {
          results: next,
          summary: { total: next.length, identical, diff, error: err, skipped, uitzonderingBiketypeidSortering },
        };
        saveFullDatasetToStorage(updated);
        return updated;
      });
    },
    [autoCompareParamValues]
  );

  const updateRowStatusByTestId = useCallback((testId: string, status: "identical" | "diff" | "error" | "skipped" | "uitzondering-biketypeid-sortering", error?: string) => {
    setFullDatasetResults((prev) => {
      if (!prev) return prev;
      const next = prev.results.map((row) =>
        row.testId === testId ? { ...row, status, ...(error && { error }) } : row
      );
      const identical = next.filter((r) => r.status === "identical").length;
      const uitzonderingBiketypeidSortering = next.filter((r) => r.status === "uitzondering-biketypeid-sortering").length;
      const diff = next.filter((r) => r.status === "diff").length;
      const err = next.filter((r) => r.status === "error").length;
      const skipped = next.filter((r) => r.status === "skipped").length;
      const updated = {
        results: next,
        summary: { total: next.length, identical, diff, error: err, skipped, uitzonderingBiketypeidSortering },
      };
      saveFullDatasetToStorage(updated);
      return updated;
    });
  }, []);

  const handleFullDatasetRowClick = (r: FullDatasetTestResult) => {
    const results = fullDatasetResults?.results ?? [];
    let locationid = r.locationid;
    let sectionid = r.sectionid;
    if (r.type === "city" && !locationid) {
      const firstLoc = results.find((x) => x.citycode === r.citycode && x.locationid);
      locationid = firstLoc?.locationid;
    }
    if ((r.type === "city" || r.type === "location") && !sectionid && locationid) {
      const firstSec = results.find(
        (x) => x.citycode === r.citycode && x.locationid === locationid && x.sectionid
      );
      sectionid = firstSec?.sectionid;
    }
    const newParams = {
      ...paramValues,
      citycode: r.citycode,
      locationid: locationid ?? "",
      sectionid: sectionid ?? "",
      depth: fullDatasetDepth ?? "3",
    };
    setSelectedFullDatasetRow(r);
    setAutoCompareParamValues(newParams);
    setAutoCompareRowStatus({});
    setAutoCompareRowError({});
    setAutoCompareRowResults({});
    setAutoCompareRowTiming({});
    setAutoCompareRowExpanded({});
    void handleAutoCompareAll(newParams);
  };

  const handleAutoCompareAll = async (params: Record<string, string>) => {
    const baseNew = newApiUrl || (typeof window !== "undefined" ? window.location.origin : "");
    setAutoCompareLoading(true);
    const loadingStatus: Record<string, RowStatus> = {};
    for (const e of LOCATION_ENDPOINTS) loadingStatus[e.id] = "loading";
    setAutoCompareRowStatus(loadingStatus);
    setAutoCompareRowError({});
    setAutoCompareRowResults({});
    setAutoCompareRowTiming({});

    const body: { useApiCredentials?: boolean; authorizationHeader?: string } = {};
    if (credentialsFromApi && useAuth) {
      body.useApiCredentials = true;
    } else if (useAuth) {
      body.authorizationHeader = `Basic ${btoa(`${authUsername}:${authPassword}`)}`;
    }

    const citycode = params.citycode ?? "";
    for (const endpoint of LOCATION_ENDPOINTS) {
      if (isSkippedForNonNumericCitycode(citycode, endpoint.id)) {
        setAutoCompareRowStatus((s) => ({ ...s, [endpoint.id]: "skipped" }));
        setAutoCompareRowError((e) => ({ ...e, [endpoint.id]: "Overgeslagen (non-numeric citycode)" }));
        updateFullDatasetRowStatus(endpoint.id, "skipped", undefined, params);
        continue;
      }
      if (!hasRequiredParams(endpoint, params)) {
        setAutoCompareRowStatus((s) => ({ ...s, [endpoint.id]: "identical" }));
        setAutoCompareRowResults((r) => ({ ...r, [endpoint.id]: { old: "[]", new: "[]" } }));
        setAutoCompareRowExpanded((x) => ({ ...x, [endpoint.id]: false }));
        updateFullDatasetRowStatus(endpoint.id, "identical", undefined, params);
        continue;
      }
      const oldUrl = getOldUrl(endpoint, params, oldApiUrl);
      const newUrl = getNewUrl(endpoint, params, baseNew);

      try {
        const res = await fetch("/api/protected/fms-api-compare", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...body, oldUrl, newUrl }),
        });
        const data = await res.json();
        const { oldError, newError } = data as { oldError?: string; newError?: string };
        const hasFetchError = !!oldError || !!newError;

        const parts = [oldError && `Oude API: ${oldError}`, newError && `Nieuwe API: ${newError}`].filter(Boolean);
        const errMsg = parts.join("; ");

        if (!res.ok) {
          setAutoCompareRowStatus((s) => ({ ...s, [endpoint.id]: "error" }));
          setAutoCompareRowError((e) => ({ ...e, [endpoint.id]: parts.length > 0 ? errMsg : data.message ?? "Request failed" }));
          updateFullDatasetRowStatus(endpoint.id, "error", errMsg, params);
          continue;
        }
        if (hasFetchError) {
          setAutoCompareRowStatus((s) => ({ ...s, [endpoint.id]: "error" }));
          setAutoCompareRowError((e) => ({ ...e, [endpoint.id]: errMsg }));
          const formatResult = (s: string) => {
            try {
              return JSON.stringify(JSON.parse(s), null, 2);
            } catch {
              return s;
            }
          };
          setAutoCompareRowResults((r) => ({
            ...r,
            [endpoint.id]: {
              old: oldError ? `[Fout Oude API: ${oldError}]` : formatResult(data.oldResult ?? ""),
              new: newError ? `[Fout Nieuwe API: ${newError}]` : formatResult(data.newResult ?? ""),
            },
          }));
          if (data.oldDurationSeconds != null || data.newDurationSeconds != null) {
            setAutoCompareRowTiming((t) => ({
              ...t,
              [endpoint.id]: {
                oldSeconds: data.oldDurationSeconds ?? 0,
                newSeconds: data.newDurationSeconds ?? 0,
              },
            }));
          }
          updateFullDatasetRowStatus(endpoint.id, "error", errMsg, params);
          continue;
        }

        const { oldResult: oldRes, newResult: newRes, oldDurationSeconds, newDurationSeconds } = data as {
          oldResult: string;
          newResult: string;
          oldDurationSeconds?: number;
          newDurationSeconds?: number;
        };
        if (oldDurationSeconds != null && newDurationSeconds != null) {
          setAutoCompareRowTiming((t) => ({ ...t, [endpoint.id]: { oldSeconds: oldDurationSeconds, newSeconds: newDurationSeconds } }));
        }
        const citycode = params.citycode ?? "";
        const { status, oldForDisplay, newForDisplay } = getCompareStatus(endpoint.id, oldRes, newRes, citycode, {
          allowDynamicDiffs,
          maxverschil: allowDynamicDiffs ? maxverschil : 0,
        });
        setAutoCompareRowStatus((s) => ({ ...s, [endpoint.id]: status }));
        setAutoCompareRowResults((r) => ({ ...r, [endpoint.id]: { old: oldForDisplay, new: newForDisplay } }));
        setAutoCompareRowExpanded((x) => ({ ...x, [endpoint.id]: false }));
        updateFullDatasetRowStatus(endpoint.id, status, undefined, params);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Fetch failed";
        setAutoCompareRowStatus((s) => ({ ...s, [endpoint.id]: "error" }));
        setAutoCompareRowError((e) => ({ ...e, [endpoint.id]: msg }));
        updateFullDatasetRowStatus(endpoint.id, "error", msg, params);
      }
    }
    setAutoCompareLoading(false);
  };

  const [checkFailedLoading, setCheckFailedLoading] = useState(false);

  const handleCheckFailedRows = async () => {
    const results = fullDatasetResults?.results ?? [];
    const failedRows = results.filter((r) => r.status === "diff" || r.status === "error");
    if (failedRows.length === 0) return;

    const baseNew = newApiUrl || (typeof window !== "undefined" ? window.location.origin : "");
    setCheckFailedLoading(true);

    const body: { useApiCredentials?: boolean; authorizationHeader?: string } = {};
    if (credentialsFromApi && useAuth) {
      body.useApiCredentials = true;
    } else if (useAuth) {
      body.authorizationHeader = `Basic ${btoa(`${authUsername}:${authPassword}`)}`;
    }

    for (const row of failedRows) {
      const endpoint = ENDPOINTS.find((e) => e.id === row.endpointId);
      if (!endpoint) continue;
      if (isSkippedForNonNumericCitycode(row.citycode, row.endpointId)) {
        updateRowStatusByTestId(row.testId, "skipped");
        continue;
      }

      const params: Record<string, string> = {
        citycode: row.citycode,
        locationid: row.locationid ?? "",
        sectionid: row.sectionid ?? "",
        depth: fullDatasetDepth ?? "3",
      };
      if (!hasRequiredParams(endpoint, params)) {
        updateRowStatusByTestId(row.testId, "identical");
        continue;
      }
      const oldUrl = getOldUrl(endpoint, params, oldApiUrl);
      const newUrl = getNewUrl(endpoint, params, baseNew);

      try {
        const res = await fetch("/api/protected/fms-api-compare", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...body, oldUrl, newUrl }),
        });
        const data = await res.json();
        const { oldError, newError } = data as { oldError?: string; newError?: string };
        const hasFetchError = !!oldError || !!newError;

        const errMsg = [oldError && `Oude API: ${oldError}`, newError && `Nieuwe API: ${newError}`]
          .filter(Boolean)
          .join("; ");

        if (!res.ok) {
          updateRowStatusByTestId(row.testId, "error", errMsg);
          continue;
        }
        if (hasFetchError) {
          updateRowStatusByTestId(row.testId, "error", errMsg);
          continue;
        }

        const { oldResult: oldRes, newResult: newRes } = data as { oldResult: string; newResult: string };
        const citycode = row.citycode ?? "";
        const { status } = getCompareStatus(row.endpointId, oldRes, newRes, citycode, {
          allowDynamicDiffs,
          maxverschil: allowDynamicDiffs ? maxverschil : 0,
        });
        updateRowStatusByTestId(row.testId, status);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Fetch failed";
        updateRowStatusByTestId(row.testId, "error", msg);
      }
    }

    setCheckFailedLoading(false);
  };

  const handleAutoCompareOne = async (endpointId: string) => {
    const endpoint = LOCATION_ENDPOINTS.find((e) => e.id === endpointId);
    if (!endpoint) return;
    const params = autoCompareParamValues;
    const citycode = params.citycode ?? "";
    if (isSkippedForNonNumericCitycode(citycode, endpointId)) {
      setAutoCompareRowStatus((s) => ({ ...s, [endpointId]: "skipped" }));
      setAutoCompareRowError((e) => ({ ...e, [endpointId]: "Overgeslagen (non-numeric citycode)" }));
      updateFullDatasetRowStatus(endpointId, "skipped");
      return;
    }
    const baseNew = newApiUrl || (typeof window !== "undefined" ? window.location.origin : "");
    setAutoCompareRowStatus((s) => ({ ...s, [endpointId]: "loading" }));
    setAutoCompareRowError((e) => ({ ...e, [endpointId]: "" }));
    setAutoCompareRowResults((r) => {
      const next = { ...r };
      delete next[endpointId];
      return next;
    });
    setAutoCompareRowTiming((t) => {
      const next = { ...t };
      delete next[endpointId];
      return next;
    });

    const body: { useApiCredentials?: boolean; authorizationHeader?: string } = {};
    if (credentialsFromApi && useAuth) {
      body.useApiCredentials = true;
    } else if (useAuth) {
      body.authorizationHeader = `Basic ${btoa(`${authUsername}:${authPassword}`)}`;
    }

    if (!hasRequiredParams(endpoint, params)) {
      setAutoCompareRowStatus((s) => ({ ...s, [endpointId]: "identical" }));
      setAutoCompareRowResults((r) => ({ ...r, [endpointId]: { old: "[]", new: "[]" } }));
      setAutoCompareRowExpanded((x) => ({ ...x, [endpointId]: false }));
      updateFullDatasetRowStatus(endpointId, "identical");
      return;
    }
    const oldUrl = getOldUrl(endpoint, params, oldApiUrl);
    const newUrl = getNewUrl(endpoint, params, baseNew);

    try {
      const res = await fetch("/api/protected/fms-api-compare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, oldUrl, newUrl }),
      });
      const data = await res.json();
      const { oldError, newError } = data as { oldError?: string; newError?: string };
      const hasFetchError = !!oldError || !!newError;

      if (!res.ok) {
        const parts: string[] = [];
        if (oldError) parts.push(`Oude API: ${oldError}`);
        if (newError) parts.push(`Nieuwe API: ${newError}`);
        setAutoCompareRowStatus((s) => ({ ...s, [endpointId]: "error" }));
        setAutoCompareRowError((e) => ({ ...e, [endpointId]: parts.length > 0 ? parts.join("; ") : data.message ?? "Request failed" }));
        updateFullDatasetRowStatus(endpointId, "error", parts.join("; "));
        return;
      }
      if (hasFetchError) {
        const parts: string[] = [];
        if (oldError) parts.push(`Oude API: ${oldError}`);
        if (newError) parts.push(`Nieuwe API: ${newError}`);
        setAutoCompareRowStatus((s) => ({ ...s, [endpointId]: "error" }));
        setAutoCompareRowError((e) => ({ ...e, [endpointId]: parts.join("; ") }));
        const formatResult = (s: string) => {
          try {
            return JSON.stringify(JSON.parse(s), null, 2);
          } catch {
            return s;
          }
        };
        setAutoCompareRowResults((r) => ({
          ...r,
          [endpointId]: {
            old: oldError ? `[Fout Oude API: ${oldError}]` : formatResult(data.oldResult ?? ""),
            new: newError ? `[Fout Nieuwe API: ${newError}]` : formatResult(data.newResult ?? ""),
          },
        }));
        if (data.oldDurationSeconds != null || data.newDurationSeconds != null) {
          setAutoCompareRowTiming((t) => ({
            ...t,
            [endpointId]: {
              oldSeconds: data.oldDurationSeconds ?? 0,
              newSeconds: data.newDurationSeconds ?? 0,
            },
          }));
        }
        updateFullDatasetRowStatus(endpointId, "error", parts.join("; "));
        return;
      }

      const { oldResult: oldRes, newResult: newRes, oldDurationSeconds, newDurationSeconds } = data as {
        oldResult: string;
        newResult: string;
        oldDurationSeconds?: number;
        newDurationSeconds?: number;
      };
      if (oldDurationSeconds != null && newDurationSeconds != null) {
        setAutoCompareRowTiming((t) => ({ ...t, [endpointId]: { oldSeconds: oldDurationSeconds, newSeconds: newDurationSeconds } }));
      }
      const citycode = autoCompareParamValues.citycode ?? "";
      const { status, oldForDisplay, newForDisplay } = getCompareStatus(endpointId, oldRes, newRes, citycode, {
        allowDynamicDiffs,
        maxverschil: allowDynamicDiffs ? maxverschil : 0,
      });
      setAutoCompareRowStatus((s) => ({ ...s, [endpointId]: status }));
      setAutoCompareRowResults((r) => ({ ...r, [endpointId]: { old: oldForDisplay, new: newForDisplay } }));
      setAutoCompareRowExpanded((x) => ({ ...x, [endpointId]: false }));
      updateFullDatasetRowStatus(endpointId, status);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Fetch failed";
      setAutoCompareRowStatus((s) => ({ ...s, [endpointId]: "error" }));
      setAutoCompareRowError((e) => ({ ...e, [endpointId]: msg }));
      updateFullDatasetRowStatus(endpointId, "error", msg);
    }
  };

  const handleAutoCompareReset = () => {
    setAutoCompareRowStatus({});
    setAutoCompareRowError({});
    setAutoCompareRowResults({});
    setAutoCompareRowTiming({});
    setAutoCompareRowExpanded({});
  };

  const handleAutoCopyToClipboard = (endpoint: EndpointDef) => {
    const status = autoCompareRowStatus[endpoint.id] ?? "pending";
    const results = autoCompareRowResults[endpoint.id];
    const errorMsg = autoCompareRowError[endpoint.id];
    const params = autoCompareParamValues;

    const parameters: Record<string, string> = {};
    for (const p of endpoint.params) {
      const v = params[p];
      if (v != null) parameters[p] = v;
    }

    const resultDescription =
      status === "identical"
        ? "Identiek"
        : status === "uitzondering-biketypeid-sortering"
          ? "Uitzondering - biketypeid sortering"
          : status === "diff"
            ? "Verschilt"
            : status === "error"
              ? `Fout: ${errorMsg ?? "Onbekend"}`
              : status === "skipped"
                ? "Overgeslagen (non-numeric citycode)"
                : status === "loading"
                  ? "Bezig..."
                  : "Nog niet vergeleken";

    const truncate = (s: string): string =>
      s.length > 1024 ? s.slice(0, 1024) + "... <cut off>" : s;

    const oldData = results?.old ?? "(no data)";
    const newData = results?.new ?? "(no data)";
    const diffRecords = status === "diff" && results ? getDiffOnly(results.old, results.new) : null;

    const diffExplanation = [
      "",
      "--- Diff (deep-object-diff) ---",
      "We supply a diff based on the deep-object-diff tool. The diff isolates only the differing paths:",
      "- oldOnly: keys/values present in the OLD API result that differ from or are missing in the NEW API result",
      "- newOnly: keys/values present in the NEW API result that differ from or are missing in the OLD API result",
      "Nested objects show only the leaf paths that differ. Empty {} means no differences for that side.",
    ].join("\n");

    const depth = params.depth ?? "3";
    const instruction = [
      "Fix the new API implementation so it returns the same structure and values as the old API for this endpoint. The order of keys in the structure should also match the old API. When differences exist, first check if the correct old and new API URLs/stubs are created (e.g. wrong URL routing can cause the old API to return wrong data like citycodes instead of a section). When there is a structure mismatch between the old and new API data, look in swagger description in the old documentation to resolve. Start by comparing the keys in the outermost object. Keys must match and be in the same order. For single value keys, values must be the same. For keys that have object values, take a recursive approach: compare the keys and values in the child object etc. For lists, look at each object in the list in the same way.",
      "",
      `Endpoint: ${endpoint.label}`,
      `The data was requested with depth=${depth} and no parameter selection.`,
      Object.keys(parameters).length > 0 ? `Parameters: ${JSON.stringify(parameters)}` : null,
      `Status: ${resultDescription}`,
      "",
      "Old API result:",
      truncate(oldData),
      "",
      "New API result:",
      truncate(newData),
      diffRecords && (diffRecords.oldOnly !== "{}" || diffRecords.newOnly !== "{}")
        ? [
            diffExplanation,
            "",
            "Diff (oldOnly - values in old that differ from new):",
            truncate(diffRecords.oldOnly),
            "",
            "Diff (newOnly - values in new that differ from old):",
            truncate(diffRecords.newOnly),
          ]
        : null,
    ]
      .filter((line): line is string | string[] => line != null)
      .flat()
      .join("\n");

    void navigator.clipboard.writeText(instruction);
  };

  const handleResetResults = () => {
    setRowStatus({});
    setRowError({});
    setRowResults({});
    setRowTiming({});
    setRowExpanded({});
  };

  const handleCompareOne = async (endpointId: string) => {
    const endpoint = ENDPOINTS.find((e) => e.id === endpointId);
    if (!endpoint) return;
    const citycode = paramValues.citycode ?? "";
    if (isSkippedForNonNumericCitycode(citycode, endpointId)) {
      setRowStatus((s) => ({ ...s, [endpointId]: "skipped" }));
      setRowError((e) => ({ ...e, [endpointId]: "Overgeslagen (non-numeric citycode)" }));
      setRowResults((r) => {
        const next = { ...r };
        delete next[endpointId];
        return next;
      });
      return;
    }
    const baseNew = newApiUrl || (typeof window !== "undefined" ? window.location.origin : "");
    setRowStatus((s) => ({ ...s, [endpointId]: "loading" }));
    setRowError((e) => ({ ...e, [endpointId]: "" }));
    setRowResults((r) => {
      const next = { ...r };
      delete next[endpointId];
      return next;
    });
    setRowTiming((t) => {
      const next = { ...t };
      delete next[endpointId];
      return next;
    });

    const body: { useApiCredentials?: boolean; authorizationHeader?: string } = {};
    if (credentialsFromApi && useAuth) {
      body.useApiCredentials = true;
    } else if (useAuth) {
      body.authorizationHeader = `Basic ${btoa(`${authUsername}:${authPassword}`)}`;
    }

    if (!hasRequiredParams(endpoint, paramValues)) {
      setRowStatus((s) => ({ ...s, [endpointId]: "identical" }));
      setRowResults((r) => ({ ...r, [endpointId]: { old: "[]", new: "[]" } }));
      setRowExpanded((x) => ({ ...x, [endpointId]: false }));
      return;
    }
    const oldUrl = getOldUrl(endpoint, paramValues, oldApiUrl);
    const newUrl = getNewUrl(endpoint, paramValues, baseNew);

    try {
      const res = await fetch("/api/protected/fms-api-compare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, oldUrl, newUrl }),
      });
      const data = await res.json();
      const { oldError, newError } = data as { oldError?: string; newError?: string };
      const hasFetchError = !!oldError || !!newError;

      if (!res.ok) {
        const parts: string[] = [];
        if (oldError) parts.push(`Oude API: ${oldError}`);
        if (newError) parts.push(`Nieuwe API: ${newError}`);
        setRowStatus((s) => ({ ...s, [endpointId]: "error" }));
        setRowError((e) => ({ ...e, [endpointId]: parts.length > 0 ? parts.join("; ") : data.message ?? "Request failed" }));
        setRowExpanded((x) => ({ ...x, [endpointId]: false }));
        return;
      }
      if (hasFetchError) {
        const parts: string[] = [];
        if (oldError) parts.push(`Oude API: ${oldError}`);
        if (newError) parts.push(`Nieuwe API: ${newError}`);
        setRowStatus((s) => ({ ...s, [endpointId]: "error" }));
        setRowError((e) => ({ ...e, [endpointId]: parts.join("; ") }));
        const formatResult = (s: string) => {
          try {
            return JSON.stringify(JSON.parse(s), null, 2);
          } catch {
            return s;
          }
        };
        setRowResults((r) => ({
          ...r,
          [endpointId]: {
            old: oldError ? `[Fout Oude API: ${oldError}]` : formatResult(data.oldResult ?? ""),
            new: newError ? `[Fout Nieuwe API: ${newError}]` : formatResult(data.newResult ?? ""),
          },
        }));
        if (data.oldDurationSeconds != null || data.newDurationSeconds != null) {
          setRowTiming((t) => ({
            ...t,
            [endpointId]: {
              oldSeconds: data.oldDurationSeconds ?? 0,
              newSeconds: data.newDurationSeconds ?? 0,
            },
          }));
        }
        setRowExpanded((x) => ({ ...x, [endpointId]: false }));
        return;
      }

      const { oldResult: oldRes, newResult: newRes, oldDurationSeconds, newDurationSeconds } = data as {
        oldResult: string;
        newResult: string;
        oldDurationSeconds?: number;
        newDurationSeconds?: number;
      };
      if (oldDurationSeconds != null && newDurationSeconds != null) {
        setRowTiming((t) => ({ ...t, [endpointId]: { oldSeconds: oldDurationSeconds, newSeconds: newDurationSeconds } }));
      }
      const citycode = paramValues.citycode ?? "";
      const { status, oldForDisplay, newForDisplay } = getCompareStatus(endpointId, oldRes, newRes, citycode, {
        allowDynamicDiffs,
        maxverschil: allowDynamicDiffs ? maxverschil : 0,
      });
      setRowStatus((s) => ({ ...s, [endpointId]: status }));
      setRowResults((r) => ({ ...r, [endpointId]: { old: oldForDisplay, new: newForDisplay } }));
      setRowExpanded((x) => ({ ...x, [endpointId]: false }));
    } catch (err) {
      setRowStatus((s) => ({ ...s, [endpointId]: "error" }));
      setRowError((e) => ({ ...e, [endpointId]: err instanceof Error ? err.message : "Fetch failed" }));
      setRowExpanded((x) => ({ ...x, [endpointId]: false }));
    }
  };

  const handleCopyToClipboard = (endpoint: (typeof ENDPOINTS)[0]) => {
    const status = rowStatus[endpoint.id] ?? "pending";
    const results = rowResults[endpoint.id];
    const errorMsg = rowError[endpoint.id];

    const parameters: Record<string, string> = {};
    for (const p of endpoint.params) {
      const v = paramValues[p];
      if (v != null) parameters[p] = v;
    }

    const resultDescription =
      status === "identical"
        ? "Identiek"
        : status === "uitzondering-biketypeid-sortering"
          ? "Uitzondering - biketypeid sortering"
          : status === "diff"
            ? "Verschilt"
            : status === "error"
              ? `Fout: ${errorMsg ?? "Onbekend"}`
              : status === "skipped"
                ? "Overgeslagen (non-numeric citycode)"
                : status === "loading"
                  ? "Bezig..."
                  : "Nog niet vergeleken";

    const truncate = (s: string): string =>
      s.length > 1024 ? s.slice(0, 1024) + "... <cut off>" : s;

    const oldData = results?.old ?? "(no data)";
    const newData = results?.new ?? "(no data)";
    const diffRecords = status === "diff" && results ? getDiffOnly(results.old, results.new) : null;

    const diffExplanation = [
      "",
      "--- Diff (deep-object-diff) ---",
      "We supply a diff based on the deep-object-diff tool. The diff isolates only the differing paths:",
      "- oldOnly: keys/values present in the OLD API result that differ from or are missing in the NEW API result",
      "- newOnly: keys/values present in the NEW API result that differ from or are missing in the OLD API result",
      "Nested objects show only the leaf paths that differ. Empty {} means no differences for that side.",
    ].join("\n");

    const depth = paramValues.depth ?? "3";
    const instruction = [
      "Fix the new API implementation so it returns the same structure and values as the old API for this endpoint. The order of keys in the structure should also match the old API. When differences exist, first check if the correct old and new API URLs/stubs are created (e.g. wrong URL routing can cause the old API to return wrong data like citycodes instead of a section). When there is a structure mismatch between the old and new API data, look in swagger description in the old documentation to resolve. Start by comparing the keys in the outermost object. Keys must match and be in the same order. For single value keys, values must be the same. For keys that have object values, take a recursive approach: compare the keys and values in the child object etc. For lists, look at each object in the list in the same way.",
      "",
      `Endpoint: ${endpoint.label}`,
      `The data was requested with depth=${depth} and no parameter selection.`,
      Object.keys(parameters).length > 0 ? `Parameters: ${JSON.stringify(parameters)}` : null,
      `Status: ${resultDescription}`,
      "",
      "Old API result:",
      truncate(oldData),
      "",
      "New API result:",
      truncate(newData),
      diffRecords && (diffRecords.oldOnly !== "{}" || diffRecords.newOnly !== "{}")
        ? [
            diffExplanation,
            "",
            "Diff (oldOnly - values in old that differ from new):",
            truncate(diffRecords.oldOnly),
            "",
            "Diff (newOnly - values in new that differ from old):",
            truncate(diffRecords.newOnly),
          ]
        : null,
    ]
      .filter((line): line is string | string[] => line != null)
      .flat()
      .join("\n");

    void navigator.clipboard.writeText(instruction);
  };

  if (!session) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="bg-yellow-50 border border-yellow-300 rounded-lg p-6 max-w-2xl mx-auto">
          <h3 className="text-lg font-medium text-yellow-800 mb-2">Inloggen vereist</h3>
          <p className="text-sm text-yellow-700">U moet ingelogd zijn om deze pagina te bekijken.</p>
        </div>
      </div>
    );
  }

  if (!hasAccess) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="bg-red-50 border border-red-300 rounded-lg p-6 max-w-2xl mx-auto">
          <h3 className="text-lg font-medium text-red-800 mb-2">Geen toegang</h3>
          <p className="text-sm text-red-700">Alleen fietsberaad superadmins hebben toegang tot deze pagina.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-full">
      <h1 className="text-3xl font-bold text-gray-900 mb-6">FMS API vergelijking</h1>

      {/* API URL fields - shared by both tabs */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Oude API url</label>
          <input
            type="text"
            value={oldApiUrl}
            onChange={(e) => setOldApiUrl(e.target.value)}
            className="w-full p-2 border rounded"
            placeholder="https://remote.veiligstallen.nl"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Nieuwe API url (basis) –{" "}
            <Link href="/test/fms-api-docs" className="text-blue-600 hover:underline">
              Swagger docs
            </Link>
          </label>
          <input
            type="text"
            value={newApiUrl}
            onChange={(e) => setNewApiUrl(e.target.value)}
            className="w-full p-2 border rounded"
            placeholder="Leeg = huidige host"
          />
        </div>
        {credentialsFromApi ? (
          <div className="md:col-span-2 flex items-end">
            <div className="text-sm text-gray-600 w-full">
              Basic Auth: geconfigureerde credentials (FMS_TEST_USER / FMS_TEST_PASS)
              <button type="button" onClick={() => setCredentialsFromApi(false)} className="ml-2 text-blue-600 hover:underline">
                Andere credentials gebruiken
              </button>
            </div>
          </div>
        ) : (
          <>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Basic Auth gebruikersnaam</label>
              <input
                type="text"
                value={authUsername}
                onChange={(e) => setAuthUsername(e.target.value)}
                className="w-full p-2 border rounded"
                placeholder="Optioneel"
                autoComplete="off"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Basic Auth wachtwoord</label>
              <input
                type="password"
                value={authPassword}
                onChange={(e) => setAuthPassword(e.target.value)}
                className="w-full p-2 border rounded"
                placeholder="Optioneel"
                autoComplete="new-password"
              />
            </div>
          </>
        )}
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-4">
        <nav className="flex gap-4">
          <button
            type="button"
            onClick={() => setActiveTab("algemeen")}
            className={`py-2 px-1 border-b-2 font-bold text-2xl ${
              activeTab === "algemeen"
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
            }`}
          >
            Globale API-stubs
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("specifiek")}
            className={`py-2 px-1 border-b-2 font-bold text-2xl ${
              activeTab === "specifiek"
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
            }`}
          >
            Locatie-specifieke API-stubs
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("geautomatiseerd")}
            className={`py-2 px-1 border-b-2 font-bold text-2xl ${
              activeTab === "geautomatiseerd"
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
            }`}
          >
            Geautomatiseerd Testen
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("instellingen")}
            className={`py-2 px-1 border-b-2 font-bold text-2xl ${
              activeTab === "instellingen"
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
            }`}
          >
            Instellingen
          </button>
        </nav>
      </div>

      {dataLoading ? (
        <div className="flex flex-col items-center justify-center py-16 gap-4 text-gray-600">
          <svg
            className="animate-spin h-10 w-10 text-blue-600"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
          <span className="text-lg font-medium">Data inladen…</span>
        </div>
      ) : (
      <div className="w-full space-y-4 mb-6">
        {activeTab === "algemeen" && (
          <div>
            <div className="flex flex-wrap items-end gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Depth</label>
                <select
                  value={paramValues.depth ?? "3"}
                  onChange={(e) => setParamValues((p) => ({ ...p, depth: e.target.value }))}
                  className="w-auto min-w-[4rem] p-2 border rounded"
                >
                  {[1, 2, 3].map((d) => (
                    <option key={d} value={String(d)}>
                      {d}
                    </option>
                  ))}
                </select>
              </div>
              <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-700 pb-2">
                <input
                  type="checkbox"
                  checked={showOnlyDifferences}
                  onChange={(e) => setShowOnlyDifferences(e.target.checked)}
                  className="rounded border-gray-300"
                />
                Alleen verschillen tonen
              </label>
            </div>
            <EndpointComparisonTable
              endpoints={GLOBAL_ENDPOINTS}
              paramValues={paramValues}
              rowStatus={rowStatus}
              rowError={rowError}
              rowResults={rowResults}
              rowTiming={rowTiming}
              rowExpanded={rowExpanded}
              loading={loading}
              showOnlyDifferences={showOnlyDifferences}
              getUrlsForEndpoint={(e) => ({
                oldUrl: getOldUrl(e, paramValues, oldApiUrl),
                newUrl: getNewUrl(e, paramValues, apiBase),
              })}
              onCompareOne={handleCompareOne}
              onCompareAll={() => void handleCompareAll(undefined, GLOBAL_ENDPOINTS)}
              onReset={handleResetResults}
              onCopyToClipboard={handleCopyToClipboard}
              onExpandedChange={(id, expanded) => setRowExpanded((x) => ({ ...x, [id]: expanded }))}
            />
          </div>
        )}

        {activeTab === "specifiek" && (
          <>
            <div className="flex flex-wrap items-end gap-4">
          <div className="w-auto min-w-[12rem]">
            <label className="block text-sm font-medium text-gray-700 mb-1">Organisatie</label>
            <Autocomplete
              options={cityOptions}
              getOptionLabel={(o) => o.label}
              value={
                cityOptions.find((o) => o.value === (paramValues.citycode ?? "")) ??
                ((paramValues.citycode ?? "")
                  ? { value: paramValues.citycode ?? "", label: `${paramValues.citycode} (opgeslagen)` }
                  : null)
              }
              onChange={(_, newValue) =>
                setParamValues((p) => ({
                  ...p,
                  citycode: newValue?.value ?? "",
                  locationid: "",
                  sectionid: "",
                }))
              }
              isOptionEqualToValue={(a, b) => a.value === b.value}
              loading={optionsLoading.city}
              disabled={optionsLoading.city}
              renderInput={(params) => (
                <TextField
                  {...params}
                  placeholder={optionsLoading.city ? "Laden..." : "Typ om te zoeken..."}
                  size="small"
                  className="w-full"
                />
              )}
            />
          </div>
          <div className="w-auto min-w-[20rem]">
            <label className="block text-sm font-medium text-gray-700 mb-1">Stalling</label>
            <Autocomplete
              options={locationOptions}
              getOptionLabel={(o) => o.label}
              value={
                locationOptions.find((o) => o.value === (paramValues.locationid ?? "")) ??
                ((paramValues.locationid ?? "")
                  ? { value: paramValues.locationid ?? "", label: `${paramValues.locationid} (opgeslagen)` }
                  : null)
              }
              onChange={(_, newValue) =>
                setParamValues((p) => ({
                  ...p,
                  locationid: newValue?.value ?? "",
                  sectionid: "",
                }))
              }
              isOptionEqualToValue={(a, b) => a.value === b.value}
              loading={optionsLoading.location}
              disabled={optionsLoading.location || !paramValues.citycode}
              slotProps={{
                paper: { sx: { minWidth: 280 } },
              }}
              renderInput={(params) => (
                <TextField
                  {...params}
                  placeholder={
                    optionsLoading.location
                      ? "Laden..."
                      : !paramValues.citycode
                        ? "Selecteer eerst organisatie"
                        : "Typ om te zoeken..."
                  }
                  size="small"
                  className="w-full"
                  inputProps={{
                    ...params.inputProps,
                    style: { ...params.inputProps?.style, overflow: "visible", textOverflow: "clip" },
                  }}
                />
              )}
            />
          </div>
          <div className="w-auto min-w-[12rem]">
            <label className="block text-sm font-medium text-gray-700 mb-1">Sectie</label>
            <select
              value={paramValues.sectionid ?? ""}
              onChange={(e) => setParamValues((p) => ({ ...p, sectionid: e.target.value }))}
              className="w-auto min-w-[12rem] p-2 border rounded"
              disabled={optionsLoading.section || !paramValues.locationid}
            >
              <option value="">
                {optionsLoading.section ? "Laden..." : !paramValues.locationid ? "Selecteer eerst Stalling" : "Selecteer Sectie"}
              </option>
              {sectionOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
              {!optionsLoading.section && (paramValues.sectionid ?? "") && !sectionOptions.some((o) => o.value === (paramValues.sectionid ?? "")) && (
                <option value={paramValues.sectionid ?? ""}>{paramValues.sectionid} (opgeslagen)</option>
              )}
            </select>
          </div>
          <div className="w-auto min-w-[4rem]">
            <label className="block text-sm font-medium text-gray-700 mb-1">Depth</label>
            <select
              value={paramValues.depth ?? "3"}
              onChange={(e) => setParamValues((p) => ({ ...p, depth: e.target.value }))}
              className="w-auto min-w-[4rem] p-2 border rounded"
            >
              {[1, 2, 3].map((d) => (
                <option key={d} value={String(d)}>
                  {d}
                </option>
              ))}
            </select>
          </div>
          <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-700 pb-2">
            <input
              type="checkbox"
              checked={showOnlyDifferences}
              onChange={(e) => setShowOnlyDifferences(e.target.checked)}
              className="rounded border-gray-300"
            />
            Alleen verschillen tonen
          </label>
        </div>

            {/* Table 2: Location-specific endpoints */}
            <div>
              <EndpointComparisonTable
                endpoints={LOCATION_ENDPOINTS}
                paramValues={paramValues}
                rowStatus={rowStatus}
                rowError={rowError}
                rowResults={rowResults}
                rowTiming={rowTiming}
                rowExpanded={rowExpanded}
                loading={loading}
                showOnlyDifferences={showOnlyDifferences}
                getUrlsForEndpoint={(e) => ({
                  oldUrl: getOldUrl(e, paramValues, oldApiUrl),
                  newUrl: getNewUrl(e, paramValues, apiBase),
                })}
                onCompareOne={handleCompareOne}
                onCompareAll={() => void handleCompareAll(undefined, LOCATION_ENDPOINTS)}
                onReset={handleResetResults}
                onCopyToClipboard={handleCopyToClipboard}
                onExpandedChange={(id, expanded) => setRowExpanded((x) => ({ ...x, [id]: expanded }))}
              />
            </div>
          </>
        )}

        {activeTab === "geautomatiseerd" && (
          <div className="flex flex-col min-h-[calc(100vh-14rem)]">
            {selectedFullDatasetRow && (
              <div className="mb-6 shrink-0">
                <h2 className="text-xl font-semibold text-gray-900 mb-3">
                  Vergelijking voor{" "}
                  {showStallingNames
                    ? (cityOptions.find((o) => o.value === selectedFullDatasetRow.citycode)?.label ??
                        selectedFullDatasetRow.citycode)
                    : selectedFullDatasetRow.citycode}
                  {selectedFullDatasetRow.locationid &&
                    ` / ${
                      showStallingNames
                        ? (allLocationLabels[
                            `${selectedFullDatasetRow.citycode}-${selectedFullDatasetRow.locationid}`
                          ] ?? selectedFullDatasetRow.locationid)
                        : selectedFullDatasetRow.locationid
                    }`}
                  {selectedFullDatasetRow.sectionid && ` / ${selectedFullDatasetRow.sectionid}`}
                  <button
                    type="button"
                    onClick={() => setSelectedFullDatasetRow(null)}
                    className="ml-2 text-sm font-normal text-gray-500 hover:text-gray-700"
                  >
                    Sluiten
                  </button>
                </h2>
                <div className="flex flex-wrap items-end gap-4 mb-2">
                  <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-700">
                    <input
                      type="checkbox"
                      checked={showOnlyDifferences}
                      onChange={(e) => setShowOnlyDifferences(e.target.checked)}
                      className="rounded border-gray-300"
                    />
                    Alleen verschillen tonen
                  </label>
                </div>
                <EndpointComparisonTable
                  endpoints={LOCATION_ENDPOINTS}
                  paramValues={autoCompareParamValues}
                  rowStatus={autoCompareRowStatus}
                  rowError={autoCompareRowError}
                  rowResults={autoCompareRowResults}
                  rowTiming={autoCompareRowTiming}
                  rowExpanded={autoCompareRowExpanded}
                  loading={autoCompareLoading}
                  showOnlyDifferences={showOnlyDifferences}
                  getUrlsForEndpoint={(e) => ({
                    oldUrl: getOldUrl(e, autoCompareParamValues, oldApiUrl),
                    newUrl: getNewUrl(e, autoCompareParamValues, apiBase),
                  })}
                  onCompareOne={handleAutoCompareOne}
                  onCompareAll={() => void handleAutoCompareAll(autoCompareParamValues)}
                  onReset={handleAutoCompareReset}
                  onCopyToClipboard={handleAutoCopyToClipboard}
                  onExpandedChange={(id, expanded) => setAutoCompareRowExpanded((x) => ({ ...x, [id]: expanded }))}
                />
              </div>
            )}

            <div className="flex flex-wrap items-end gap-4 mb-4 shrink-0">
              <div className="w-auto min-w-[4rem]">
                <label className="block text-sm font-medium text-gray-700 mb-1">Depth</label>
                <select
                  value={fullDatasetDepth}
                  onChange={(e) => setFullDatasetDepth(e.target.value)}
                  className="w-full p-2 border rounded"
                >
                  {[1, 2, 3].map((d) => (
                    <option key={d} value={String(d)}>
                      {d}
                    </option>
                  ))}
                </select>
              </div>
              <div className="w-auto min-w-[16rem]">
                <label className="block text-sm font-medium text-gray-700 mb-1">Scope</label>
                <select
                  value={fullDatasetScope}
                  onChange={(e) => setFullDatasetScope(e.target.value)}
                  className="w-full p-2 border rounded"
                >
                  <option value="">Alle Data-eigenaren</option>
                  {cityOptions.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
              <button
                onClick={() => void handleFullDatasetTest(fullDatasetScope || undefined)}
                disabled={fullDatasetLoading || loading}
                className="px-4 py-2 bg-emerald-600 text-white rounded hover:bg-emerald-700 disabled:opacity-50"
              >
                {fullDatasetLoading ? "Bezig..." : "Testen"}
              </button>
              <button
                onClick={() => void handleCheckFailedRows()}
                disabled={
                  fullDatasetLoading ||
                  loading ||
                  checkFailedLoading ||
                  !fullDatasetResults ||
                  !fullDatasetResults.results.some((r) => r.status === "diff" || r.status === "error")
                }
                title="Re-test alleen de mislukte rijen om te zien welke items zijn opgelost na een fix"
                className="px-4 py-2 border border-emerald-600 text-emerald-600 rounded hover:bg-emerald-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {checkFailedLoading ? "Bezig..." : "Resultaten controleren"}
              </button>
            </div>

            {fullDatasetResults && (
              <div className="mt-6 flex flex-col flex-1 min-h-0">
                <h2 className="text-xl font-semibold text-gray-900 mb-3 shrink-0">Alle data-eigenaren resultaten</h2>
                <div className="flex flex-wrap items-end gap-3 mb-2 shrink-0">
                  <div className="w-auto min-w-[10rem]">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Locatietype</label>
                    <select
                      value={fullDatasetLocationtypeFilter}
                      onChange={(e) => setFullDatasetLocationtypeFilter(e.target.value)}
                      className="w-full p-2 border rounded"
                    >
                      <option value="">Alles</option>
                      {[
                        ...new Set(
                          fullDatasetResults.results
                            .map((r) => r.locationtype)
                            .filter((t): t is string => !!t)
                        ),
                      ]
                        .sort()
                        .map((t) => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                    </select>
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-700 pb-2">
                    <input
                      type="checkbox"
                      checked={showOnlyFailedFullDataset}
                      onChange={(e) => setShowOnlyFailedFullDataset(e.target.checked)}
                      className="rounded border-gray-300"
                    />
                    Alleen mislukte testen
                  </label>
                </div>
                <p className="text-sm text-gray-600 mb-2 shrink-0">
                  {fullDatasetResults.summary.total} tests: {fullDatasetResults.summary.identical} identiek
                  {(fullDatasetResults.summary.uitzonderingBiketypeidSortering ?? 0) > 0
                    ? `, ${fullDatasetResults.summary.uitzonderingBiketypeidSortering} uitzondering biketypeid`
                    : ""}
                  , {fullDatasetResults.summary.diff} verschillend, {fullDatasetResults.summary.error} fout
                  {((fullDatasetResults.summary as { skipped?: number }).skipped ?? 0) > 0
                    ? `, ${(fullDatasetResults.summary as { skipped: number }).skipped} overgeslagen (non-numeric citycode)`
                    : ""}
                  .
                  Klik op een rij om de formuliervelden in te stellen en de gerelateerde test uit te voeren.
                </p>
                <div className="w-full min-w-0 flex-1 min-h-0 border rounded overflow-auto">
                  <table className="w-full text-sm table-auto">
                    <thead className="bg-gray-100 sticky top-0">
                      <tr>
                        <th className="text-left p-2 font-medium">Type</th>
                        <th className="text-left p-2 font-medium">Locatietype</th>
                        <th className="text-left p-2 font-medium">citycode</th>
                        <th className="text-left p-2 font-medium">locationid</th>
                        <th className="text-left p-2 font-medium">sectionid</th>
                        <th className="text-left p-2 font-medium">Endpoint</th>
                        <th className="text-left p-2 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(showOnlyFailedFullDataset
                        ? fullDatasetResults.results.filter((r) => r.status === "diff" || r.status === "error")
                        : fullDatasetResults.results
                      )
                        .filter((r) => {
                          if (!fullDatasetLocationtypeFilter) return true;
                          if (r.type === "city") return false;
                          return r.locationtype === fullDatasetLocationtypeFilter;
                        })
                        .map((r) => (
                        <tr
                          key={r.testId}
                          onClick={() => handleFullDatasetRowClick(r)}
                          className={`border-t cursor-pointer hover:bg-gray-50 ${
                            r.status === "identical" || r.status === "skipped" || r.status === "uitzondering-biketypeid-sortering" ? "bg-green-50" : r.status === "diff" || r.status === "error" ? "bg-red-50" : ""
                          }`}
                        >
                          <td className="p-2">{r.type}</td>
                          <td className="p-2">{r.locationtype ?? "—"}</td>
                          <td className="p-2">
                            {showStallingNames
                              ? (cityOptions.find((o) => o.value === r.citycode)?.label ?? r.citycode)
                              : r.citycode}
                          </td>
                          <td className="p-2">
                            {r.locationid
                              ? showStallingNames
                                ? (allLocationLabels[`${r.citycode}-${r.locationid}`] ?? r.locationid)
                                : r.locationid
                              : "—"}
                          </td>
                          <td className="p-2">{r.sectionid ?? "—"}</td>
                          <td className="p-2">{r.endpointLabel}</td>
                          <td className="p-2">
                            {r.status === "identical" && "Identiek"}
                            {r.status === "uitzondering-biketypeid-sortering" && "Uitzondering - biketypeid sortering"}
                            {r.status === "diff" && "Verschilt"}
                            {r.status === "error" && (r.error ? `Fout: ${r.error.slice(0, 50)}...` : "Fout")}
                            {r.status === "skipped" && "Overgeslagen (non-numeric citycode)"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === "instellingen" && (
          <div className="space-y-6 max-w-xl">
            <h2 className="text-xl font-semibold text-gray-900">Vergelijkingsinstellingen</h2>

            <section>
              <h3 className="text-lg font-medium text-gray-800 mb-2">Weergave</h3>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showStallingNames}
                  onChange={(e) => setShowStallingNames(e.target.checked)}
                  className="rounded border-gray-300"
                />
                <span className="text-gray-700">Toon stalling en locatienamen</span>
              </label>
              <p className="text-sm text-gray-600 mt-2">
                Wanneer uitgeschakeld: toon alleen citycode en locationid in plaats van namen (bijv. in de
                Geautomatiseerd-tab).
              </p>
            </section>

            <section className="border-t pt-6">
              <h3 className="text-lg font-medium text-gray-800 mb-2">Dynamische verschillen toestaan</h3>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={allowDynamicDiffs}
                  onChange={(e) => setAllowDynamicDiffs(e.target.checked)}
                  className="rounded border-gray-300"
                />
                <span className="text-gray-700">Dynamische verschillen toestaan</span>
              </label>
              <p className="text-sm text-gray-600 mt-2">
                Wanneer ingeschakeld: records waarbij het verschil tussen oude en nieuwe API voor occupied/free binnen het
                maxverschil valt én totaal 0 is (bijv. occupied +1, free -1) worden voor de vergelijking genegeerd.
              </p>
              <div className="flex items-center gap-3 mt-2">
                <label className="text-gray-700">maxverschil</label>
                <input
                  type="number"
                  min={0}
                  value={maxverschil}
                  onChange={(e) => setMaxverschil(Math.max(0, parseInt(e.target.value, 10) || 0))}
                  className="w-20 p-2 border rounded"
                />
              </div>
            </section>

            <section className="border-t pt-6">
              <h3 className="text-lg font-medium text-gray-800 mb-2">Geaccepteerde verschillen</h3>
              <div className="text-sm text-gray-600 space-y-2">
                <p>
                  <strong>Dynamische occupied/free (buurtstallingen):</strong> Off-by-one verschillen in occupied/free
                  worden veroorzaakt door <strong>caching</strong>. Beide APIs lezen Bezetting uit de database; de ColdFusion
                  API gebruikt ORM-entity caching, de nieuwe API doet elke keer een verse query. Daardoor kan de ene API
                  een gecachte (verouderde) waarde teruggeven terwijl de andere de actuele waarde heeft. Het verschil is
                  dynamisch: opnieuw testen na korte tijd geeft vaak identieke resultaten zodra caches verlopen.
                </p>
                <p>
                  Zie <code className="bg-gray-100 px-1 rounded">docs/analyse-motorblok/API_PORTING_PLAN.md</code> §14
                  voor meer details.
                </p>
              </div>
            </section>
          </div>
        )}
      </div>
      )}
    </div>
  );
};

export default FmsApiComparePage;
