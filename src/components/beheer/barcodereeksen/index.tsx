import React, { useState, useEffect, useCallback, useMemo } from "react";
import type { VSBarcodereeksApi } from "~/types/barcodereeksen";
import type { BarcodereeksType } from "~/types/barcodereeksen";
import { Table } from "~/components/common/Table";
import { BarcodereeksModal, type BarcodereeksModalMode } from "./BarcodereeksModal";
import { LoadingSpinner } from "~/components/beheer/common/LoadingSpinner";

function formatDatum(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  return `${day}-${month}-${year}`;
}

/** Row with client-computed tree fields (single child level only: 0=root, 1=child) */
type EnrichedRow = VSBarcodereeksApi & {
  level: 0 | 1;
  rootLabel: string;
  rootId: number; /* ID of root parent; for sorting children under their parent */
};

function enrichWithTreeFields(rows: VSBarcodereeksApi[]): EnrichedRow[] {
  const byId = new Map<number, VSBarcodereeksApi>();
  for (const r of rows) byId.set(r.ID, r);

  return rows.map((r) => {
    const level: 0 | 1 = r.parentID == null ? 0 : 1;
    const root = r.parentID == null ? r : byId.get(r.parentID) ?? r;
    return {
      ...r,
      level,
      rootLabel: root.label ?? "",
      rootId: r.parentID ?? r.ID,
    };
  });
}

interface BarcodereeksenComponentProps {
  type: BarcodereeksType;
}

