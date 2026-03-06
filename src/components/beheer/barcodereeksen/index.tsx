import React, { useState, useEffect, useCallback, useMemo } from "react";
import type { VSBarcodereeksApi } from "~/types/barcodereeksen";
import type { BarcodereeksType } from "~/types/barcodereeksen";
import { Button } from "~/components/Button";
import { Table } from "~/components/common/Table";
import Modal from "~/components/Modal";
import FormInput from "~/components/Form/FormInput";
import { LoadingSpinner } from "~/components/beheer/common/LoadingSpinner";

function formatDatum(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  return `${day}-${month}-${year}`;
}

const TITLES: Record<BarcodereeksType, string> = {
  sleutelhanger: "Uitgegeven sleutelhangers",
  sticker: "Uitgegeven fietsstickers",
};

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
  const [list, setList] = useState<VSBarcodereeksApi[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [modalNew, setModalNew] = useState(false);
  const [modalEdit, setModalEdit] = useState<VSBarcodereeksApi | null>(null);
  const [modalUitgifte, setModalUitgifte] = useState<VSBarcodereeksApi | null>(null);
  const [suggestedRangeStart, setSuggestedRangeStart] = useState<string>("");
  const [sortColumn, setSortColumn] = useState<string>("Label");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [groupByLabel, setGroupByLabel] = useState(true);

  const loadList = useCallback(async () => {
    setLoading(true);
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
      setSelectedId((prev) => {
        if (data.length === 0) return null;
        const current = data.find((r) => r.ID === prev);
        const currentSelectable = current != null && current.parentID == null && (() => {
          try { return BigInt(current.rangeStart) <= BigInt(current.rangeEnd); } catch { return false; }
        })();
        if (currentSelectable) return prev;
        return firstSelectable?.ID ?? null;
      });
    } catch (e) {
      setError("Fout bij laden");
      setList([]);
    } finally {
      setLoading(false);
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

  const openNewModal = async () => {
    setError(null);
    try {
      const res = await fetch(`/api/protected/barcodereeksen/new?type=${type}`);
      const json = await res.json();
      if (res.ok && json.data?.suggestedRangeStart != null) {
        setSuggestedRangeStart(String(json.data.suggestedRangeStart));
      } else {
        setSuggestedRangeStart("");
      }
    } catch {
      setSuggestedRangeStart("");
    }
    setModalNew(true);
  };

  const openEditModal = (row: VSBarcodereeksApi) => {
    setModalEdit(row);
    setError(null);
  };

  const openUitgifteModal = () => {
    if (!selectedId) return;
    const row = list.find((r) => r.ID === selectedId);
    if (!row || !canSelect(row)) return;
    setModalUitgifte(row);
    setError(null);
  };

  if (loading) {
    return <LoadingSpinner message="Reeksen laden..." />;
  }

  return (
    <div className="bg-gray-200 border-2 border-gray-400 p-2 pl-4 rounded mb-2">
      <h1 className="text-2xl font-bold text-blue-700 mb-4">{TITLES[type]}</h1>

      {error && (
        <div className="mt-2 p-2 bg-red-100 border border-red-400 text-red-700 rounded">
          {error}
        </div>
      )}

      {/* Nieuwe reeks block */}
      <div className="mb-6 p-4 bg-white rounded border border-gray-300">
        <h2 className="text-lg font-semibold mb-2">Nieuwe reeks</h2>
        <p className="text-sm text-gray-600 mb-3">
          Bij uitgifte uit bestaande reeks: selecteer hieronder de reeks van waaruit je barcodes wilt uitgeven.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={openUitgifteModal} disabled={!canUitgifte}>
            Uitgifte vanuit bestaande voorraad{selectedRow ? ` ${selectedRow.label ?? "—"}` : ""}
          </Button>
          <Button onClick={openNewModal}>Nieuwe reeks</Button>
        </div>
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
                            if (r.ok) loadList();
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
          data={sortedList}
          getRowClassName={(row) => (isFullSeries(row) ? "bg-gray-100 text-gray-500" : "")}
          className="min-w-full bg-white"
          sortableColumns={["Label", "Materiaal", "Drukproef", "Range start", "Range eind", "Datum", "Uitgegeven", "Totaal"]}
          sortColumn={sortColumn}
          sortDirection={sortDirection}
          onSort={handleSort}
        />
      </div>

      {/* Modal: Nieuwe reeks */}
      {modalNew && (
        <BarcodereeksNewModal
          type={type}
          suggestedRangeStart={suggestedRangeStart}
          onClose={() => setModalNew(false)}
          onSaved={() => {
            setModalNew(false);
            loadList();
          }}
          onError={setError}
        />
      )}

      {/* Modal: Reeks bewerken */}
      {modalEdit && (
        <BarcodereeksEditModal
          row={modalEdit}
          onClose={() => setModalEdit(null)}
          onSaved={() => {
            setModalEdit(null);
            loadList();
          }}
          onError={setError}
        />
      )}

      {/* Modal: Uitgifte vanuit bestaande voorraad */}
      {modalUitgifte && (
        <BarcodereeksUitgifteModal
          key={`uitgifte-${modalUitgifte.ID}`}
          type={type}
          parent={modalUitgifte}
          onClose={() => setModalUitgifte(null)}
          onSaved={() => {
            setModalUitgifte(null);
            loadList();
          }}
          onError={setError}
        />
      )}
    </div>
  );
};

export default BarcodereeksenComponent;

// --- New series form ---
function BarcodereeksNewModal({
  type,
  suggestedRangeStart,
  onClose,
  onSaved,
  onError,
}: {
  type: BarcodereeksType;
  suggestedRangeStart: string;
  onClose: () => void;
  onSaved: () => void;
  onError: (s: string | null) => void;
}) {
  const [label, setLabel] = useState("");
  const [material, setMaterial] = useState("");
  const [printSample, setPrintSample] = useState("");
  const [rangeStart, setRangeStart] = useState(suggestedRangeStart);
  const [rangeEnd, setRangeEnd] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setRangeStart(suggestedRangeStart);
  }, [suggestedRangeStart]);


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    onError(null);
    try {
      const res = await fetch("/api/protected/barcodereeksen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          label: label || null,
          material: material || null,
          printSample: printSample || null,
          rangeStart: rangeStart || "0",
          rangeEnd: rangeEnd || "0",
        }),
      });
      const json = await res.json();
      if (res.ok) {
        onSaved();
      } else {
        const msg = json.error || "Fout bij opslaan";
        setError(msg);
        onError(msg);
      }
    } catch {
      const msg = "Fout bij opslaan";
      setError(msg);
      onError(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal onClose={onClose} clickOutsideClosesDialog={false}>
      <div>
        <h2 className="font-bold mb-4">Nieuwe reeks</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="p-2 bg-red-100 border border-red-400 text-red-700 rounded text-sm">
              {error}
            </div>
          )}
          <div>
            <label className="block text-sm font-medium mb-1">Label</label>
            <FormInput value={label} onChange={(e) => setLabel(e.target.value)} className="border-gray-700 rounded-full" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Materiaal</label>
            <FormInput value={material} onChange={(e) => setMaterial(e.target.value)} className="border-gray-700 rounded-full" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Drukproef</label>
            <FormInput value={printSample} onChange={(e) => setPrintSample(e.target.value)} className="border-gray-700 rounded-full" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Start range</label>
            <FormInput type="text" value={rangeStart} onChange={(e) => setRangeStart(e.target.value.replace(/[^0-9]/g, ""))} className="border-gray-700 rounded-full" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">End range</label>
            <FormInput type="text" value={rangeEnd} onChange={(e) => setRangeEnd(e.target.value.replace(/[^0-9]/g, ""))} className="border-gray-700 rounded-full" required />
          </div>
          <div className="flex gap-2">
            <Button disabled={saving}>{saving ? "Bezig..." : "Opslaan"}</Button>
            <Button onClick={onClose}>Afbreken</Button>
          </div>
        </form>
      </div>
    </Modal>
  );
}

