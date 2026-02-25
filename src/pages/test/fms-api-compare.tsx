import React, { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import Autocomplete from "@mui/material/Autocomplete";
import TextField from "@mui/material/TextField";
import { userHasRight } from "~/types/utils";
import { VSSecurityTopic } from "~/types/securityprofile";

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

const STORAGE_KEY = "fms-api-compare-params";
const STORAGE_KEY_URLS = "fms-api-compare-urls";

const DEFAULT_PARAMS: Record<string, string> = {
  citycode: "9933",
  locationid: "9933_001",
  sectionid: "9933_001_1",
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

function getOldUrl(endpoint: typeof ENDPOINTS[0], paramValues: Record<string, string>, oldApiBase: string): string {
  if (paramValues.citycode && endpoint.params.includes("citycode")) {
    let path = `/rest/v3/citycodes/${paramValues.citycode}`;
    if (endpoint.id === "v3-citycode") return `${oldApiBase}${path}`;
    if (endpoint.id === "v3-locations") return `${oldApiBase}${path}/locations`;
    if (paramValues.locationid) {
      path += `/locations/${paramValues.locationid}`;
      if (endpoint.id === "v3-subscriptiontypes") return `${oldApiBase}${path}/subscriptiontypes`;
      if (endpoint.id === "v3-sections") return `${oldApiBase}${path}/sections`;
      if (paramValues.sectionid) {
        path += `/sections/${paramValues.sectionid}`;
        if (endpoint.id === "v3-places") return `${oldApiBase}${path}/places`;
        if (endpoint.id === "v3-section") return `${oldApiBase}${path}`;
      }
      if (endpoint.id === "v3-location") return `${oldApiBase}${path}`;
    }
  }
  if (endpoint.id === "v3-citycodes") return `${oldApiBase}/rest/v3/citycodes`;
  const path = "oldPath" in endpoint && endpoint.oldPath ? endpoint.oldPath : endpoint.path;
  return `${oldApiBase}${path}`;
}

function getNewUrl(endpoint: typeof ENDPOINTS[0], paramValues: Record<string, string>, baseNew: string): string {
  const base = "/api/fms";
  if (endpoint.id.startsWith("v2-")) {
    const method = endpoint.path.split("/").pop() ?? "";
    return `${baseNew}${base}/v2/${method}`;
  }
  if (endpoint.id.startsWith("v3-")) {
    if (endpoint.id === "v3-citycodes") return `${baseNew}${base}/v3/citycodes`;
    if (!paramValues.citycode) return `${baseNew}${base}/v3/citycodes`;
    let p = `${baseNew}${base}/v3/citycodes/${paramValues.citycode}`;
    if (endpoint.id === "v3-citycode") return p;
    if (endpoint.id === "v3-locations") return `${p}/locations`;
    if (paramValues.locationid) {
      p += `/locations/${paramValues.locationid}`;
      if (endpoint.id === "v3-location") return p;
      if (endpoint.id === "v3-subscriptiontypes") return `${p}/subscriptiontypes`;
      if (endpoint.id === "v3-sections") return `${p}/sections`;
      if (paramValues.sectionid) {
        p += `/sections/${paramValues.sectionid}`;
        if (endpoint.id === "v3-section") return p;
        if (endpoint.id === "v3-places") return `${p}/places`;
      }
    }
    return p;
  }
  return "";
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

  const apiBase = typeof window !== "undefined" ? (newApiUrl || window.location.origin) : "";

  useEffect(() => {
    if (!apiBase) return;
    setOptionsLoading((o) => ({ ...o, city: true }));
    fetch(`${apiBase}/api/fms/v3/citycodes`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data: Array<{ citycode?: string; name?: string }>) => {
        const opts: OptionItem[] = (data ?? []).map((c) => ({
          value: c.citycode ?? "",
          label: c.name ? `${c.citycode} – ${c.name}` : (c.citycode ?? ""),
        })).filter((o) => o.value);
        setCityOptions(opts);
      })
      .catch(() => setCityOptions([]))
      .finally(() => setOptionsLoading((o) => ({ ...o, city: false })));
  }, [apiBase]);

  useEffect(() => {
    const cc = paramValues.citycode;
    if (!apiBase || !cc) {
      setLocationOptions([]);
      return;
    }
    setOptionsLoading((o) => ({ ...o, location: true }));
    fetch(`${apiBase}/api/fms/v3/citycodes/${encodeURIComponent(cc)}/locations`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data: Array<{ locationid?: string; name?: string }>) => {
        const opts: OptionItem[] = (data ?? []).map((l) => ({
          value: l.locationid ?? "",
          label: l.name ? `${l.locationid} – ${l.name}` : (l.locationid ?? ""),
        })).filter((o) => o.value);
        setLocationOptions(opts);
      })
      .catch(() => setLocationOptions([]))
      .finally(() => setOptionsLoading((o) => ({ ...o, location: false })));
  }, [apiBase, paramValues.citycode]);

  useEffect(() => {
    const cc = paramValues.citycode;
    const lid = paramValues.locationid;
    if (!apiBase || !cc || !lid) {
      setSectionOptions([]);
      return;
    }
    setOptionsLoading((o) => ({ ...o, section: true }));
    fetch(`${apiBase}/api/fms/v3/citycodes/${encodeURIComponent(cc)}/locations/${encodeURIComponent(lid)}/sections`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data: Array<{ sectionid?: string; name?: string }>) => {
        const opts: OptionItem[] = (data ?? []).map((s) => ({
          value: s.sectionid ?? "",
          label: s.name ? `${s.sectionid} – ${s.name}` : (s.sectionid ?? ""),
        })).filter((o) => o.value);
        setSectionOptions(opts);
      })
      .catch(() => setSectionOptions([]))
      .finally(() => setOptionsLoading((o) => ({ ...o, section: false })));
  }, [apiBase, paramValues.citycode, paramValues.locationid]);

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
  const [rowExpanded, setRowExpanded] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(false);

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

  const handleCompareAll = async () => {
    const baseNew = newApiUrl || (typeof window !== "undefined" ? window.location.origin : "");
    setLoading(true);
    setRowStatus({});
    setRowError({});
    setRowResults({});

    const body: { useApiCredentials?: boolean; authorizationHeader?: string } = {};
    if (credentialsFromApi && useAuth) {
      body.useApiCredentials = true;
    } else if (useAuth) {
      body.authorizationHeader = `Basic ${btoa(`${authUsername}:${authPassword}`)}`;
    }

    for (const endpoint of ENDPOINTS) {
      setRowStatus((s) => ({ ...s, [endpoint.id]: "loading" }));
      const oldUrl = getOldUrl(endpoint, paramValues, oldApiUrl);
      const newUrl = getNewUrl(endpoint, paramValues, baseNew);

      try {
        const res = await fetch("/api/protected/fms-api-compare", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...body, oldUrl, newUrl }),
        });
        const data = await res.json();
        if (!res.ok) {
          setRowStatus((s) => ({ ...s, [endpoint.id]: "error" }));
          setRowError((e) => ({ ...e, [endpoint.id]: data.message ?? "Request failed" }));
          continue;
        }
        const { oldResult: oldRes, newResult: newRes } = data as { oldResult: string; newResult: string };
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
        setRowExpanded((x) => ({ ...x, [endpoint.id]: !identical }));
      } catch (err) {
        setRowStatus((s) => ({ ...s, [endpoint.id]: "error" }));
        setRowError((e) => ({ ...e, [endpoint.id]: err instanceof Error ? err.message : "Fetch failed" }));
        setRowExpanded((x) => ({ ...x, [endpoint.id]: true }));
      }
    }
    setLoading(false);
  };

  const handleCompareOne = async (endpointId: string) => {
    const endpoint = ENDPOINTS.find((e) => e.id === endpointId);
    if (!endpoint) return;
    const baseNew = newApiUrl || (typeof window !== "undefined" ? window.location.origin : "");
    setRowStatus((s) => ({ ...s, [endpointId]: "loading" }));
    setRowError((e) => ({ ...e, [endpointId]: "" }));

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
      if (!res.ok) {
        setRowStatus((s) => ({ ...s, [endpointId]: "error" }));
        setRowError((e) => ({ ...e, [endpointId]: data.message ?? "Request failed" }));
        setRowExpanded((x) => ({ ...x, [endpointId]: true }));
        return;
      }
      const { oldResult: oldRes, newResult: newRes } = data as { oldResult: string; newResult: string };
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
      setRowExpanded((x) => ({ ...x, [endpointId]: !identical }));
    } catch (err) {
      setRowStatus((s) => ({ ...s, [endpointId]: "error" }));
      setRowError((e) => ({ ...e, [endpointId]: err instanceof Error ? err.message : "Fetch failed" }));
      setRowExpanded((x) => ({ ...x, [endpointId]: true }));
    }
  };

  const handleVergelijkAlle = () => {
    // TODO: define later
    handleCompareAll();
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

    const instruction = [
      "Fix the new API implementation so it returns the same structure and values as the old API for this endpoint. The order of keys in the structure should also match the old API. When differences exist, first check if the correct old and new API URLs/stubs are created (e.g. wrong URL routing can cause the old API to return wrong data like citycodes instead of a section). When there is a structure mismatch between the old and new API data, look in swagger description in the old documentation to resolve. Work breadth first: ie fix the first encountered mismatch, then retry etc. instead of interpreting the full object (may be very large).",
      "",
      `Endpoint: ${endpoint.label}`,
      Object.keys(parameters).length > 0 ? `Parameters: ${JSON.stringify(parameters)}` : null,
      `Status: ${resultDescription}`,
      "",
      "Old API result:",
      truncate(oldData),
      "",
      "New API result:",
      truncate(newData),
    ]
      .filter((line): line is string => line != null)
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

      <div className="max-w-4xl space-y-4 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">citycode</label>
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
                />
              )}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">locationid</label>
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
              renderInput={(params) => (
                <TextField
                  {...params}
                  placeholder={
                    optionsLoading.location
                      ? "Laden..."
                      : !paramValues.citycode
                        ? "Selecteer eerst citycode"
                        : "Typ om te zoeken..."
                  }
                  size="small"
                />
              )}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">sectionid</label>
            <select
              value={paramValues.sectionid ?? ""}
              onChange={(e) => setParamValues((p) => ({ ...p, sectionid: e.target.value }))}
              className="w-full p-2 border rounded"
              disabled={optionsLoading.section || !paramValues.locationid}
            >
              <option value="">
                {optionsLoading.section ? "Laden..." : !paramValues.locationid ? "Selecteer eerst location" : "Selecteer section"}
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
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Oude API URL</label>
            <input
              type="text"
              value={oldApiUrl}
              onChange={(e) => setOldApiUrl(e.target.value)}
              className="w-full p-2 border rounded"
              placeholder="https://remote.veiligstallen.nl"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nieuwe API URL (basis)</label>
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

        <button
          onClick={handleCompareAll}
          disabled={loading}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? "Vergelijken..." : "Vergelijk alle"}
        </button>
      </div>

      <div className="w-full min-w-0 border rounded overflow-x-auto">
        <table className="w-full text-sm table-auto">
            <thead className="bg-gray-100">
              <tr>
                <th className="text-left p-3 font-medium whitespace-nowrap">Endpoint</th>
                <th className="text-left p-3 font-medium whitespace-nowrap">Status</th>
                <th className="text-left p-3 font-medium whitespace-nowrap">Acties</th>
                <th className="text-left p-3 font-medium w-full">Resultaten</th>
              </tr>
            </thead>
            <tbody>
              {ENDPOINTS.map((e) => {
                const status = rowStatus[e.id] ?? "pending";
                const results = rowResults[e.id];
                const hasParams = e.params.length > 0;
                const expanded = rowExpanded[e.id] ?? status !== "identical";
                const hasResults = !!results || (status === "error" && rowError[e.id]);
                const bg =
                  status === "identical"
                    ? "bg-green-100"
                    : status === "diff" || status === "error"
                      ? "bg-red-100"
                      : status === "loading"
                        ? "bg-gray-50"
                        : "";
                return (
                  <tr key={e.id} className={`border-t ${bg}`}>
                    <td className="p-3 align-top whitespace-nowrap">{e.label}</td>
                    <td className="p-3 align-top whitespace-nowrap">
                      {status === "pending" && "—"}
                      {status === "loading" && "..."}
                      {status === "identical" && "Identiek"}
                      {status === "diff" && "Verschilt"}
                      {status === "error" && (
                        <span title={rowError[e.id]} className="text-red-700">
                          Fout
                        </span>
                      )}
                    </td>
                    <td className="p-3 align-top whitespace-nowrap">
                      <div className="flex flex-nowrap gap-1">
                        <button
                          type="button"
                          onClick={() => handleCompareOne(e.id)}
                          disabled={loading || status === "loading"}
                          className="px-2 py-1 text-xs font-medium rounded-full bg-blue-100 text-blue-800 hover:bg-blue-200 disabled:opacity-50"
                        >
                          Vergelijk
                        </button>
                        {hasParams && (
                          <button
                            type="button"
                            onClick={handleVergelijkAlle}
                            disabled={loading}
                            className="px-2 py-1 text-xs font-medium rounded-full bg-gray-100 text-gray-800 hover:bg-gray-200 disabled:opacity-50"
                          >
                            Vergelijk alle
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleCopyToClipboard(e)}
                          className="px-2 py-1 text-xs font-medium rounded-full bg-amber-100 text-amber-800 hover:bg-amber-200"
                          title="Kopieer fix-prompt met data naar klembord"
                        >
                          Fix prompt
                        </button>
                      </div>
                    </td>
                    <td className="p-3 align-top min-w-0">
                      {hasResults ? (
                        <div>
                          <button
                            type="button"
                            onClick={() => setRowExpanded((x) => ({ ...x, [e.id]: !expanded }))}
                            className="flex items-center gap-1 text-xs font-medium text-gray-600 hover:text-gray-900"
                          >
                            <span className="transition-transform">{expanded ? "▼" : "▶"}</span>
                            {expanded ? "Verberg" : "Toon"} resultaten
                          </button>
                          {expanded && (
                            <div className="mt-2">
                              {results ? (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 min-w-[400px]">
                                  <div>
                                    <div className="text-xs font-medium text-gray-500 mb-1">Oude API</div>
                                    <pre className="p-2 bg-white/80 rounded text-xs overflow-auto border border-gray-200 whitespace-pre-wrap break-words">
                                      {results.old}
                                    </pre>
                                  </div>
                                  <div>
                                    <div className="text-xs font-medium text-gray-500 mb-1">Nieuwe API</div>
                                    <pre className="p-2 bg-white/80 rounded text-xs overflow-auto border border-gray-200 whitespace-pre-wrap break-words">
                                      {results.new}
                                    </pre>
                                  </div>
                                </div>
                              ) : (
                                <span className="text-red-700 text-xs">{rowError[e.id]}</span>
                              )}
                            </div>
                          )}
                        </div>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
    </div>
  );
};

export default FmsApiComparePage;