export const BarcodereeksenComponent: React.FC<BarcodereeksenComponentProps> = ({ type }) => {
  const typeLabel = type === "sleutelhanger" ? "Sleutelhangers" : "Fietsstickers";
  const [list, setList] = useState<VSBarcodereeksApi[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [modalContent, setModalContent] = useState<BarcodereeksModalMode | null>(null);
  const [sortColumn, setSortColumn] = useState<string>("Label");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [groupByLabel, setGroupByLabel] = useState(true);
  const [filterLabel, setFilterLabel] = useState("");

  const loadList = useCallback(async (silent = false, selectId?: number) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/protected/barcodereeksen?type=${type}`);
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Fout bij laden");
        setList([]);
        return;
      }
      const data = (json.data ?? []) as VSBarcodereeksApi[];
      setList(data);
      const firstSelectable = data.find((r) => {
        if (r.parentID != null) return false;
        try {
          return BigInt(r.rangeStart) <= BigInt(r.rangeEnd);
        } catch {
          return false;
        }
      });
      const isSelectable = (r: VSBarcodereeksApi) =>
        r.parentID == null && (() => {
          try { return BigInt(r.rangeStart) <= BigInt(r.rangeEnd); } catch { return false; }
        })();
      setSelectedId((prev) => {
        if (data.length === 0) return null;
        if (selectId != null) {
          const target = data.find((r) => r.ID === selectId);
          if (target && isSelectable(target)) return selectId;
        }
        const current = data.find((r) => r.ID === prev);
        const currentSelectable = current != null && isSelectable(current);
        if (currentSelectable) return prev;
        return firstSelectable?.ID ?? null;
      });
    } catch (e) {
      setError("Fout bij laden");
      setList([]);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [type]);

  useEffect(() => {
    loadList();
  }, [loadList]);

  const isFullSeries = (row: VSBarcodereeksApi) => {
    try {
      const start = BigInt(row.rangeStart);
      const end = BigInt(row.rangeEnd);
      return start > end;
    } catch {
      return true;
    }
  };

  /** Uitgifte only allowed for roots (level 0, no parent); only roots are selectable */
  const isRoot = (row: VSBarcodereeksApi) => row.parentID == null;
  const canSelect = (row: VSBarcodereeksApi) => isRoot(row) && !isFullSeries(row);
  const hasChildren = (row: VSBarcodereeksApi) => list.some((r) => r.parentID === row.ID);

  const selectedRow = selectedId != null ? list.find((r) => r.ID === selectedId) ?? null : null;
  const canUitgifte = selectedRow != null && canSelect(selectedRow);

  const handleSort = useCallback((header: string) => {
    if (sortColumn === header) {
      setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortColumn(header);
      setSortDirection("asc");
    }
  }, [sortColumn]);

  const enrichedList = useMemo(() => enrichWithTreeFields(list), [list]);

  const showHierarchy = sortColumn === "Label" && groupByLabel;

  const sortedList = useMemo(() => {
    const col = sortColumn;
    const dir = sortDirection;
    return [...enrichedList].sort((a, b) => {
      let cmp = 0;
      switch (col) {
        case "Label": {
          const ar = a as EnrichedRow;
          const br = b as EnrichedRow;
          const labelA = (a.label ?? "").trim();
          const labelB = (b.label ?? "").trim();
          if (showHierarchy) {
            if (dir === "asc") {
              cmp = ar.rootLabel.localeCompare(br.rootLabel);
            } else {
              cmp = br.rootLabel.localeCompare(ar.rootLabel);
            }
            if (cmp === 0) cmp = ar.rootId - br.rootId;
            if (cmp === 0) cmp = ar.level - br.level;
            if (cmp === 0) cmp = BigInt(a.rangeStart) < BigInt(b.rangeStart) ? -1 : BigInt(a.rangeStart) > BigInt(b.rangeStart) ? 1 : 0;
          } else {
            if (dir === "asc") {
              cmp = labelA.localeCompare(labelB);
            } else {
              cmp = labelB.localeCompare(labelA);
            }
            if (cmp === 0) cmp = BigInt(a.rangeStart) < BigInt(b.rangeStart) ? -1 : BigInt(a.rangeStart) > BigInt(b.rangeStart) ? 1 : 0;
          }
          break;
        }
        case "Materiaal":
          cmp = (a.material ?? "").localeCompare(b.material ?? "");
          break;
        case "Drukproef":
          cmp = (a.printSample ?? "").localeCompare(b.printSample ?? "");
          break;
        case "Range start":
          try {
            const sa = BigInt(a.rangeStart);
            const sb = BigInt(b.rangeStart);
            cmp = sa < sb ? -1 : sa > sb ? 1 : 0;
          } catch {
            cmp = 0;
          }
          break;
        case "Range eind":
          try {
            const ea = BigInt(a.rangeEnd);
            const eb = BigInt(b.rangeEnd);
            cmp = ea < eb ? -1 : ea > eb ? 1 : 0;
          } catch {
            cmp = 0;
          }
          break;
        case "Datum": {
          const da = new Date(a.published ?? a.created ?? 0).getTime();
          const db = new Date(b.published ?? b.created ?? 0).getTime();
          cmp = da - db;
          break;
        }
        case "Uitgegeven":
          cmp = (a.uitgegeven ?? 0) - (b.uitgegeven ?? 0);
          break;
        case "Totaal":
          cmp = (a.totaal ?? 0) - (b.totaal ?? 0);
          break;
        default:
          return 0;
      }
      if (col === "Label") return cmp;
      return dir === "asc" ? cmp : -cmp;
    });
  }, [enrichedList, sortColumn, sortDirection, groupByLabel]);

  const filteredList = useMemo(() => {
    const q = filterLabel.trim().toLowerCase();
    if (!q) return sortedList;
    if (!groupByLabel) {
      return sortedList.filter((r) => (r.label ?? "").toLowerCase().includes(q));
    }
    const matchingIds = new Set<number>();
    for (const r of sortedList) {
      if ((r.label ?? "").toLowerCase().includes(q)) {
        matchingIds.add(r.ID);
        if (r.parentID != null) {
          matchingIds.add(r.parentID);
          for (const c of sortedList) {
            if (c.parentID === r.parentID) matchingIds.add(c.ID);
          }
        }
        for (const c of sortedList) {
          if (c.parentID === r.ID) matchingIds.add(c.ID);
        }
      }
    }
    return sortedList.filter((r) => matchingIds.has(r.ID));
  }, [sortedList, filterLabel, groupByLabel]);

  const openNewModal = async () => {
    setError(null);
    let suggested = "";
    try {
      const res = await fetch(`/api/protected/barcodereeksen/new?type=${type}`);
      const json = await res.json();
      if (res.ok && json.data?.suggestedRangeStart != null) {
        suggested = String(json.data.suggestedRangeStart);
      }
    } catch {
      // ignore
    }
    setModalContent({ mode: "create", suggestedRangeStart: suggested });
  };

  const openEditModal = (row: VSBarcodereeksApi) => {
    setModalContent({ mode: "edit", row });
    setError(null);
  };

  const openUitgifteModal = () => {
    if (!selectedId) return;
    const row = list.find((r) => r.ID === selectedId);
    if (!row || !canSelect(row)) return;
    setModalContent({ mode: "uitgifte", parent: row });
    setError(null);
  };

  if (loading) {
    return <LoadingSpinner message={`${typeLabel} laden...`} />;
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-black mb-4">Uitgifte {typeLabel}</h1>

      {error && (
        <div className="mt-2 p-2 bg-red-100 border border-red-400 text-red-700 rounded">
          {error}
        </div>
      )}

      {/* Nieuwe reeks block */}
      <div className="mb-6 flex flex-nowrap items-center gap-2">
          <button
            onClick={openNewModal}
            className="bg-gray-500 hover:bg-gray-700 text-white font-bold py-2 px-4 rounded"
          >
            Nieuwe reeks
          </button>
          <button
            onClick={openUitgifteModal}
            disabled={!canUitgifte}
            className="bg-gray-500 hover:bg-gray-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-bold py-2 px-4 rounded"
          >
            Uitgifte vanuit bestaande voorraad{selectedRow ? ` ${selectedRow.label ?? "—"}` : ""}
          </button>
      </div>

      <div className="mb-4 flex items-center gap-2">
        <label htmlFor="filter-label" className="text-sm font-medium">Filter</label>
        <input
          id="filter-label"
          type="text"
          value={filterLabel}
          onChange={(e) => setFilterLabel(e.target.value)}
          placeholder="Filter op label..."
          className="border border-gray-300 rounded px-2 py-1 text-sm w-48"
        />
        {filterLabel && (
          <button
            type="button"
            onClick={() => setFilterLabel("")}
            aria-label="Filter wissen"
            className="text-gray-500 hover:text-gray-700 text-lg leading-none"
          >
            ×
          </button>
        )}
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <Table<VSBarcodereeksApi>
          columns={[
            {
              header: "",
              accessor: (row) =>
                canSelect(row) ? (
                  <input
                    type="radio"
                    name="reeks"
                    checked={selectedId === row.ID}
                    onChange={() => setSelectedId(row.ID)}
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <span className="text-gray-400">—</span>
                ),
            },
            {
              header: "Label",
              headerContent: (
                <span className="flex items-center gap-3">
                  <span>Label</span>
                  {sortColumn === "Label" && (
                    <span className="ml-1">{sortDirection === "desc" ? "▼" : "▲"}</span>
                  )}
                  <label
                    className="flex items-center gap-1.5 text-sm font-normal cursor-pointer"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <input
                      type="checkbox"
                      checked={groupByLabel}
                      onChange={(e) => setGroupByLabel(e.target.checked)}
                      onClick={(e) => e.stopPropagation()}
                    />
                    groeperen
                  </label>
                </span>
              ),
              accessor: (row) => {
                const r = row as EnrichedRow;
                if (showHierarchy) {
                  return (
                    <span className="flex items-center gap-1.5" style={{ paddingLeft: r.level * 8 }}>
                      {r.level > 0 && (
                        <span className="text-black select-none" aria-hidden>
                          •
                        </span>
                      )}
                      {row.label ?? "—"}
                    </span>
                  );
                }
                return <span>{row.label ?? "—"}</span>;
              },
            },
            { header: "Materiaal", accessor: (row) => row.material ?? "—" },
            { header: "Drukproef", accessor: (row) => row.printSample ?? "—" },
            {
              header: "Range start",
              accessor: (row) => (isFullSeries(row) ? "—" : row.rangeStart),
            },
            {
              header: "Range eind",
              accessor: (row) => (isFullSeries(row) ? "—" : row.rangeEnd),
            },
            {
              header: "Datum",
              accessor: (row) => formatDatum(row.published ?? row.created),
            },
            { header: "Uitgegeven", accessor: (row) => row.uitgegeven },
            { header: "Totaal", accessor: (row) => row.totaal },
            {
              header: "Acties",
              accessor: (row) => (
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      openEditModal(row);
                    }}
                    className="text-yellow-600 hover:text-yellow-800"
                    title="Bewerken"
                  >
                    ✏️
                  </button>
                  <button
                    type="button"
                    disabled={hasChildren(row)}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (hasChildren(row)) return;
                      if (confirm("Weet u zeker dat u deze reeks wilt verwijderen?")) {
                        fetch(`/api/protected/barcodereeksen/${row.ID}`, { method: "DELETE" })
                          .then(async (r) => {
                            if (r.ok) loadList(true);
                            else {
                              try {
                                const json = await r.json();
                                setError(json?.error || "Fout bij verwijderen");
                              } catch {
                                setError("Fout bij verwijderen");
                              }
                            }
                          });
                      }
                    }}
                    className={hasChildren(row) ? "text-gray-300 cursor-not-allowed" : "text-red-600 hover:text-red-800"}
                    title={hasChildren(row) ? "Verwijderen niet mogelijk: reeks heeft subreeksen" : "Verwijderen"}
                  >
                    🗑️
                  </button>
                </div>
              ),
            },
          ]}
          data={filteredList}
          getRowClassName={(row) => (isFullSeries(row) ? "bg-gray-100 text-gray-500" : "")}
          className="min-w-full bg-white"
          sortableColumns={["Label", "Materiaal", "Drukproef", "Range start", "Range eind", "Datum", "Uitgegeven", "Totaal"]}
          sortColumn={sortColumn}
          sortDirection={sortDirection}
          onSort={handleSort}
        />
      </div>

      {/* Modal: Nieuwe reeks / Uitgifte / Reeks bewerken */}
      {modalContent && (
        <BarcodereeksModal
          key={
            modalContent.mode === "edit"
              ? `edit-${modalContent.row.ID}`
              : modalContent.mode === "uitgifte"
                ? `uitgifte-${modalContent.parent.ID}`
                : "new"
          }
          type={type}
          typeLabel={typeLabel}
          content={modalContent}
          onClose={() => setModalContent(null)}
          onSaved={(newId) => {
            setModalContent(null);
            loadList(true, newId);
          }}
          onError={setError}
        />
      )}

    </div>
  );
};

export default BarcodereeksenComponent;

