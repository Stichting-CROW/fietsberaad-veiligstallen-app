import React, { useEffect, useState } from "react";
import Autocomplete from "@mui/material/Autocomplete";
import TextField from "@mui/material/TextField";
import { diff } from "deep-object-diff";

/**
 * Occupation (bezettingsdata) reporting API comparison: old ColdFusion
 * /rest/reporting/v2/occupation/* versus new /api/reporting/occupation/*.
 * Fetches both through the /api/protected/fms-api-compare proxy (avoids CORS,
 * forwards Basic auth).
 */

type OptionItem = { value: string; label: string };

interface OccupationEndpointDef {
  id: string;
  label: string;
  /** Endpoint uses the staticSectionId filter */
  usesSections: boolean;
  /** Endpoint uses the dynamicdata parameters */
  usesDynamicParams: boolean;
  /** Result arrays may legitimately differ in element order -> sort by id before diffing */
  sortResultById: boolean;
}

const OCCUPATION_ENDPOINTS: OccupationEndpointDef[] = [
  { id: "organisations", label: "organisations", usesSections: false, usesDynamicParams: false, sortResultById: true },
  { id: "authorities", label: "authorities", usesSections: false, usesDynamicParams: false, sortResultById: true },
  { id: "contractors", label: "contractors", usesSections: false, usesDynamicParams: false, sortResultById: true },
  { id: "surveys", label: "surveys", usesSections: false, usesDynamicParams: false, sortResultById: true },
  { id: "staticdata", label: "staticdata", usesSections: true, usesDynamicParams: false, sortResultById: false },
  { id: "dynamicdata", label: "dynamicdata", usesSections: true, usesDynamicParams: true, sortResultById: false },
];

type RowStatus = "idle" | "loading" | "identical" | "diff" | "error";

interface RowResult {
  status: RowStatus;
  oldUrl: string;
  newUrl: string;
  oldResult: string;
  newResult: string;
  oldError: string;
  newError: string;
  oldDurationSeconds: number | null;
  newDurationSeconds: number | null;
  error: string;
}

const EMPTY_ROW: RowResult = {
  status: "idle",
  oldUrl: "",
  newUrl: "",
  oldResult: "",
  newResult: "",
  oldError: "",
  newError: "",
  oldDurationSeconds: null,
  newDurationSeconds: null,
  error: "",
};

/** Sort `result` arrays by item id so element order doesn't cause diffs. */
function normalizeForDiff(parsed: unknown, sortResultById: boolean): unknown {
  if (!sortResultById) return parsed;
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    const obj = parsed as Record<string, unknown>;
    if (Array.isArray(obj.result)) {
      const sorted = [...(obj.result as unknown[])].sort((a, b) => {
        const idA = a && typeof a === "object" ? String((a as Record<string, unknown>).id ?? "") : String(a);
        const idB = b && typeof b === "object" ? String((b as Record<string, unknown>).id ?? "") : String(b);
        return idA < idB ? -1 : idA > idB ? 1 : 0;
      });
      return { ...obj, result: sorted };
    }
  }
  return parsed;
}

function getDiffOnly(
  oldJson: string,
  newJson: string,
  sortResultById: boolean
): { oldOnly: string; newOnly: string } | null {
  try {
    const oldObj = normalizeForDiff(JSON.parse(oldJson), sortResultById) as object;
    const newObj = normalizeForDiff(JSON.parse(newJson), sortResultById) as object;
    const newDiff = diff(oldObj, newObj);
    const oldDiff = diff(newObj, oldObj);
    return {
      oldOnly: JSON.stringify(oldDiff, null, 2),
      newOnly: JSON.stringify(newDiff, null, 2),
    };
  } catch {
    return null;
  }
}

function formatJson(s: string): string {
  try {
    return JSON.stringify(JSON.parse(s), null, 2);
  } catch {
    return s;
  }
}

interface OccupationComparisonSectionProps {
  oldApiUrl: string;
  newApiUrl: string;
  authUsername: string;
  authPassword: string;
  cityOptions: OptionItem[];
  locationOptions: OptionItem[];
  optionsLoading: { city: boolean; location: boolean; section: boolean };
  paramValues: Record<string, string>;
  setParamValues: React.Dispatch<React.SetStateAction<Record<string, string>>>;
}

