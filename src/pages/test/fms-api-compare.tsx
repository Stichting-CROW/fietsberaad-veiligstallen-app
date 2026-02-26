import React, { useState, useEffect, useCallback, useRef } from "react";
import { useSession } from "next-auth/react";
import Autocomplete from "@mui/material/Autocomplete";
import TextField from "@mui/material/TextField";
import { diff } from "deep-object-diff";
import { userHasRight } from "~/types/utils";
import { VSSecurityTopic } from "~/types/securityprofile";
import { EndpointComparisonTable, type EndpointDef } from "~/components/beheer/test/EndpointComparisonTable";

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
  status: "identical" | "diff" | "error";
  error?: string;
};

type FullDatasetTestResponse = {
  results: FullDatasetTestResult[];
  summary: { total: number; identical: number; diff: number; error: number };
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

function appendDepthParam(url: string, depth: string, endpointId: string): string {
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
        else if (paramValues.sectionid) {
          p += `/sections/${paramValues.sectionid}`;
          if (endpoint.id === "v3-section") url = p;
          else if (endpoint.id === "v3-places") url = `${p}/places`;
          else url = p;
        } else url = p;
      } else url = p;
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

type RowStatus = "pending" | "loading" | "identical" | "diff" | "error";

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

  const apiBase = typeof window !== "undefined" ? (newApiUrl || window.location.origin) : "";

  // Cities: /api/protected/gemeenten (full, not compact)
  useEffect(() => {
    if (typeof window === "undefined") return;
    setOptionsLoading((o) => ({ ...o, city: true }));
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
        const map: Record<string, string> = {};
        for (const g of withStallingen) {
          if (g.ZipID && g.ID) map[g.ZipID] = g.ID;
        }
        setCityOptions(opts);
        setCityCodeToSiteId(map);
      })
      .catch(() => {
        setCityOptions([]);
        setCityCodeToSiteId({});
      })
      .finally(() => setOptionsLoading((o) => ({ ...o, city: false })));
  }, []);

  // Locations: /api/protected/fietsenstallingen?GemeenteID=siteId
  useEffect(() => {
    const cc = paramValues.citycode;
    const siteId = cityCodeToSiteId[cc ?? ""];
    if (!siteId || !cc) {
      setLocationOptions([]);
      setLocationIdToInternalId({});
      setOptionsLoading((o) => ({ ...o, location: false }));
      return;
    }
    setOptionsLoading((o) => ({ ...o, location: true }));
    fetch(`/api/protected/fietsenstallingen?GemeenteID=${encodeURIComponent(siteId)}`)
      .then((r) => (r.ok ? r.json() : { data: [] }))
      .then((res: { data?: Array<{ ID?: string; StallingsID?: string; Title?: string | null }> }) => {
        const list = res.data ?? [];
        const map: Record<string, string> = {};
        const opts: OptionItem[] = list
          .filter((f) => f.StallingsID)
          .map((l) => {
            if (l.ID && l.StallingsID) map[l.StallingsID] = l.ID;
            return {
              value: l.StallingsID ?? "",
              label: l.Title ? `${l.Title} (${l.StallingsID})` : (l.StallingsID ?? ""),
            };
          })
          .filter((o) => o.value)
          .sort((a, b) => a.label.localeCompare(b.label));
        setLocationOptions(opts);
        setLocationIdToInternalId(map);
        if (opts.length > 0) {
          setParamValues((p) =>
            p.locationid === "" ? { ...p, locationid: opts[0]!.value, sectionid: "" } : p
          );
        }
      })
      .catch(() => {
        setLocationOptions([]);
        setLocationIdToInternalId({});
      })
      .finally(() => setOptionsLoading((o) => ({ ...o, location: false })));
  }, [paramValues.citycode, cityCodeToSiteId]);

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
  const [activeTab, setActiveTab] = useState<"algemeen" | "specifiek" | "geautomatiseerd">("algemeen");

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

    for (const endpoint of endpoints) {
      setRowStatus((s) => ({ ...s, [endpoint.id]: "loading" }));
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
        const identical = responsesMatch(endpoint.id, oldRes, newRes);
        const formattedOld = (() => {
          try {
            return JSON.stringify(JSON.parse(oldRes), null, 2);
          } catch {
            return oldRes;
          }
        })();
        const formattedNew = (() => {
          try {
            return JSON.stringify(JSON.parse(newRes), null, 2);
          } catch {
            return newRes;
          }
        })();
        setRowStatus((s) => ({ ...s, [endpoint.id]: identical ? "identical" : "diff" }));
        setRowResults((r) => ({ ...r, [endpoint.id]: { old: formattedOld, new: formattedNew } }));
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
    const body: { useApiCredentials?: boolean; authorizationHeader?: string; oldApiUrl?: string; newApiUrl?: string; depth?: string; citycode?: string } = {
      oldApiUrl: oldApiUrl || OLD_API_BASE,
      newApiUrl: newApiUrl || (typeof window !== "undefined" ? window.location.origin : ""),
      depth: fullDatasetDepth ?? "3",
      ...(citycodeFilter && { citycode: citycodeFilter }),
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
        summary: { total: 0, identical: 0, diff: 0, error: 1 },
      });
      console.error("Full dataset test failed:", err);
    } finally {
      setFullDatasetLoading(false);
    }
  };

  const updateFullDatasetRowStatus = useCallback(
    (endpointId: string, status: "identical" | "diff" | "error", error?: string) => {
      const params = autoCompareParamValues;
      const type = getTypeForEndpoint(endpointId);
      const citycode = params.citycode ?? "";
      const locationid = type === "location" || type === "section" ? params.locationid : undefined;
      const sectionid = type === "section" ? params.sectionid : undefined;
      const testId = buildFullDatasetTestId(type, citycode, locationid, sectionid, endpointId);
      setFullDatasetResults((prev) => {
        if (!prev) return prev;
        const next = prev.results.map((row) =>
          row.testId === testId ? { ...row, status, ...(error && { error }) } : row
        );
        const identical = next.filter((r) => r.status === "identical").length;
        const diff = next.filter((r) => r.status === "diff").length;
        const err = next.filter((r) => r.status === "error").length;
        const updated = {
          results: next,
          summary: { total: next.length, identical, diff, error: err },
        };
        saveFullDatasetToStorage(updated);
        return updated;
      });
    },
    [autoCompareParamValues]
  );

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

    for (const endpoint of LOCATION_ENDPOINTS) {
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
          setAutoCompareRowStatus((s) => ({ ...s, [endpoint.id]: "error" }));
          setAutoCompareRowError((e) => ({ ...e, [endpoint.id]: parts.length > 0 ? parts.join("; ") : data.message ?? "Request failed" }));
          updateFullDatasetRowStatus(endpoint.id, "error", parts.join("; "));
          continue;
        }
        if (hasFetchError) {
          const parts: string[] = [];
          if (oldError) parts.push(`Oude API: ${oldError}`);
          if (newError) parts.push(`Nieuwe API: ${newError}`);
          setAutoCompareRowStatus((s) => ({ ...s, [endpoint.id]: "error" }));
          setAutoCompareRowError((e) => ({ ...e, [endpoint.id]: parts.join("; ") }));
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
          updateFullDatasetRowStatus(endpoint.id, "error", parts.join("; "));
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
        const identical = responsesMatch(endpoint.id, oldRes, newRes);
        const status: "identical" | "diff" = identical ? "identical" : "diff";
        const formattedOld = (() => {
          try {
            return JSON.stringify(JSON.parse(oldRes), null, 2);
          } catch {
            return oldRes;
          }
        })();
        const formattedNew = (() => {
          try {
            return JSON.stringify(JSON.parse(newRes), null, 2);
          } catch {
            return newRes;
          }
        })();
        setAutoCompareRowStatus((s) => ({ ...s, [endpoint.id]: identical ? "identical" : "diff" }));
        setAutoCompareRowResults((r) => ({ ...r, [endpoint.id]: { old: formattedOld, new: formattedNew } }));
        setAutoCompareRowExpanded((x) => ({ ...x, [endpoint.id]: false }));
        updateFullDatasetRowStatus(endpoint.id, status);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Fetch failed";
        setAutoCompareRowStatus((s) => ({ ...s, [endpoint.id]: "error" }));
        setAutoCompareRowError((e) => ({ ...e, [endpoint.id]: msg }));
        updateFullDatasetRowStatus(endpoint.id, "error", msg);
      }
    }
    setAutoCompareLoading(false);
  };

  const handleAutoCompareOne = async (endpointId: string) => {
    const endpoint = LOCATION_ENDPOINTS.find((e) => e.id === endpointId);
    if (!endpoint) return;
    const params = autoCompareParamValues;
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
      const identical = responsesMatch(endpointId, oldRes, newRes);
      const status: "identical" | "diff" = identical ? "identical" : "diff";
      const formattedOld = (() => {
        try {
          return JSON.stringify(JSON.parse(oldRes), null, 2);
        } catch {
          return oldRes;
        }
      })();
      const formattedNew = (() => {
        try {
          return JSON.stringify(JSON.parse(newRes), null, 2);
        } catch {
          return newRes;
        }
      })();
      setAutoCompareRowStatus((s) => ({ ...s, [endpointId]: identical ? "identical" : "diff" }));
      setAutoCompareRowResults((r) => ({ ...r, [endpointId]: { old: formattedOld, new: formattedNew } }));
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
        : status === "diff"
          ? "Verschilt"
          : status === "error"
            ? `Fout: ${errorMsg ?? "Onbekend"}`
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
      const identical = responsesMatch(endpointId, oldRes, newRes);
      const formattedOld = (() => {
        try {
          return JSON.stringify(JSON.parse(oldRes), null, 2);
        } catch {
          return oldRes;
        }
      })();
      const formattedNew = (() => {
        try {
          return JSON.stringify(JSON.parse(newRes), null, 2);
        } catch {
          return newRes;
        }
      })();
      setRowStatus((s) => ({ ...s, [endpointId]: identical ? "identical" : "diff" }));
      setRowResults((r) => ({ ...r, [endpointId]: { old: formattedOld, new: formattedNew } }));
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
        : status === "diff"
          ? "Verschilt"
          : status === "error"
            ? `Fout: ${errorMsg ?? "Onbekend"}`
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
          <label className="block text-sm font-medium text-gray-700 mb-1">Nieuwe API url (basis)</label>
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
        </nav>
      </div>

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
                  Vergelijking voor {selectedFullDatasetRow.citycode}
                  {selectedFullDatasetRow.locationid && ` / ${selectedFullDatasetRow.locationid}`}
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
                  {fullDatasetResults.summary.total} tests: {fullDatasetResults.summary.identical} identiek, {fullDatasetResults.summary.diff} verschillend, {fullDatasetResults.summary.error} fout.
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
                            r.status === "identical" ? "bg-green-50" : r.status === "diff" || r.status === "error" ? "bg-red-50" : ""
                          }`}
                        >
                          <td className="p-2">{r.type}</td>
                          <td className="p-2">{r.locationtype ?? "—"}</td>
                          <td className="p-2">{r.citycode}</td>
                          <td className="p-2">{r.locationid ?? "—"}</td>
                          <td className="p-2">{r.sectionid ?? "—"}</td>
                          <td className="p-2">{r.endpointLabel}</td>
                          <td className="p-2">
                            {r.status === "identical" && "Identiek"}
                            {r.status === "diff" && "Verschilt"}
                            {r.status === "error" && (r.error ? `Fout: ${r.error.slice(0, 50)}...` : "Fout")}
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
      </div>
    </div>
  );
};

export default FmsApiComparePage;
