import React, { useCallback, useEffect, useState } from "react";
import { Button } from "~/components/Button";
import toast from "react-hot-toast";

function localDateInputValue(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

type BulkException = { id: number; datum: string };

type BulkRow = {
  id: number;
  sectieId: number;
  aantal: number;
  startdatumtijd: string;
  einddatumtijd: string;
  terugkerend: boolean;
  overlap: boolean;
  uitzonderingen: BulkException[];
};

type SectionBulkData = {
  sectieId: number;
  titel: string;
  capacity: number;
  bulkreserveringen: BulkRow[];
};

interface ParkingBulkReserveringenProps {
  fietsenstallingId: string;
  canEdit: boolean;
}

const apiBase = (stallingId: string) =>
  `/api/protected/fietsenstallingen/${encodeURIComponent(stallingId)}/bulkreserveringen`;

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit", hour12: false });
}

function formatDateLong(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("nl-NL", { weekday: "long", day: "numeric", month: "numeric", year: "numeric" });
}

function emptyNewRow() {
  return {
    aantal: "",
    startDate: localDateInputValue(),
    startTime: "06:00",
    endTime: "22:00",
    terugkerend: false,
  };
}

const ParkingBulkReserveringen: React.FC<ParkingBulkReserveringenProps> = ({
  fietsenstallingId,
  canEdit,
}) => {
  const [sections, setSections] = useState<SectionBulkData[]>([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  const [newBySection, setNewBySection] = useState<
    Record<number, ReturnType<typeof emptyNewRow>>
  >({});
  const [exceptionDateByBulk, setExceptionDateByBulk] = useState<Record<number, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(apiBase(fietsenstallingId));
      const json = (await res.json()) as { data?: SectionBulkData[]; error?: string };
      if (!res.ok) {
        throw new Error(json.error ?? "Laden mislukt");
      }
      setSections(json.data ?? []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Fout bij laden bulkreserveringen");
    } finally {
      setLoading(false);
    }
  }, [fietsenstallingId]);

  useEffect(() => {
    void load();
  }, [load]);

  const getNewForm = (sectieId: number) => newBySection[sectieId] ?? emptyNewRow();

  const setNewForm = (sectieId: number, patch: Partial<ReturnType<typeof emptyNewRow>>) => {
    setNewBySection((prev) => ({
      ...prev,
      [sectieId]: { ...getNewForm(sectieId), ...patch },
    }));
  };

  const saveBulk = async (sectieId: number) => {
    const form = getNewForm(sectieId);
    if (!form.aantal || !form.startDate || !form.startTime || !form.endTime) {
      toast.error("Vul alle velden in");
      return;
    }
    try {
      const res = await fetch(apiBase(fietsenstallingId), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sectieId,
          aantal: Number(form.aantal),
          startDate: form.startDate,
          startTime: form.startTime,
          endTime: form.endTime,
          terugkerend: form.terugkerend,
        }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        throw new Error(json.error ?? "Opslaan mislukt");
      }
      toast.success("Bulkreservering opgeslagen");
      setNewBySection((prev) => ({ ...prev, [sectieId]: emptyNewRow() }));
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Opslaan mislukt");
    }
  };

  const deleteBulk = async (bulkId: number) => {
    if (!window.confirm("Bulkreservering verwijderen?")) return;
    try {
      const res = await fetch(`${apiBase(fietsenstallingId)}/${bulkId}`, { method: "DELETE" });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Verwijderen mislukt");
      toast.success("Verwijderd");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Verwijderen mislukt");
    }
  };

  const addException = async (bulkId: number) => {
    const datum = exceptionDateByBulk[bulkId];
    if (!datum) {
      toast.error("Kies een datum");
      return;
    }
    try {
      const res = await fetch(`${apiBase(fietsenstallingId)}/${bulkId}/uitzonderingen`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ datum }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Toevoegen mislukt");
      toast.success("Uitzondering toegevoegd");
      setExceptionDateByBulk((prev) => ({ ...prev, [bulkId]: "" }));
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Toevoegen mislukt");
    }
  };

  const deleteException = async (exceptionId: number) => {
    try {
      const res = await fetch(
        `${apiBase(fietsenstallingId)}/uitzonderingen/${exceptionId}`,
        { method: "DELETE" }
      );
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Verwijderen mislukt");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Verwijderen mislukt");
    }
  };

  if (loading && sections.length === 0) {
    return <p className="text-sm text-gray-600">Bulkreserveringen laden…</p>;
  }

  return (
    <div className="flex flex-col gap-6 rounded border border-gray-200 bg-gray-50 p-4">
      <h3 className="text-lg font-semibold">Bulkreserveringen</h3>
      <p className="text-sm text-gray-600">
        Vaste reservering van plaatsen per sectie voor een tijdvak (optioneel wekelijks terugkerend).
      </p>

      {sections.map((section) => {
        const open = expanded[section.sectieId] ?? true;
        const form = getNewForm(section.sectieId);
        return (
          <div key={section.sectieId} className="rounded border border-gray-200 bg-white p-4">
            <button
              type="button"
              className="mb-3 flex w-full items-center justify-between text-left font-medium"
              onClick={() =>
                setExpanded((prev) => ({ ...prev, [section.sectieId]: !open }))
              }
            >
              <span>
                {section.titel} (capaciteit: {section.capacity})
              </span>
              <span className="text-gray-500">{open ? "▾" : "▸"}</span>
            </button>

            {open && (
              <div className="flex flex-col gap-4">
                {section.bulkreserveringen.length === 0 && (
                  <p className="text-sm text-gray-500">Geen bulkreserveringen.</p>
                )}
                {section.bulkreserveringen.map((b) => (
                  <div
                    key={b.id}
                    className={`rounded border p-3 text-sm ${b.overlap ? "border-orange-400 bg-orange-50" : "border-gray-100"}`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <strong>{b.aantal}</strong> plaatsen op{" "}
                        {formatDateLong(b.startdatumtijd)} van {formatTime(b.startdatumtijd)} tot{" "}
                        {formatTime(b.einddatumtijd)}
                        {b.terugkerend && (
                          <span className="ml-2 text-gray-600">(wekelijks)</span>
                        )}
                        {b.overlap && (
                          <span className="ml-2 font-medium text-orange-700">Overlapt</span>
                        )}
                      </div>
                      {canEdit && (
                        <Button variant="secundary" type="button" onClick={() => void deleteBulk(b.id)}>
                          Verwijderen
                        </Button>
                      )}
                    </div>
                    {b.terugkerend && (
                      <div className="mt-3 border-t border-gray-100 pt-2">
                        <p className="mb-1 text-xs font-medium text-gray-600">Niet geldig op:</p>
                        <ul className="mb-2 flex flex-col gap-1">
                          {b.uitzonderingen.map((ex) => (
                            <li key={ex.id} className="flex items-center gap-2">
                              <span>{ex.datum}</span>
                              {canEdit && (
                                <button
                                  type="button"
                                  className="text-red-600 underline"
                                  onClick={() => void deleteException(ex.id)}
                                >
                                  verwijder
                                </button>
                              )}
                            </li>
                          ))}
                        </ul>
                        {canEdit && (
                          <div className="flex flex-wrap items-end gap-2">
                            <label className="flex flex-col text-xs">
                              Datum uitzondering
                              <input
                                type="date"
                                className="rounded border px-2 py-1"
                                value={exceptionDateByBulk[b.id] ?? ""}
                                onChange={(e) =>
                                  setExceptionDateByBulk((prev) => ({
                                    ...prev,
                                    [b.id]: e.target.value,
                                  }))
                                }
                              />
                            </label>
                            <Button
                              variant="secundary"
                              type="button"
                              onClick={() => void addException(b.id)}
                            >
                              Toevoegen
                            </Button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}

                {canEdit && (
                  <div className="border-t border-gray-200 pt-4">
                    <p className="mb-2 text-sm font-medium">Nieuwe bulkreservering</p>
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
                      <label className="flex flex-col text-xs">
                        Aantal
                        <input
                          type="number"
                          min={1}
                          className="rounded border px-2 py-1"
                          value={form.aantal}
                          onChange={(e) => setNewForm(section.sectieId, { aantal: e.target.value })}
                        />
                      </label>
                      <label className="flex flex-col text-xs">
                        Op
                        <input
                          type="date"
                          className="rounded border px-2 py-1"
                          value={form.startDate}
                          onChange={(e) => setNewForm(section.sectieId, { startDate: e.target.value })}
                        />
                      </label>
                      <label className="flex flex-col text-xs">
                        Van
                        <input
                          type="time"
                          className="rounded border px-2 py-1"
                          value={form.startTime}
                          onChange={(e) => setNewForm(section.sectieId, { startTime: e.target.value })}
                        />
                      </label>
                      <label className="flex flex-col text-xs">
                        Tot
                        <input
                          type="time"
                          className="rounded border px-2 py-1"
                          value={form.endTime}
                          onChange={(e) => setNewForm(section.sectieId, { endTime: e.target.value })}
                        />
                      </label>
                      <label className="flex items-center gap-2 self-end text-xs">
                        <input
                          type="checkbox"
                          checked={form.terugkerend}
                          onChange={(e) =>
                            setNewForm(section.sectieId, { terugkerend: e.target.checked })
                          }
                        />
                        Herhaal wekelijks
                      </label>
                      <div className="flex items-end">
                        <Button type="button" onClick={() => void saveBulk(section.sectieId)}>
                          Opslaan
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default ParkingBulkReserveringen;