export const OccupationComparisonSection: React.FC<OccupationComparisonSectionProps> = ({
  oldApiUrl,
  newApiUrl,
  authUsername,
  authPassword,
  cityOptions,
  locationOptions,
  optionsLoading,
  paramValues,
  setParamValues,
}) => {
  const [staticSectionId, setStaticSectionId] = useState("");
  const [startDate, setStartDate] = useState("2020-01-01T00:00:00");
  const [endDate, setEndDate] = useState("2020-02-01T00:00:00");
  const [depth, setDepth] = useState("1");
  const [contractorId, setContractorId] = useState("");
  const [page, setPage] = useState("");
  const [pageSize, setPageSize] = useState("100");
  const [orderBy, setOrderBy] = useState("");
  const [orderDirection, setOrderDirection] = useState("");
  const [groupBy, setGroupBy] = useState("");

  const [rows, setRows] = useState<Record<string, RowResult>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [loadingAll, setLoadingAll] = useState(false);

  // Prefill the staticSectionId filter from the selected stalling
  useEffect(() => {
    if (paramValues.locationid) {
      setStaticSectionId(paramValues.locationid);
    }
  }, [paramValues.locationid]);

  const buildQueryString = (endpoint: OccupationEndpointDef): string => {
    const query = new URLSearchParams();
    if (endpoint.usesSections && staticSectionId.trim()) {
      query.set("staticSectionId", staticSectionId.trim());
    }
    if (endpoint.usesDynamicParams) {
      if (startDate.trim()) query.set("startDate", startDate.trim());
      if (endDate.trim()) query.set("endDate", endDate.trim());
      if (depth.trim()) query.set("depth", depth.trim());
      if (contractorId.trim()) query.set("contractorId", contractorId.trim());
      if (page.trim()) query.set("page", page.trim());
      if (pageSize.trim()) query.set("pageSize", pageSize.trim());
      if (orderBy.trim()) query.set("orderBy", orderBy.trim());
      if (orderDirection.trim()) query.set("orderDirection", orderDirection.trim());
      if (groupBy.trim()) query.set("groupBy", groupBy.trim());
    }
    const qs = query.toString();
    return qs ? `?${qs}` : "";
  };

  const compareEndpoint = async (endpoint: OccupationEndpointDef) => {
    const oldBase = oldApiUrl || "https://remote.veiligstallen.nl";
    const newBase = newApiUrl || (typeof window !== "undefined" ? window.location.origin : "");
    const qs = buildQueryString(endpoint);
    const oldUrl = `${oldBase}/rest/reporting/v2/occupation/${endpoint.id}${qs}`;
    const newUrl = `${newBase}/api/reporting/occupation/${endpoint.id}${qs}`;

    setRows((r) => ({ ...r, [endpoint.id]: { ...EMPTY_ROW, status: "loading", oldUrl, newUrl } }));

    const body: { authorizationHeader?: string; oldUrl: string; newUrl: string } = { oldUrl, newUrl };
    if (authUsername && authPassword) {
      body.authorizationHeader = `Basic ${btoa(`${authUsername}:${authPassword}`)}`;
    }

    try {
      const res = await fetch("/api/protected/fms-api-compare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as {
        oldResult?: string;
        newResult?: string;
        oldError?: string | null;
        newError?: string | null;
        oldDurationSeconds?: number | null;
        newDurationSeconds?: number | null;
        message?: string;
      };

      if (!res.ok && !data.oldError && !data.newError) {
        setRows((r) => ({
          ...r,
          [endpoint.id]: {
            ...EMPTY_ROW,
            status: "error",
            oldUrl,
            newUrl,
            error: data.message ?? "Request mislukt",
          },
        }));
        return;
      }

      const oldResult = data.oldResult ?? "";
      const newResult = data.newResult ?? "";
      const oldError = data.oldError ?? "";
      const newError = data.newError ?? "";

      let status: RowStatus = "error";
      if (!oldError && !newError) {
        const diffResult = getDiffOnly(oldResult, newResult, endpoint.sortResultById);
        status =
          diffResult != null && diffResult.oldOnly === "{}" && diffResult.newOnly === "{}"
            ? "identical"
            : "diff";
      }

      setRows((r) => ({
        ...r,
        [endpoint.id]: {
          status,
          oldUrl,
          newUrl,
          oldResult: formatJson(oldResult),
          newResult: formatJson(newResult),
          oldError,
          newError,
          oldDurationSeconds: data.oldDurationSeconds ?? null,
          newDurationSeconds: data.newDurationSeconds ?? null,
          error: "",
        },
      }));
    } catch (err) {
      setRows((r) => ({
        ...r,
        [endpoint.id]: {
          ...EMPTY_ROW,
          status: "error",
          oldUrl,
          newUrl,
          error: err instanceof Error ? err.message : "Fetch mislukt",
        },
      }));
    }
  };

  const compareAll = async () => {
    setLoadingAll(true);
    try {
      for (const endpoint of OCCUPATION_ENDPOINTS) {
        await compareEndpoint(endpoint);
      }
    } finally {
      setLoadingAll(false);
    }
  };

  const copyDiffInstruction = (endpoint: OccupationEndpointDef, row: RowResult) => {
    const diffRecords =
      row.status === "diff" ? getDiffOnly(row.oldResult, row.newResult, endpoint.sortResultById) : null;
    const instruction = [
      "Fix the new API implementation so it returns the same structure and values as the old API for this endpoint. The order of keys in the structure should also match the old API.",
      "",
      `Endpoint: /rest/reporting/v2/occupation/${endpoint.id} (old) vs /api/reporting/occupation/${endpoint.id} (new)`,
      `Old URL: ${row.oldUrl}`,
      `New URL: ${row.newUrl}`,
      "",
      "Old API result:",
      row.oldError ? `(error) ${row.oldError}` : row.oldResult,
      "",
      "New API result:",
      row.newError ? `(error) ${row.newError}` : row.newResult,
      diffRecords
        ? [
            "",
            "Diff (oldOnly - values in old that differ from new):",
            diffRecords.oldOnly,
            "",
            "Diff (newOnly - values in new that differ from old):",
            diffRecords.newOnly,
          ]
        : null,
    ]
      .filter((line): line is string | string[] => line != null)
      .flat()
      .join("\n");
    void navigator.clipboard.writeText(instruction);
  };

  const statusLabel = (status: RowStatus): string => {
    switch (status) {
      case "loading":
        return "Bezig...";
      case "identical":
        return "Identiek";
      case "diff":
        return "Verschilt";
      case "error":
        return "Fout";
      default:
        return "—";
    }
  };

  return (
    <div>
      <p className="text-sm text-gray-600 mb-4">
        Vergelijkt de oude en nieuwe occupation-reporting-API (bezettingsdata):{" "}
        <code className="bg-gray-100 px-1 rounded">/rest/reporting/v2/occupation/*</code> (oud) versus{" "}
        <code className="bg-gray-100 px-1 rounded">/api/reporting/occupation/*</code> (nieuw). Beide
        endpoints gebruiken Basic Auth tegen{" "}
        <code className="bg-gray-100 px-1 rounded">security_users</code> (beheer-inlog). Bij{" "}
        <code className="bg-gray-100 px-1 rounded">organisations</code>,{" "}
        <code className="bg-gray-100 px-1 rounded">authorities</code>,{" "}
        <code className="bg-gray-100 px-1 rounded">contractors</code> en{" "}
        <code className="bg-gray-100 px-1 rounded">surveys</code> wordt de volgorde van de resultaten
        genormaliseerd (gesorteerd op id) voordat wordt vergeleken.
      </p>

      <div className="flex flex-wrap items-end gap-4 mb-4">
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
            slotProps={{ paper: { sx: { minWidth: 280 } } }}
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
              />
            )}
          />
        </div>
        <div className="w-auto min-w-[16rem]">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            staticSectionId (leeg = alle stallingen)
          </label>
          <input
            type="text"
            value={staticSectionId}
            onChange={(e) => setStaticSectionId(e.target.value)}
            className="w-full p-2 border rounded"
            placeholder="bijv. 1000_001,1000_002"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-4 mb-2">
        <div className="w-auto min-w-[13rem]">
          <label className="block text-sm font-medium text-gray-700 mb-1">startDate</label>
          <input
            type="text"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="w-full p-2 border rounded"
            placeholder="2020-01-01T00:00:00"
          />
        </div>
        <div className="w-auto min-w-[13rem]">
          <label className="block text-sm font-medium text-gray-700 mb-1">endDate</label>
          <input
            type="text"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="w-full p-2 border rounded"
            placeholder="2020-02-01T00:00:00"
          />
        </div>
        <div className="w-auto min-w-[5rem]">
          <label className="block text-sm font-medium text-gray-700 mb-1">depth</label>
          <select value={depth} onChange={(e) => setDepth(e.target.value)} className="w-full p-2 border rounded">
            <option value="1">1</option>
            <option value="2">2</option>
          </select>
        </div>
        <div className="w-auto min-w-[8rem]">
          <label className="block text-sm font-medium text-gray-700 mb-1">contractorId</label>
          <input
            type="text"
            value={contractorId}
            onChange={(e) => setContractorId(e.target.value)}
            className="w-full p-2 border rounded"
            placeholder="bijv. fms"
          />
        </div>
        <div className="w-auto min-w-[5rem]">
          <label className="block text-sm font-medium text-gray-700 mb-1">page</label>
          <input
            type="number"
            min={1}
            value={page}
            onChange={(e) => setPage(e.target.value)}
            className="w-full p-2 border rounded"
            placeholder="1"
          />
        </div>
        <div className="w-auto min-w-[6rem]">
          <label className="block text-sm font-medium text-gray-700 mb-1">pageSize</label>
          <input
            type="number"
            min={1}
            value={pageSize}
            onChange={(e) => setPageSize(e.target.value)}
            className="w-full p-2 border rounded"
            placeholder="1000"
          />
        </div>
        <div className="w-auto min-w-[9rem]">
          <label className="block text-sm font-medium text-gray-700 mb-1">orderBy</label>
          <select value={orderBy} onChange={(e) => setOrderBy(e.target.value)} className="w-full p-2 border rounded">
            <option value="">(standaard)</option>
            <option value="timestamp">timestamp</option>
            <option value="parkingCapacity">parkingCapacity</option>
            <option value="occupiedSpaces">occupiedSpaces</option>
            <option value="vacantSpaces">vacantSpaces</option>
          </select>
        </div>
        <div className="w-auto min-w-[7rem]">
          <label className="block text-sm font-medium text-gray-700 mb-1">orderDirection</label>
          <select
            value={orderDirection}
            onChange={(e) => setOrderDirection(e.target.value)}
            className="w-full p-2 border rounded"
          >
            <option value="">(standaard)</option>
            <option value="ASC">ASC</option>
            <option value="DESC">DESC</option>
          </select>
        </div>
        <div className="w-auto min-w-[9rem]">
          <label className="block text-sm font-medium text-gray-700 mb-1">groupBy</label>
          <select value={groupBy} onChange={(e) => setGroupBy(e.target.value)} className="w-full p-2 border rounded">
            <option value="">(geen)</option>
            <option value="staticSectionId">staticSectionId</option>
          </select>
        </div>
        <button
          type="button"
          onClick={() => void compareAll()}
          disabled={loadingAll}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
        >
          {loadingAll ? "Bezig..." : "Vergelijk alles"}
        </button>
      </div>
      <p className="text-xs text-gray-500 mb-4">
        De datum-, pagina- en sorteervelden gelden alleen voor{" "}
        <code className="bg-gray-100 px-1 rounded">dynamicdata</code>;{" "}
        <code className="bg-gray-100 px-1 rounded">staticSectionId</code> geldt voor{" "}
        <code className="bg-gray-100 px-1 rounded">staticdata</code> en{" "}
        <code className="bg-gray-100 px-1 rounded">dynamicdata</code>.
      </p>

      <div className="overflow-x-auto mb-6">
        <table className="min-w-full text-sm border">
          <thead>
            <tr className="bg-gray-100 text-left">
              <th className="p-2">Endpoint</th>
              <th className="p-2">Status</th>
              <th className="p-2">Oud (s)</th>
              <th className="p-2">Nieuw (s)</th>
              <th className="p-2">Acties</th>
            </tr>
          </thead>
          <tbody>
            {OCCUPATION_ENDPOINTS.map((endpoint) => {
              const row = rows[endpoint.id] ?? EMPTY_ROW;
              const isExpanded = !!expanded[endpoint.id];
              const diffRecords =
                row.status === "diff"
                  ? getDiffOnly(row.oldResult, row.newResult, endpoint.sortResultById)
                  : null;
              return (
                <React.Fragment key={endpoint.id}>
                  <tr
                    className={`border-t ${
                      row.status === "identical"
                        ? "bg-green-50"
                        : row.status === "diff" || row.status === "error"
                          ? "bg-red-50"
                          : ""
                    }`}
                  >
                    <td className="p-2 font-mono">{endpoint.label}</td>
                    <td className="p-2">
                      {statusLabel(row.status)}
                      {row.status === "error" && (row.error || row.oldError || row.newError) && (
                        <span className="text-red-700">
                          {" "}
                          – {(row.error || row.oldError || row.newError).slice(0, 120)}
                        </span>
                      )}
                    </td>
                    <td className="p-2">{row.oldDurationSeconds ?? "—"}</td>
                    <td className="p-2">{row.newDurationSeconds ?? "—"}</td>
                    <td className="p-2 whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => void compareEndpoint(endpoint)}
                        disabled={row.status === "loading" || loadingAll}
                        className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 mr-2"
                      >
                        Vergelijk
                      </button>
                      {row.status !== "idle" && row.status !== "loading" && (
                        <>
                          <button
                            type="button"
                            onClick={() => setExpanded((e) => ({ ...e, [endpoint.id]: !isExpanded }))}
                            className="px-3 py-1 bg-gray-200 text-gray-800 rounded hover:bg-gray-300 mr-2"
                          >
                            {isExpanded ? "Verberg" : "Details"}
                          </button>
                          {row.status === "diff" && (
                            <button
                              type="button"
                              onClick={() => copyDiffInstruction(endpoint, row)}
                              className="px-3 py-1 bg-gray-200 text-gray-800 rounded hover:bg-gray-300"
                            >
                              Kopieer diff
                            </button>
                          )}
                        </>
                      )}
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr className="border-t">
                      <td colSpan={5} className="p-3 bg-gray-50">
                        {diffRecords && (diffRecords.oldOnly !== "{}" || diffRecords.newOnly !== "{}") && (
                          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
                            <div className="min-w-0">
                              <h4 className="text-xs font-semibold text-gray-800 mb-1">
                                Diff: alleen in oude API (of afwijkend)
                              </h4>
                              <pre className="bg-white border rounded p-2 text-xs overflow-auto max-h-[30vh] whitespace-pre-wrap break-words">
                                {diffRecords.oldOnly}
                              </pre>
                            </div>
                            <div className="min-w-0">
                              <h4 className="text-xs font-semibold text-gray-800 mb-1">
                                Diff: alleen in nieuwe API (of afwijkend)
                              </h4>
                              <pre className="bg-white border rounded p-2 text-xs overflow-auto max-h-[30vh] whitespace-pre-wrap break-words">
                                {diffRecords.newOnly}
                              </pre>
                            </div>
                          </div>
                        )}
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                          <div className="min-w-0">
                            <h4 className="text-xs font-semibold text-gray-800 mb-1">Oude API</h4>
                            {row.oldUrl && (
                              <p className="text-xs text-gray-600 mb-2 break-all">
                                <code className="bg-gray-100 px-1 rounded">{row.oldUrl}</code>
                              </p>
                            )}
                            {row.oldError ? (
                              <div className="bg-red-50 border border-red-300 rounded p-2 text-xs text-red-700 break-words">
                                Fout: {row.oldError}
                              </div>
                            ) : (
                              <pre className="bg-white border rounded p-2 text-xs overflow-auto max-h-[50vh] whitespace-pre-wrap break-words">
                                {row.oldResult}
                              </pre>
                            )}
                          </div>
                          <div className="min-w-0">
                            <h4 className="text-xs font-semibold text-gray-800 mb-1">Nieuwe API</h4>
                            {row.newUrl && (
                              <p className="text-xs text-gray-600 mb-2 break-all">
                                <code className="bg-gray-100 px-1 rounded">{row.newUrl}</code>
                              </p>
                            )}
                            {row.newError ? (
                              <div className="bg-red-50 border border-red-300 rounded p-2 text-xs text-red-700 break-words">
                                Fout: {row.newError}
                              </div>
                            ) : (
                              <pre className="bg-white border rounded p-2 text-xs overflow-auto max-h-[50vh] whitespace-pre-wrap break-words">
                                {row.newResult}
                              </pre>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
