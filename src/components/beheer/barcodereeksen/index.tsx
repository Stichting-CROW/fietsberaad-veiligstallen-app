import React, { useState, useEffect, useCallback } from "react";
import type { VSBarcodereeksApi } from "~/types/barcodereeksen";
import type { BarcodereeksType } from "~/types/barcodereeksen";
import { Button } from "~/components/Button";
import { Table } from "~/components/common/Table";
import Modal from "~/components/Modal";
import SectionBlock from "~/components/SectionBlock";
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

interface BarcodereeksenComponentProps {
  type: BarcodereeksType;
}

export const BarcodereeksenComponent: React.FC<BarcodereeksenComponentProps> = ({ type }) => {
  const [list, setList] = useState<VSBarcodereeksApi[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [aantalPassen, setAantalPassen] = useState<string>("");
  const [modalNew, setModalNew] = useState(false);
  const [modalEdit, setModalEdit] = useState<VSBarcodereeksApi | null>(null);
  const [modalUitgifte, setModalUitgifte] = useState<VSBarcodereeksApi | null>(null);
  const [suggestedRangeStart, setSuggestedRangeStart] = useState<string>("");

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
        try {
          return BigInt(r.rangeStart) <= BigInt(r.rangeEnd);
        } catch {
          return false;
        }
      });
      setSelectedId((prev) => {
        if (data.length === 0) return null;
        const current = data.find((r) => r.ID === prev);
        let currentSelectable = false;
        if (current) {
          try {
            currentSelectable = BigInt(current.rangeStart) <= BigInt(current.rangeEnd);
          } catch {
            currentSelectable = false;
          }
        }
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

  const canSelect = (row: VSBarcodereeksApi) => !isFullSeries(row);

  const selectedRow = selectedId != null ? list.find((r) => r.ID === selectedId) ?? null : null;
  const canUitgifte = selectedRow != null && canSelect(selectedRow);

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
    setAantalPassen("");
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
          <label className="flex items-center gap-2">
            <span className="text-sm font-medium">Aantal passen:</span>
            <input
              type="number"
              min={1}
              value={aantalPassen}
              onChange={(e) => setAantalPassen(e.target.value)}
              className="border rounded px-2 py-1 w-24"
            />
          </label>
          <Button onClick={openUitgifteModal} disabled={!canUitgifte}>
            Uitgifte vanuit bestaande voorraad
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
            { header: "Label", accessor: (row) => row.label ?? "—" },
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
                    onClick={(e) => {
                      e.stopPropagation();
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
                    className="text-red-600 hover:text-red-800"
                    title="Verwijderen"
                  >
                    🗑️
                  </button>
                </div>
              ),
            },
          ]}
          data={list}
          getRowClassName={(row) => (isFullSeries(row) ? "bg-gray-100 text-gray-500" : "")}
          className="min-w-full bg-white"
        />
      </div>

      {/* Modal: Nieuwe reeks */}
      {modalNew && (
        <BarcodereeksNewModal
          type={type}
          suggestedRangeStart={suggestedRangeStart}
          initialAantal={aantalPassen}
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
          type={type}
          parent={modalUitgifte}
          initialAantal={aantalPassen}
          onClose={() => setModalUitgifte(null)}
          onSaved={() => {
            setModalUitgifte(null);
            setAantalPassen("");
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
  initialAantal,
  onClose,
  onSaved,
  onError,
}: {
  type: BarcodereeksType;
  suggestedRangeStart: string;
  initialAantal?: string;
  onClose: () => void;
  onSaved: () => void;
  onError: (s: string) => void;
}) {
  const [label, setLabel] = useState("");
  const [material, setMaterial] = useState("");
  const [printSample, setPrintSample] = useState("");
  const [rangeStart, setRangeStart] = useState(suggestedRangeStart);
  const [rangeEnd, setRangeEnd] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setRangeStart(suggestedRangeStart);
  }, [suggestedRangeStart]);

  useEffect(() => {
    if (!suggestedRangeStart || !initialAantal) return;
    const n = parseInt(initialAantal, 10);
    if (isNaN(n) || n < 1) return;
    try {
      const end = BigInt(suggestedRangeStart) + BigInt(n) - 1n;
      setRangeEnd(String(end));
    } catch {
      // ignore
    }
  }, [suggestedRangeStart, initialAantal]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
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
        onError(json.error || "Fout bij opslaan");
      }
    } catch {
      onError("Fout bij opslaan");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal onClose={onClose} clickOutsideClosesDialog={false}>
      <SectionBlock heading="Nieuwe reeks">
        <form onSubmit={handleSubmit} className="space-y-4">
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
            <FormInput type="text" value={rangeStart} onChange={(e) => setRangeStart(e.target.value)} className="border-gray-700 rounded-full" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">End range</label>
            <FormInput type="text" value={rangeEnd} onChange={(e) => setRangeEnd(e.target.value)} className="border-gray-700 rounded-full" required />
          </div>
          <div className="flex gap-2">
            <Button type="submit" disabled={saving}>{saving ? "Bezig..." : "Opslaan"}</Button>
            <Button type="button" onClick={onClose}>Afbreken</Button>
          </div>
        </form>
      </SectionBlock>
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
  onError: (s: string) => void;
}) {
  const [label, setLabel] = useState(row.label ?? "");
  const [material, setMaterial] = useState(row.material ?? "");
  const [printSample, setPrintSample] = useState(row.printSample ?? "");
  const [rangeStart, setRangeStart] = useState(row.rangeStart);
  const [rangeEnd, setRangeEnd] = useState(row.rangeEnd);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
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
        onError(json.error || "Fout bij opslaan");
      }
    } catch {
      onError("Fout bij opslaan");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal onClose={onClose} clickOutsideClosesDialog={false}>
      <SectionBlock heading="Reeks bewerken">
        <form onSubmit={handleSubmit} className="space-y-4">
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
            <FormInput type="text" value={rangeStart} onChange={(e) => setRangeStart(e.target.value)} className="border-gray-700 rounded-full" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">End range</label>
            <FormInput type="text" value={rangeEnd} onChange={(e) => setRangeEnd(e.target.value)} className="border-gray-700 rounded-full" required />
          </div>
          <div className="flex gap-2">
            <Button type="submit" disabled={saving}>{saving ? "Bezig..." : "Opslaan"}</Button>
            <Button type="button" onClick={onClose}>Afbreken</Button>
          </div>
        </form>
      </SectionBlock>
    </Modal>
  );
}

