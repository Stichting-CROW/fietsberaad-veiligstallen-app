import React, { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { userHasRight } from "~/types/utils";
import { VSSecurityTopic } from "~/types/securityprofile";

const OLD_API_BASE = "https://remote.veiligstallen.nl";
const ENDPOINTS: { id: string; label: string; path: string; params: string[] }[] = [
  { id: "v2-getServerTime", label: "V2 getServerTime", path: "/v2/REST/getServerTime", params: [] },
  { id: "v2-getJsonBikeTypes", label: "V2 getJsonBikeTypes", path: "/v2/REST/getJsonBikeTypes", params: [] },
  { id: "v2-getJsonPaymentTypes", label: "V2 getJsonPaymentTypes", path: "/v2/REST/getJsonPaymentTypes", params: [] },
  { id: "v2-getJsonClientTypes", label: "V2 getJsonClientTypes", path: "/v2/REST/getJsonClientTypes", params: [] },
  { id: "v2-getJsonBikeType", label: "V2 getJsonBikeType", path: "/v2/REST/getJsonBikeType", params: ["bikeTypeID"] },
  { id: "v3-citycodes", label: "V3 citycodes", path: "/rest/v3/citycodes", params: [] },
  { id: "v3-citycode", label: "V3 citycodes/{citycode}", path: "/rest/v3/citycodes", params: ["citycode"] },
  { id: "v3-locations", label: "V3 citycodes/{citycode}/locations", path: "/rest/v3/citycodes", params: ["citycode"] },
  { id: "v3-location", label: "V3 locations/{locationid}", path: "/rest/v3/citycodes", params: ["citycode", "locationid"] },
  { id: "v3-sections", label: "V3 locations/{locationid}/sections", path: "/rest/v3/citycodes", params: ["citycode", "locationid"] },
  { id: "v3-section", label: "V3 sections/{sectionid}", path: "/rest/v3/citycodes", params: ["citycode", "locationid", "sectionid"] },
  { id: "v3-places", label: "V3 sections/{sectionid}/places", path: "/rest/v3/citycodes", params: ["citycode", "locationid", "sectionid"] },
  { id: "v3-subscriptiontypes", label: "V3 locations/{locationid}/subscriptiontypes", path: "/rest/v3/citycodes", params: ["citycode", "locationid"] },
];

const DEFAULT_PARAMS: Record<string, string> = {
  citycode: "9933",
  locationid: "9933_001",
  sectionid: "9933_001_1",
  bikeTypeID: "1",
};

function getOldUrl(endpoint: typeof ENDPOINTS[0], paramValues: Record<string, string>, oldApiBase: string): string {
  if (paramValues.citycode && endpoint.params.includes("citycode")) {
    let path = `/rest/v3/citycodes/${paramValues.citycode}`;
    if (endpoint.id === "v3-locations") return `${oldApiBase}${path}/locations`;
    if (paramValues.locationid) {
      path += `/locations/${paramValues.locationid}`;
      if (endpoint.id === "v3-subscriptiontypes") return `${oldApiBase}${path}/subscriptiontypes`;
      if (endpoint.id === "v3-sections") return `${oldApiBase}${path}/sections`;
      if (paramValues.sectionid) {
        path += `/sections/${paramValues.sectionid}`;
        if (endpoint.id === "v3-places") return `${oldApiBase}${path}/places`;
      }
      if (endpoint.id === "v3-location") return `${oldApiBase}${path}`;
    }
    if (endpoint.id === "v3-citycode") return `${oldApiBase}${path}`;
  }
  if (paramValues.bikeTypeID && endpoint.params.includes("bikeTypeID")) {
    return `${oldApiBase}/v2/REST/getJsonBikeType/${paramValues.bikeTypeID}`;
  }
  if (endpoint.id === "v3-citycodes") return `${oldApiBase}/rest/v3/citycodes`;
  return `${oldApiBase}${endpoint.path}`;
}

function getNewUrl(endpoint: typeof ENDPOINTS[0], paramValues: Record<string, string>, baseNew: string): string {
  const base = "/api/fms";
  if (endpoint.id.startsWith("v2-")) {
    const method = endpoint.path.split("/").pop() ?? "";
    if (paramValues.bikeTypeID) return `${baseNew}${base}/v2/${method}/${paramValues.bikeTypeID}`;
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

type RowStatus = "pending" | "loading" | "identical" | "diff" | "error";

const FmsApiComparePage: React.FC = () => {
  const { data: session } = useSession();
  const [paramValues, setParamValues] = useState<Record<string, string>>(DEFAULT_PARAMS);
  const [oldApiUrl, setOldApiUrl] = useState(OLD_API_BASE);
  const [newApiUrl, setNewApiUrl] = useState("");
  const [rowStatus, setRowStatus] = useState<Record<string, RowStatus>>({});
  const [rowError, setRowError] = useState<Record<string, string>>({});
  const [rowResults, setRowResults] = useState<Record<string, { old: string; new: string }>>({});
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
        const identical = responsesIdentical(oldRes, newRes);
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
      } catch (err) {
        setRowStatus((s) => ({ ...s, [endpoint.id]: "error" }));
        setRowError((e) => ({ ...e, [endpoint.id]: err instanceof Error ? err.message : "Fetch failed" }));
      }
    }
    setLoading(false);
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
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold text-gray-900 mb-6">FMS API vergelijking</h1>

      <div className="max-w-4xl space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">citycode</label>
            <input
              type="text"
              value={paramValues.citycode ?? ""}
              onChange={(e) => {
                const v = e.target.value;
                setParamValues((p) => ({
                  ...p,
                  citycode: v,
                  locationid: v ? `${v}_001` : p.locationid,
                  sectionid: v ? `${v}_001_1` : p.sectionid,
                }));
              }}
              className="w-full p-2 border rounded"
              placeholder="9933"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">locationid</label>
            <input
              type="text"
              value={paramValues.locationid ?? ""}
              onChange={(e) => setParamValues((p) => ({ ...p, locationid: e.target.value }))}
              className="w-full p-2 border rounded"
              placeholder="9933_001"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">sectionid</label>
            <input
              type="text"
              value={paramValues.sectionid ?? ""}
              onChange={(e) => setParamValues((p) => ({ ...p, sectionid: e.target.value }))}
              className="w-full p-2 border rounded"
              placeholder="9933_001_1"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">bikeTypeID</label>
            <input
              type="text"
              value={paramValues.bikeTypeID ?? ""}
              onChange={(e) => setParamValues((p) => ({ ...p, bikeTypeID: e.target.value }))}
              className="w-full p-2 border rounded"
              placeholder="1"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
        </div>

        {credentialsFromApi ? (
          <div className="text-sm text-gray-600">
            Basic Auth: geconfigureerde credentials (FMS_TEST_USER / FMS_TEST_PASS)
            <button type="button" onClick={() => setCredentialsFromApi(false)} className="ml-2 text-blue-600 hover:underline">
              Andere credentials gebruiken
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
          </div>
        )}

        <button
          onClick={handleCompareAll}
          disabled={loading}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? "Vergelijken..." : "Vergelijk alle"}
        </button>

        <div className="border rounded overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-100">
              <tr>
                <th className="text-left p-3 font-medium">Endpoint</th>
                <th className="text-left p-3 font-medium w-28">Status</th>
                <th className="text-left p-3 font-medium">Resultaten</th>
              </tr>
            </thead>
            <tbody>
              {ENDPOINTS.map((e) => {
                const status = rowStatus[e.id] ?? "pending";
                const results = rowResults[e.id];
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
                    <td className="p-3 align-top">{e.label}</td>
                    <td className="p-3 align-top">
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
                    <td className="p-3 align-top">
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
                      ) : status === "error" && rowError[e.id] ? (
                        <span className="text-red-700 text-xs">{rowError[e.id]}</span>
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
    </div>
  );
};

export default FmsApiComparePage;