// --- Edit series form ---
function BarcodereeksEditModal({
  row,
  onClose,
  onSaved,
  onError,
}: {
  row: VSBarcodereeksApi;
  onClose: () => void;
  onSaved: () => void;
  onError: (s: string | null) => void;
}) {
  const [label, setLabel] = useState(row.label ?? "");
  const [material, setMaterial] = useState(row.material ?? "");
  const [printSample, setPrintSample] = useState(row.printSample ?? "");
  const [rangeStart, setRangeStart] = useState(row.rangeStart);
  const [rangeEnd, setRangeEnd] = useState(row.rangeEnd);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    onError(null);
    try {
      const res = await fetch(`/api/protected/barcodereeksen/${row.ID}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: label || null,
          material: material || null,
          printSample: printSample || null,
          rangeStart,
          rangeEnd,
        }),
      });
      const json = await res.json();
      if (res.ok) {
        onSaved();
      } else {
        const msg = json.error || "Fout bij opslaan";
        setError(msg);
        onError(msg);
      }
    } catch {
      const msg = "Fout bij opslaan";
      setError(msg);
      onError(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal onClose={onClose} clickOutsideClosesDialog={false}>
      <div>
        <h2 className="font-bold mb-4">Reeks bewerken</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="p-2 bg-red-100 border border-red-400 text-red-700 rounded text-sm">
              {error}
            </div>
          )}
          <div>
            <label className="block text-sm font-medium mb-1">Label</label>
            <FormInput value={label} onChange={(e) => setLabel(e.target.value)} className="border-gray-700 rounded-full" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Materiaal</label>
            <FormInput value={material} onChange={(e) => setMaterial(e.target.value)} className="border-gray-700 rounded-full" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Drukproef</label>
            <FormInput value={printSample} onChange={(e) => setPrintSample(e.target.value)} className="border-gray-700 rounded-full" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Start range</label>
            <FormInput type="text" value={rangeStart} onChange={(e) => setRangeStart(e.target.value.replace(/[^0-9]/g, ""))} className="border-gray-700 rounded-full" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">End range</label>
            <FormInput type="text" value={rangeEnd} onChange={(e) => setRangeEnd(e.target.value.replace(/[^0-9]/g, ""))} className="border-gray-700 rounded-full" required />
          </div>
          <div className="flex gap-2">
            <Button disabled={saving}>{saving ? "Bezig..." : "Opslaan"}</Button>
            <Button onClick={onClose}>Afbreken</Button>
          </div>
        </form>
      </div>
    </Modal>
  );
}

// --- Uitgifte vanuit bestaande voorraad ---
function BarcodereeksUitgifteModal({
  type,
  parent,
  onClose,
  onSaved,
  onError,
}: {
  type: BarcodereeksType;
  parent: VSBarcodereeksApi;
  onClose: () => void;
  onSaved: () => void;
  onError: (s: string | null) => void;
}) {
  const parentStart = BigInt(parent.rangeStart);
  const parentEnd = BigInt(parent.rangeEnd);

  const [label, setLabel] = useState("");
  const [material, setMaterial] = useState(parent.material ?? "");
  const [printSample, setPrintSample] = useState(parent.printSample ?? "");
  const [amount, setAmount] = useState("");
  const [rangeEnd, setRangeEnd] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setMaterial(parent.material ?? "");
    setPrintSample(parent.printSample ?? "");
  }, [parent.ID, parent.material, parent.printSample]);

  const handleAmountChange = (value: string) => {
    const digitsOnly = value.replace(/[^0-9]/g, "");
    setAmount(digitsOnly);
    const n = parseInt(digitsOnly, 10);
    if (!isNaN(n) && n >= 1 && n <= parent.totaal) {
      try {
        setRangeEnd(String(parentStart + BigInt(n) - BigInt(1)));
      } catch {
        // ignore
      }
    }
  };

  const handleRangeEndChange = (value: string) => {
    const digitsOnly = value.replace(/[^0-9]/g, "");
    setRangeEnd(digitsOnly);
    const trimmed = digitsOnly.trim();
    if (trimmed === "") return;
    try {
      const end = BigInt(trimmed);
      if (end >= parentStart && end <= parentEnd) {
        const n = Number(end - parentStart + BigInt(1));
        if (n >= 1 && n <= parent.totaal) setAmount(String(n));
      }
    } catch {
      // ignore
    }
  };

  let amountFromRange: number | null = null;
  let validRange = false;
  try {
    if (rangeEnd.trim() !== "") {
      const end = BigInt(rangeEnd.trim());
      if (end >= parentStart && end <= parentEnd) {
        amountFromRange = Number(end - parentStart + BigInt(1));
        validRange = amountFromRange >= 1 && amountFromRange <= parent.totaal;
      }
    }
  } catch {
    // invalid number
  }

  const remainingStart = validRange ? String(BigInt(rangeEnd.trim()) + BigInt(1)) : parent.rangeStart;
  const voorraadreeksLabel = parent.label ?? "—";
  const voorraadreeksRange = validRange
    ? `Range: ${remainingStart} t/m ${parent.rangeEnd}`
    : `Range: ${parent.rangeStart} t/m ${parent.rangeEnd}`;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validRange || amountFromRange == null) {
      const msg =
        rangeEnd.trim() === "" && (amount === "" || isNaN(parseInt(amount, 10)))
          ? "Vul aantal passen of eind range in."
          : `Eind range moet tussen ${parent.rangeStart} en ${parent.rangeEnd} liggen (1–${parent.totaal} passen).`;
      setError(msg);
      onError(msg);
      return;
    }
    setSaving(true);
    setError(null);
    onError(null);
    try {
      const res = await fetch("/api/protected/barcodereeksen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          parentID: parent.ID,
          amount: amountFromRange,
          label: label || null,
          material: material || null,
          printSample: printSample || null,
        }),
      });
      const json = await res.json();
      if (res.ok) {
        onSaved();
      } else {
        const msg = json.error || "Fout bij opslaan";
        setError(msg);
        onError(msg);
      }
    } catch {
      const msg = "Fout bij opslaan";
      setError(msg);
      onError(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal onClose={onClose} clickOutsideClosesDialog={false}>
      <div>
        <h2 className="font-bold mb-4">Nieuwe subreeks (uitgifte vanuit voorraad)</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="p-2 bg-red-100 border border-red-400 text-red-700 rounded text-sm">
              {error}
            </div>
          )}
          <div className="text-sm text-gray-700">
            <span className="font-medium">Voorraadreeks:</span> {voorraadreeksLabel} | {voorraadreeksRange}
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Label (optioneel)</label>
            <FormInput value={label} onChange={(e) => setLabel(e.target.value)} className="border-gray-700 rounded-full" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Materiaal</label>
            <FormInput value={material} onChange={(e) => setMaterial(e.target.value)} className="border-gray-700 rounded-full" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Drukproef</label>
            <FormInput value={printSample} onChange={(e) => setPrintSample(e.target.value)} className="border-gray-700 rounded-full" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Start range</label>
            <FormInput
              type="text"
              value={parent.rangeStart}
              readOnly
              className="border-gray-700 rounded-full bg-gray-100"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Aantal passen (max {parent.totaal})</label>
            <FormInput
              type="text"
              inputMode="numeric"
              value={amount}
              onChange={(e) => handleAmountChange(e.target.value)}
              className="border-gray-700 rounded-full"
              placeholder={`1–${parent.totaal}`}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">End range (max {parent.rangeEnd})</label>
            <FormInput
              type="text"
              value={rangeEnd}
              onChange={(e) => handleRangeEndChange(e.target.value)}
              className="border-gray-700 rounded-full"
              placeholder={parent.rangeEnd}
            />
          </div>
          <div className="flex gap-2">
            <Button disabled={saving || !validRange || amountFromRange == null}>{saving ? "Bezig..." : "Opslaan"}</Button>
            <Button onClick={onClose}>Afbreken</Button>
          </div>
        </form>
      </div>
    </Modal>
  );
}