// --- Uitgifte vanuit bestaande voorraad ---
function BarcodereeksUitgifteModal({
  type,
  parent,
  initialAantal,
  onClose,
  onSaved,
  onError,
}: {
  type: BarcodereeksType;
  parent: VSBarcodereeksApi;
  initialAantal: string;
  onClose: () => void;
  onSaved: () => void;
  onError: (s: string) => void;
}) {
  const [label, setLabel] = useState("");
  const [material, setMaterial] = useState(parent.material ?? "");
  const [printSample, setPrintSample] = useState(parent.printSample ?? "");
  const [amount, setAmount] = useState(initialAantal);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setMaterial(parent.material ?? "");
    setPrintSample(parent.printSample ?? "");
    setAmount(initialAantal);
  }, [parent.ID, parent.material, parent.printSample, initialAantal]);

  const numAmount = parseInt(amount, 10);
  const validAmount = !isNaN(numAmount) && numAmount >= 1 && numAmount <= parent.totaal;
  const chunkStart = parent.rangeStart;
  const chunkEnd = validAmount
    ? String(BigInt(parent.rangeStart) + BigInt(numAmount) - 1n)
    : "";
  const remainingStart = validAmount
    ? String(BigInt(parent.rangeStart) + BigInt(numAmount))
    : parent.rangeStart;
  const remainingEnd = parent.rangeEnd;
  const voorraadreeksLabel = parent.label ?? "—";
  const voorraadreeksRange = validAmount
    ? `Range: ${remainingStart} t/m ${remainingEnd}`
    : `Range: ${parent.rangeStart} t/m ${parent.rangeEnd}`;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validAmount) {
      onError(`Aantal moet tussen 1 en ${parent.totaal} zijn`);
      return;
    }
    setSaving(true);
    onError(null);
    try {
      const res = await fetch("/api/protected/barcodereeksen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          parentID: parent.ID,
          amount: numAmount,
          label: label || null,
          material: material || null,
          printSample: printSample || null,
        }),
      });
      const json = await res.json();
      if (res.ok) {
        onSaved();
      } else {
        onError(json.error || "Fout bij opslaan");
      }
    } catch {
      onError("Fout bij opslaan");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal onClose={onClose} clickOutsideClosesDialog={false}>
      <SectionBlock heading="Nieuwe subreeks (uitgifte vanuit voorraad)">
        <form onSubmit={handleSubmit} className="space-y-4">
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
              value={chunkStart}
              readOnly
              className="border-gray-700 rounded-full bg-gray-100"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">End range</label>
            <FormInput
              type="text"
              value={chunkEnd}
              readOnly
              className="border-gray-700 rounded-full bg-gray-100"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Aantal passen (max {parent.totaal})</label>
            <FormInput
              type="number"
              min={1}
              max={parent.totaal}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="border-gray-700 rounded-full"
              required
            />
          </div>
          <div className="flex gap-2">
            <Button type="submit" disabled={saving}>{saving ? "Bezig..." : "Opslaan"}</Button>
            <Button type="button" onClick={onClose}>Afbreken</Button>
          </div>
        </form>
      </SectionBlock>
    </Modal>
  );
}
