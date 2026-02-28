import React, { useState, useEffect } from "react";
import { Button } from "~/components/Button";
import { useBikeTypes } from "~/hooks/useBikeTypes";
import { uploadTransaction } from "~/lib/parking-simulation/fms-api-client";
import { ActiesPanel, type Stalling } from "./ActiesPanel";

const FIETSEN_TAB_STORAGE_KEY = "parking-mgmt-fietsen-tab";

type Bicycle = { id: string; barcode: string; biketypeID?: number };
type OccupationEntry = {
  id: string;
  bicycleId: string;
  locationid: string;
  sectionid: string;
  placeId?: number | null;
  bicycle?: Bicycle;
};

function getStoredCredentials(): { username: string; password: string; baseUrl?: string } | null {
  if (typeof window === "undefined") return null;
  const u = localStorage.getItem("parking-sim-apiUsername");
  const p = localStorage.getItem("parking-sim-apiPassword");
  const b = localStorage.getItem("parking-sim-baseUrl");
  if (!u || !p) return null;
  return { username: u, password: p, baseUrl: b || undefined };
}

const FietsenTab: React.FC<{ stallings: Stalling[] }> = ({ stallings }) => {
  const { data: bikeTypes } = useBikeTypes();
  const [state, setState] = useState<{ bicycles: Bicycle[]; occupation: OccupationEntry[] } | null>(null);
  const [statusFilter, setStatusFilter] = useState<"occupied" | "free" | "all">("occupied");
  const [parkingFilter, setParkingFilter] = useState<string>("all");
  const [fietstypeFilter, setFietstypeFilter] = useState<number | "all">("all");
  const [removeLoading, setRemoveLoading] = useState<string | null>(null);
  const [checkOutLoading, setCheckOutLoading] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

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

  const handleRemove = async (bicycleId: string) => {
    setRemoveLoading(bicycleId);
    setMessage(null);
    try {
      const res = await fetch("/api/protected/parking-simulation/state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "remove", bicycleId }),
      });
      const data = await res.json();
      if (data.ok) {
        setMessage("Fiets uit stalling gehaald.");
        loadState();
      } else {
        setMessage(data.message ?? "Fout");
      }
    } catch (e) {
      setMessage("Fout: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setRemoveLoading(null);
    }
  };

  const handleCheckOut = async (bicycleId: string) => {
    const creds = getStoredCredentials();
    if (!creds) {
      setMessage("Geen credentials. Configureer in Instellingen of voeg Simulatie Dataprovider toe.");
      return;
    }
    const occ = (state?.occupation ?? []).find((o) => o.bicycleId === bicycleId);
    if (!occ) {
      setMessage("Fiets niet gestald.");
      return;
    }
    const bike = state?.bicycles?.find((b) => b.id === bicycleId);
    if (!bike) return;
    setCheckOutLoading(bicycleId);
    setMessage(null);
    try {
      const simulationTime = await fetchSimulationTime();
      const tx = {
        type: "out" as const,
        transactionDate: simulationTime,
        passID: "SIM-PASS-001",
        idtype: 0,
        barcodeBike: bike.barcode,
        bikeid: bike.barcode,
      };
      const res = await uploadTransaction(creds, occ.locationid, occ.sectionid, tx);
      if (res.status === 1) {
        const removeRes = await fetch("/api/protected/parking-simulation/state", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "remove", bicycleId }),
        });
        const removeData = await removeRes.json();
        if (removeData.ok) {
          setMessage("Check-out succesvol.");
          loadState();
        } else {
          setMessage(removeData.message ?? "Remove mislukt");
        }
      } else {
        const msg = res.message ?? "onbekend";
        const hint = /unauthorized|401/i.test(String(msg))
          ? " Controleer Instellingen: vul UrlName/Wachtwoord van je dataprovider in."
          : "";
        setMessage("Fout: " + msg + hint);
      }
    } catch (e) {
      setMessage("Fout: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setCheckOutLoading(null);
    }
  };

  const getBikeTypeName = (id: number) =>
    bikeTypes.find((t) => t.ID === id)?.Name ?? bikeTypes.find((t) => t.ID === id)?.naamenkelvoud ?? `Type ${id}`;

  const getStallingTitle = (locationid: string) =>
    stallings.find((s) => s.locationid === locationid)?.title ?? locationid;

  const tableRows = (state?.bicycles ?? []).map((bike) => {
    const occ = (state?.occupation ?? []).find((o) => o.bicycleId === bike.id);
    const isOccupied = !!occ;
    return {
      bike,
      occ,
      isOccupied,
    };
  });

  const filteredRows = tableRows.filter((r) => {
    if (statusFilter === "occupied" && !r.isOccupied) return false;
    if (statusFilter === "free" && r.isOccupied) return false;
    if (parkingFilter !== "all" && (!r.occ || r.occ.locationid !== parkingFilter)) return false;
    if (fietstypeFilter !== "all" && (r.bike.biketypeID ?? 1) !== fietstypeFilter) return false;
    return true;
  });

  return (
    <div className="bg-white border rounded-lg p-6 space-y-8">
      <ActiesPanel
        stallings={stallings}
        storageKey={FIETSEN_TAB_STORAGE_KEY}
        onMessage={setMessage}
      />

      <div>
        <h3 className="text-lg font-bold mb-3">Fysieke toestand</h3>
        <p className="text-sm text-gray-600 mb-3">
          Deze toestand kan afwijken van de toestand in de stalling als fietsen niet gescand zijn of buiten het bereik van de detectie zijn gestald.
        </p>
        <div className="flex flex-wrap gap-4 mb-3">
          <div>
            <label className="block text-sm text-gray-600 mb-1">Status</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
              className="border rounded px-3 py-2"
            >
              <option value="all">Alle</option>
              <option value="occupied">Gestald</option>
              <option value="free">Vrij</option>
            </select>
          </div>
          <div>
            <label className="block text-sm text-gray-600 mb-1">Fiets type</label>
            <select
              value={fietstypeFilter === "all" ? "all" : fietstypeFilter}
              onChange={(e) => setFietstypeFilter(e.target.value === "all" ? "all" : Number(e.target.value))}
              className="border rounded px-3 py-2"
            >
              <option value="all">Alle</option>
              {bikeTypes.map((t) => (
                <option key={t.ID} value={t.ID}>
                  {t.Name ?? t.naamenkelvoud}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm text-gray-600 mb-1">Stalling</label>
            <select
              value={parkingFilter}
              onChange={(e) => setParkingFilter(e.target.value)}
              className="border rounded px-3 py-2"
            >
              <option value="all">Alle</option>
              {stallings.map((s) => (
                <option key={s.id} value={s.locationid}>
                  {s.title}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="overflow-x-auto border rounded">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="bg-gray-50">
                <th className="px-3 py-2 text-left font-medium">Type</th>
                <th className="px-3 py-2 text-left font-medium">ID</th>
                <th className="px-3 py-2 text-left font-medium">Stalling / locatie</th>
                <th className="px-3 py-2 text-right font-medium w-24">Acties</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map(({ bike, occ, isOccupied }) => (
                <tr key={bike.id} className="border-b hover:bg-gray-50">
                  <td className="px-3 py-2">{getBikeTypeName(bike.biketypeID ?? 1)}</td>
                  <td className="px-3 py-2">{bike.barcode}</td>
                  <td className="px-3 py-2">
                    {isOccupied && occ ? (
                      <>
                        {getStallingTitle(occ.locationid)} – {occ.sectionid}
                        {occ.placeId != null ? ` plek ${occ.placeId}` : ""}
                      </>
                    ) : (
                      <span className="text-gray-500">Vrij</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {isOccupied && (
                      <span className="flex gap-2 justify-end">
                        <Button
                          onClick={() => void handleRemove(bike.id)}
                          disabled={removeLoading === bike.id}
                          className="mb-0 whitespace-nowrap"
                        >
                          Uit stalling (zonder check-uit)
                        </Button>
                        <Button
                          onClick={() => void handleCheckOut(bike.id)}
                          disabled={checkOutLoading === bike.id || !getStoredCredentials()}
                          className="mb-0 whitespace-nowrap"
                        >
                          Check-out
                        </Button>
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filteredRows.length === 0 && (
          <p className="text-sm text-gray-500 mt-2">Geen fietsen gevonden met deze filters.</p>
        )}
      </div>

      {message && (
        <p className={`text-sm ${message.startsWith("Fout") ? "text-red-600" : "text-green-600"}`}>
          {message}
        </p>
      )}
    </div>
  );
};

export default FietsenTab;
