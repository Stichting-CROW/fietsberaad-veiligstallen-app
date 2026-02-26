import React from "react";
import { diff } from "deep-object-diff";

export type EndpointDef = {
  id: string;
  label: string;
  path: string;
  params: string[];
  oldPath?: string;
};

export type RowStatus = "pending" | "loading" | "identical" | "diff" | "error";

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

export type EndpointComparisonTableProps = {
  endpoints: EndpointDef[];
  paramValues: Record<string, string>;
  rowStatus: Record<string, RowStatus>;
  rowError: Record<string, string>;
  rowResults: Record<string, { old: string; new: string }>;
  rowTiming: Record<string, { oldSeconds: number; newSeconds: number }>;
  rowExpanded: Record<string, boolean>;
  loading: boolean;
  showOnlyDifferences: boolean;
  onCompareOne: (endpointId: string) => void;
  onCompareAll: () => void;
  onReset: () => void;
  onCopyToClipboard: (endpoint: EndpointDef) => void;
  onExpandedChange?: (endpointId: string, expanded: boolean) => void;
};

export const EndpointComparisonTable: React.FC<EndpointComparisonTableProps> = ({
  endpoints,
  paramValues,
  rowStatus,
  rowError,
  rowResults,
  rowTiming,
  rowExpanded,
  loading,
  showOnlyDifferences,
  onCompareOne,
  onCompareAll,
  onReset,
  onCopyToClipboard,
  onExpandedChange,
}) => {
  const setRowExpanded = (endpointId: string, expanded: boolean) => {
    onExpandedChange?.(endpointId, expanded);
  };

  return (
    <div className="w-full min-w-0 border rounded overflow-x-auto">
      <table className="w-full text-sm table-auto">
        <thead className="bg-gray-100">
          <tr>
            <th className="text-left p-3 font-medium whitespace-nowrap">Endpoint</th>
            <th className="text-left p-3 font-medium whitespace-nowrap">Status</th>
            <th className="text-left p-3 font-medium whitespace-nowrap">Timing (s)</th>
            <th className="text-left p-3 font-medium whitespace-nowrap">
              <span className="mr-2">Acties</span>
              {loading ? (
                <span className="inline-flex items-center gap-1.5 px-2 py-1 text-xs text-blue-700">
                  <span
                    className="inline-block h-3 w-3 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"
                    aria-hidden
                  />
                  Vergelijken...
                </span>
              ) : (
                <button
                  onClick={onCompareAll}
                  className="px-2 py-1 text-xs font-medium rounded-full bg-blue-100 text-blue-800 hover:bg-blue-200"
                >
                  Alles testen
                </button>
              )}
              <button
                type="button"
                onClick={onReset}
                disabled={loading}
                className="ml-1 px-2 py-1 text-xs font-medium rounded-full bg-gray-100 text-gray-800 hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Reset
              </button>
            </th>
            <th className="text-left p-3 font-medium w-full">Resultaten</th>
          </tr>
        </thead>
        <tbody>
          {endpoints.map((e) => {
            const status = rowStatus[e.id] ?? "pending";
            const results = rowResults[e.id];
            const timing = rowTiming[e.id];
            const expanded = rowExpanded[e.id] ?? false;
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
                  {status === "error" && (() => {
                    const err = rowError[e.id] ?? "";
                    const oldFail = err.includes("Oude API:");
                    const newFail = err.includes("Nieuwe API:");
                    const which = oldFail && newFail ? "beide" : oldFail ? "Oude API" : newFail ? "Nieuwe API" : "";
                    return (
                      <span title={err} className="text-red-700">
                        Fout{which ? ` (${which})` : ""}
                      </span>
                    );
                  })()}
                </td>
                <td className="p-3 align-top whitespace-nowrap text-xs text-gray-600">
                  {timing ? (
                    <>
                      <span title="Oude API">O: {timing.oldSeconds.toFixed(3)}</span>
                      {" · "}
                      <span title="Nieuwe API">N: {timing.newSeconds.toFixed(3)}</span>
                    </>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="p-3 align-top whitespace-nowrap">
                  <div className="flex flex-nowrap gap-1">
                    {loading || status === "loading" ? (
                      <span className="inline-flex items-center gap-1.5 px-2 py-1 text-xs text-blue-700">
                        <span
                          className="inline-block h-3 w-3 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"
                          aria-hidden
                        />
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onCompareOne(e.id)}
                        className="px-2 py-1 text-xs font-medium rounded-full bg-blue-100 text-blue-800 hover:bg-blue-200"
                      >
                        Vergelijk
                      </button>
                    )}
                    {hasResults && (
                      <button
                        type="button"
                        onClick={() => onCopyToClipboard(e)}
                        className="px-2 py-1 text-xs font-medium rounded-full bg-amber-100 text-amber-800 hover:bg-amber-200"
                        title="Kopieer fix-prompt met data naar klembord"
                      >
                        Fix prompt
                      </button>
                    )}
                  </div>
                </td>
                <td className="p-3 align-top min-w-0">
                  {hasResults ? (
                    <div>
                      <button
                        type="button"
                        onClick={() => setRowExpanded(e.id, !expanded)}
                        className="flex items-center gap-1 text-xs font-medium text-gray-600 hover:text-gray-900"
                      >
                        <span className="transition-transform">{expanded ? "▼" : "▶"}</span>
                        {expanded ? "Verberg" : "Toon"} resultaten
                      </button>
                      {expanded && (
                        <div className="mt-2">
                          {results ? (
                            (() => {
                              const display =
                                showOnlyDifferences && status === "diff"
                                  ? getDiffOnly(results.old, results.new)
                                  : null;
                              const oldDisplay = display?.oldOnly ?? results.old;
                              const newDisplay = display?.newOnly ?? results.new;
                              return (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 min-w-[400px]">
                                  <div>
                                    <div className="text-xs font-medium text-gray-500 mb-1">
                                      Oude API
                                      {display && (
                                        <span className="ml-1 text-amber-600">(alleen verschillen)</span>
                                      )}
                                    </div>
                                    <pre className="p-2 bg-white/80 rounded text-xs overflow-auto border border-gray-200 whitespace-pre-wrap break-words">
                                      {oldDisplay}
                                    </pre>
                                  </div>
                                  <div>
                                    <div className="text-xs font-medium text-gray-500 mb-1">
                                      Nieuwe API
                                      {display && (
                                        <span className="ml-1 text-amber-600">(alleen verschillen)</span>
                                      )}
                                    </div>
                                    <pre className="p-2 bg-white/80 rounded text-xs overflow-auto border border-gray-200 whitespace-pre-wrap break-words">
                                      {newDisplay}
                                    </pre>
                                  </div>
                                </div>
                              );
                            })()
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
  );
};
