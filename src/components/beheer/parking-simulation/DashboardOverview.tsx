import React, { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { FiPlus, FiTrash2 } from "react-icons/fi";
import { useBikeTypes } from "~/hooks/useBikeTypes";
import { userHasRight } from "~/types/utils";
import { VSSecurityTopic } from "~/types/securityprofile";
import { Button } from "~/components/Button";

type Bicycle = { id: string; biketypeID?: number };
type OccupationEntry = { id: string; bicycleId: string; bicycle?: { biketypeID?: number } };
type State = {
  bicycles: Bicycle[];
  occupation: OccupationEntry[];
};

const DEMO_TARGETS: { label: string; target: number; match: (t: { Name: string | null; naamenkelvoud: string }) => boolean }[] = [
  { label: "Fietsen", target: 50, match: (t) => (t.Name?.toLowerCase() === "fietsen" || t.naamenkelvoud?.toLowerCase() === "fiets") },
  { label: "Elektrische fietsen", target: 30, match: (t) => /elektrisch/i.test(t.Name ?? "") || /elektrisch/i.test(t.naamenkelvoud ?? "") },
  { label: "Bromfietsen", target: 10, match: (t) => /bromfiets/i.test(t.Name ?? "") || /bromfiets/i.test(t.naamenkelvoud ?? "") },
  { label: "Bakfietsen", target: 10, match: (t) => /bakfiets/i.test(t.Name ?? "") || /bakfiets/i.test(t.naamenkelvoud ?? "") },
];

const DEFAULT_START_DATE = "2025-01-01";

const DashboardOverview: React.FC<{ hasStallings?: boolean }> = ({ hasStallings = false }) => {
  const { data: session } = useSession();
  const [state, setState] = useState<State | null>(null);
  const { data: bikeTypes } = useBikeTypes();
  const [poolLoading, setPoolLoading] = useState<string | null>(null);
  const [simulationStartDate, setSimulationStartDate] = useState(DEFAULT_START_DATE);
  const [resetLoading, setResetLoading] = useState(false);
  const [resetMessage, setResetMessage] = useState<string | null>(null);

  const hasAccess = userHasRight(session?.user?.securityProfile, VSSecurityTopic.fietsberaad_superadmin);
  const [demoPoolLoading, setDemoPoolLoading] = useState(false);
  const [emptyPoolLoading, setEmptyPoolLoading] = useState(false);
  const [poolMessage, setPoolMessage] = useState<string | null>(null);

  const loadState = () => {
    fetch("/api/protected/parking-simulation/state")
      .then((r) => (r.ok ? r.json() : {}))
      .then((data: { bicycles?: Bicycle[]; occupation?: OccupationEntry[] }) => {
        setState({
          bicycles: data.bicycles ?? [],
          occupation: data.occupation ?? [],
        });
      })
      .catch(() => setState(null));
  };

  useEffect(() => {
    loadState();
  }, []);

  useEffect(() => {
    const handler = () => loadState();
    window.addEventListener("simulation-clock-updated", handler);
    return () => window.removeEventListener("simulation-clock-updated", handler);
  }, []);

  const addBicycles = async (biketypeID: number, count: number) => {
    const key = `${biketypeID}-${count}`;
    setPoolLoading(key);
    setPoolMessage(null);
    try {
      const res = await fetch("/api/protected/parking-simulation/bicycle-pool", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bicyclePool: [{ biketypeID, count }] }),
      });
      const data = await res.json();
      if (data.created != null) {
        setPoolMessage(`Aangemaakt: ${data.created} fietsen`);
        loadState();
        window.dispatchEvent(new CustomEvent("simulation-clock-updated"));
      } else {
        setPoolMessage(data.message ?? "Fout");
      }
    } catch (e) {
      setPoolMessage("Fout: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setPoolLoading(null);
    }
  };

  const initDemoPool = async () => {
    setDemoPoolLoading(true);
    setPoolMessage(null);
    try {
      const toAdd: { biketypeID: number; count: number }[] = [];
      for (const { target, match } of DEMO_TARGETS) {
        const t = bikeTypes.find(match);
        if (!t) continue;
        const current = (state?.bicycles ?? []).filter((b) => (b.biketypeID ?? 1) === t.ID).length;
        const needed = Math.max(0, target - current);
        if (needed > 0) toAdd.push({ biketypeID: t.ID, count: needed });
      }
      if (toAdd.length === 0) {
        setPoolMessage("Pool heeft al voldoende fietsen.");
      } else {
        const res = await fetch("/api/protected/parking-simulation/bicycle-pool", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ bicyclePool: toAdd }),
        });
        const data = await res.json();
        if (data.created != null) {
          setPoolMessage(`Demo pool: ${data.created} fietsen toegevoegd`);
          loadState();
          window.dispatchEvent(new CustomEvent("simulation-clock-updated"));
        } else {
          setPoolMessage(data.message ?? "Fout");
        }
      }
    } catch (e) {
      setPoolMessage("Fout: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setDemoPoolLoading(false);
    }
  };

  const emptyPool = async () => {
    setEmptyPoolLoading(true);
    setPoolLoading("empty");
    setPoolMessage(null);
    try {
      const res = await fetch("/api/protected/parking-simulation/bicycle-pool", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (data.deleted != null) {
        setPoolMessage(`Verwijderd: ${data.deleted} fietsen`);
        loadState();
        window.dispatchEvent(new CustomEvent("simulation-clock-updated"));
      } else {
        setPoolMessage(data.message ?? "Fout");
      }
    } catch (e) {
      setPoolMessage("Fout: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setEmptyPoolLoading(false);
      setPoolLoading(null);
    }
  };

  const removeBicyclesOfType = async (biketypeID: number) => {
    setPoolLoading(`delete-${biketypeID}`);
    setPoolMessage(null);
    try {
      const res = await fetch("/api/protected/parking-simulation/bicycle-pool", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ biketypeID }),
      });
      const data = await res.json();
      if (data.deleted != null) {
        setPoolMessage(`Verwijderd: ${data.deleted} fietsen`);
        loadState();
        window.dispatchEvent(new CustomEvent("simulation-clock-updated"));
      } else {
        setPoolMessage(data.message ?? "Fout");
      }
    } catch (e) {
      setPoolMessage("Fout: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setPoolLoading(null);
    }
  };

  const hasParkedBikes = (state?.occupation?.length ?? 0) > 0;

  const resetSimulation = async () => {
    if (!window.confirm("Weet je zeker dat je wilt resetten? Alle transactiedata van de teststallingen wordt verwijderd.")) {
      return;
    }
    setResetLoading(true);
    setResetMessage(null);
    try {
      // User date is local; interpret as local midnight and send UTC to API
      const startDate = simulationStartDate
        ? new Date(simulationStartDate + "T00:00:00").toISOString()
        : undefined;
      const res = await fetch("/api/protected/parking-simulation/tables", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reset", startDate }),
      });
      const data = await res.json();
      setResetMessage(data.ok ? "Data gereset" : data.message ?? "Fout");
      if (data.ok) {
        window.dispatchEvent(new CustomEvent("simulation-clock-updated"));
        loadState();
      }
    } catch (e) {
      setResetMessage("Fout: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setResetLoading(false);
    }
  };

  return (
    <div className="bg-white border rounded-lg p-6">
      <h2 className="text-lg font-semibold mb-4">Overzicht</h2>
      <div className="space-y-2 text-sm text-gray-600">
        <p>Fietsen: <strong>{state?.bicycles?.length ?? 0}</strong></p>
        <p>Bezetting: <strong>{state?.occupation?.length ?? 0}</strong></p>
      </div>
      <p className="mt-4 text-sm text-gray-500">
        {hasStallings
          ? "Selecteer een stalling in de tabbladen voor check-in en check-out."
          : "genereer de teststallingen om de simulatie te starten."}
      </p>

      {hasAccess && (
        <div className="mt-6 pt-6 border-t border-gray-200">
          <h3 className="font-medium mb-2">Reset Simulatie</h3>
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-sm text-gray-600">Startdatum</label>
            <input
              type="date"
              value={simulationStartDate}
              onChange={(e) => setSimulationStartDate(e.target.value)}
              className="border rounded px-3 py-2"
            />
            <Button onClick={resetSimulation} disabled={resetLoading}>
              {resetLoading ? "Bezig…" : "Reset"}
            </Button>
          </div>
          {resetMessage && (
            <p className={`mt-2 text-sm ${resetMessage.startsWith("Fout") ? "text-red-600" : "text-green-600"}`}>
              {resetMessage}
            </p>
          )}
        </div>
      )}

      <div className="mt-6 pt-6 border-t border-gray-200">
        <div className="flex items-center gap-2 mb-2">
          <h3 className="font-medium">Fietsenpool</h3>
          <button
            type="button"
            onClick={() => void initDemoPool()}
            disabled={!!poolLoading || demoPoolLoading || emptyPoolLoading || bikeTypes.length === 0}
            title="Vul pool met demo-aantallen (50 fietsen, 30 elektrisch, 10 bromfietsen, 10 fatbikes)"
            className="rounded-lg px-4 py-2 text-sm font-medium border border-sky-300 bg-sky-100 text-sky-800 hover:bg-sky-200 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Vullen
          </button>
          <button
            type="button"
            onClick={() => void emptyPool()}
            disabled={!!poolLoading || demoPoolLoading || emptyPoolLoading || hasParkedBikes}
            title="Verwijder alle fietsen uit de pool (niet mogelijk als er gestalde fietsen zijn)"
            className="rounded-lg px-4 py-2 text-sm font-medium border border-amber-300 bg-amber-100 text-amber-800 hover:bg-amber-200 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Leegmaken
          </button>
        </div>
        {bikeTypes.length > 0 && (
          <div className="mb-4 overflow-x-auto">
            <table className="min-w-full text-sm border border-gray-200 rounded">
              <thead>
                <tr className="bg-gray-50">
                  <th className="px-3 py-2 text-left font-medium text-gray-700 border-b">Type</th>
                  <th className="px-3 py-2 text-right font-medium text-gray-700 border-b">Aantal</th>
                  <th className="px-3 py-2 text-right font-medium text-gray-700 border-b">Gestald</th>
                  <th className="px-3 py-2 text-right font-medium text-gray-700 border-b w-24">Voeg toe</th>
                  <th className="px-3 py-2 text-right font-medium text-gray-700 border-b w-10"></th>
                </tr>
              </thead>
              <tbody>
                {bikeTypes.map((t) => {
                  const count = (state?.bicycles ?? []).filter((b) => (b.biketypeID ?? 1) === t.ID).length;
                  const gestald = (state?.occupation ?? []).filter((o) => (o.bicycle?.biketypeID ?? 1) === t.ID).length;
                  const canDelete = gestald === 0;
                  return (
                    <tr key={t.ID} className="border-b border-gray-100 last:border-0 hover:bg-gray-200 transition-colors">
                      <td className="px-3 py-2 text-gray-800">{t.Name ?? t.naamenkelvoud}</td>
                      <td className="px-3 py-2 text-right">{count}</td>
                      <td className="px-3 py-2 text-right">{gestald}</td>
                      <td className="px-3 py-2 text-right">
                        <span className="inline-flex gap-1">
                          <button
                            type="button"
                            onClick={() => void addBicycles(t.ID, 1)}
                            disabled={!!poolLoading}
                            title="+1 fiets"
                            className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded border border-gray-300 bg-gray-100 hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                          >
                            <FiPlus className="w-3.5 h-3.5" />
                            <span>1</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => void addBicycles(t.ID, 5)}
                            disabled={!!poolLoading}
                            title="+5 fietsen"
                            className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded border border-gray-300 bg-gray-100 hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                          >
                            <FiPlus className="w-3.5 h-3.5" />
                            <span>5</span>
                          </button>
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <button
                          type="button"
                          onClick={() => void removeBicyclesOfType(t.ID)}
                          disabled={!!poolLoading || !canDelete || count === 0}
                          title={canDelete ? "Verwijder alle fietsen van dit type" : "Niet mogelijk: er zijn gestalde fietsen"}
                          className="p-1 rounded text-gray-500 hover:text-red-600 hover:bg-red-50 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:text-gray-500 disabled:hover:bg-transparent"
                        >
                          <FiTrash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {bikeTypes.length === 0 && <p className="text-sm text-gray-500">Laden fietstypen...</p>}
        {poolMessage && (
          <p className={`mt-2 text-sm ${poolMessage.startsWith("Fout") ? "text-red-600" : "text-green-600"}`}>
            {poolMessage}
          </p>
        )}
      </div>
    </div>
  );
};

export default DashboardOverview;
