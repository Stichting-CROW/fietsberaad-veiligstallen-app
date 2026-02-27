import React, { useState, useEffect, useCallback } from "react";
import { FiRefreshCw } from "react-icons/fi";
import { Tabs, Tab } from "@mui/material";
import { Button } from "~/components/Button";
import { uploadTransaction } from "~/lib/parking-simulation/fms-api-client";

type WachtrijTransactie = {
  ID: number;
  transactionDate: string | null;
  bikeparkID: string;
  sectionID: string;
  placeID: number | null;
  passID: string;
  passtype: string | null;
  type: string;
  processed: number;
  processDate: string | null;
  error: string | null;
  dateCreated: string;
};

/** processed codes from ColdFusion processTransactions2.cfm (wachtrij-transacties-processing-flow.md) */
const PROCESSED_LABELS: Record<number, string> = {
  0: "Wachtend",
  8: "In behandeling",
  9: "Geïsoleerd",
  1: "Verwerkt",
  2: "Fout",
};

type Transactie = {
  ID: number;
  FietsenstallingID: string;
  SectieID: string | null;
  PasID: string;
  BarcodeFiets_in: string | null;
  BarcodeFiets_uit: string | null;
  Date_checkin: string;
  Date_checkout: string | null;
  Stallingsduur: number | null;
  Type_checkin: string | null;
  Type_checkout: string | null;
  Stallingskosten: number | null;
  dateCreated: string;
};

type Bicycle = { id: string; barcode: string; biketypeID: number };
type LayoutSection = {
  sectionid: string | null;
  name?: string;
  occupation?: number;
  capacity?: number;
  free?: number;
  places?: Array<{ id: number; name?: string; statuscode: number }>;
};
type Layout = {
  occupied?: number;
  free?: number;
  capacity?: number;
  sections?: LayoutSection[];
};

function getStoredCredentials(): { username: string; password: string; baseUrl?: string } | null {
  if (typeof window === "undefined") return null;
  const u = localStorage.getItem("parking-sim-apiUsername");
  const p = localStorage.getItem("parking-sim-apiPassword");
  const b = localStorage.getItem("parking-sim-baseUrl");
  if (!u || !p) return null;
  return { username: u, password: p, baseUrl: b || undefined };
}

const STATUS_LABELS: Record<number, string> = {
  0: "vrij",
  1: "bezet",
  2: "abonnement",
  3: "gereserveerd",
  4: "buiten werking",
};

type Props = {
  locationid: string;
  title: string;
  berekentStallingskosten?: boolean;
};

const StallingPanel: React.FC<Props> = ({ locationid, title, berekentStallingskosten = false }) => {
  const [layout, setLayout] = useState<Layout | null>(null);
  const [state, setState] = useState<{ bicycles: Bicycle[]; session?: { simulationTimeOffsetSeconds?: number } } | null>(null);
  const [selectedBike, setSelectedBike] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [apiMessage, setApiMessage] = useState<string | null>(null);
  const [panelTab, setPanelTab] = useState<"stalling" | "motorblok">("stalling");
  const [wachtrijTransacties, setWachtrijTransacties] = useState<WachtrijTransactie[]>([]);
  const [transacties, setTransacties] = useState<Transactie[]>([]);
  const [motorblokLoading, setMotorblokLoading] = useState(false);
  const [processQueueLoading, setProcessQueueLoading] = useState(false);
  const [processQueueResult, setProcessQueueResult] = useState<string | null>(null);

  const loadLayout = async () => {
    try {
      const res = await fetch(`/api/protected/parking-simulation/sections-places/${locationid}`);
      const data = await res.json();
      setLayout(data);
    } catch {
      setLayout(null);
    }
  };

  const loadState = async () => {
    try {
      const res = await fetch("/api/protected/parking-simulation/state");
      const data = await res.json();
      setState({ bicycles: data.bicycles ?? [], session: data.session });
    } catch {
      setState(null);
    }
  };

  const loadMotorblok = useCallback(async () => {
    setMotorblokLoading(true);
    try {
      const configRes = await fetch("/api/protected/parking-simulation/config");
      const configData = await configRes.json();
      const startDate = configData?.session?.simulationStartDate as string | undefined;
      const cutoff = startDate ? new Date(startDate) : null;
      const cutoffMinusDay = cutoff && !isNaN(cutoff.getTime())
        ? new Date(cutoff.getTime() - 24 * 60 * 60 * 1000)
        : null;
      const txFromParam = cutoffMinusDay ? `&transactionDateFrom=${encodeURIComponent(cutoffMinusDay.toISOString())}` : "";
      const dateCheckinFrom = cutoffMinusDay ? `&dateCheckinFrom=${encodeURIComponent(cutoffMinusDay.toISOString())}` : "";

      const [wachtrijRes, transactiesRes] = await Promise.all([
        fetch(`/api/protected/wachtrij/wachtrij_transacties?bikeparkID=${encodeURIComponent(locationid)}&pageSize=100${txFromParam}`),
        fetch(`/api/protected/transacties?bikeparkID=${encodeURIComponent(locationid)}&pageSize=100${dateCheckinFrom}`),
      ]);

      const wachtrijData = await wachtrijRes.json();
      const transactiesData = await transactiesRes.json();

      setWachtrijTransacties(wachtrijData?.data ?? []);
      setTransacties(transactiesData?.data ?? []);
    } catch {
      setWachtrijTransacties([]);
      setTransacties([]);
    } finally {
      setMotorblokLoading(false);
    }
  }, [locationid]);

  const handleProcessQueue = async () => {
    setProcessQueueLoading(true);
    setProcessQueueResult(null);
    try {
      const res = await fetch("/api/protected/parking-simulation/process-queue", { method: "POST" });
      const data = await res.json();
      if (data.ok) {
        setProcessQueueResult(data.result ?? "");
        loadMotorblok();
      } else {
        setProcessQueueResult("Fout: " + (data.message ?? res.statusText));
      }
    } catch (e) {
      setProcessQueueResult("Fout: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setProcessQueueLoading(false);
    }
  };

  useEffect(() => {
    loadLayout();
  }, [locationid]);

  useEffect(() => {
    loadState();
  }, []);

  useEffect(() => {
    const handler = () => {
      loadLayout();
      loadState();
    };
    window.addEventListener("simulation-clock-updated", handler);
    return () => window.removeEventListener("simulation-clock-updated", handler);
  }, []);

  useEffect(() => {
    if (panelTab === "motorblok") loadMotorblok();
  }, [panelTab, loadMotorblok]);

  const firstSectionId = layout?.sections?.[0]?.sectionid ?? null;

  const fetchSimulationTime = async (): Promise<string> => {
    const res = await fetch("/api/protected/parking-simulation/time");
    const data = await res.json();
    return data.simulationTime ?? new Date().toISOString();
  };

  const handleCheckIn = async () => {
    try {
      const creds = getStoredCredentials();
      if (!creds) {
        setApiMessage("Geen credentials. Configureer in Instellingen of voeg Simulatie Dataprovider toe.");
        return;
      }
      if (!firstSectionId || !selectedBike) {
        setApiMessage("Selecteer fiets. Geen secties beschikbaar.");
        return;
      }
      const bike = state?.bicycles?.find((b) => b.id === selectedBike);
      if (!bike) return;
      setLoading(true);
      setApiMessage(null);
      const simulationTime = await fetchSimulationTime();
      const tx = {
        type: "in" as const,
        transactionDate: simulationTime,
        passID: "SIM-PASS-001",
        idtype: 0,
        barcodeBike: bike.barcode,
        bikeid: bike.barcode,
      };
      const res = await uploadTransaction(creds, locationid, firstSectionId, tx);
      if (res.status === 1) {
        setApiMessage("Check-in succesvol");
        await fetch("/api/protected/parking-simulation/state", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "park",
            bicycleId: selectedBike,
            locationid,
            sectionid: firstSectionId,
            checkedIn: true,
          }),
        });
        loadState();
        loadLayout();
      } else {
        const msg = res.message ?? "onbekend";
        const hint = /unauthorized|401/i.test(String(msg))
          ? " Controleer Instellingen: vul UrlName/Wachtwoord van je dataprovider in. Zorg dat fmsservice_permit toegang geeft tot deze stalling."
          : "";
        setApiMessage("Fout: " + msg + hint);
      }
    } catch (e) {
      setApiMessage("Fout: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setLoading(false);
    }
  };

  const handleCheckOut = async () => {
    try {
      const creds = getStoredCredentials();
      if (!creds) {
        setApiMessage("Geen credentials. Configureer in Instellingen of voeg Simulatie Dataprovider toe.");
        return;
      }
      if (!firstSectionId || !selectedBike) {
        setApiMessage("Selecteer fiets. Geen secties beschikbaar.");
        return;
      }
      const bike = state?.bicycles?.find((b) => b.id === selectedBike);
      if (!bike) return;
      setLoading(true);
      setApiMessage(null);
      const simulationTime = await fetchSimulationTime();
      const tx = {
        type: "out" as const,
        transactionDate: simulationTime,
        passID: "SIM-PASS-001",
        idtype: 0,
        barcodeBike: bike.barcode,
        bikeid: bike.barcode,
      };
      const res = await uploadTransaction(creds, locationid, firstSectionId, tx);
      if (res.status === 1) {
        setApiMessage("Check-out succesvol");
        await fetch("/api/protected/parking-simulation/state", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "remove", bicycleId: selectedBike }),
        });
        loadState();
        loadLayout();
      } else {
        const msg = res.message ?? "onbekend";
        const hint = /unauthorized|401/i.test(String(msg))
          ? " Controleer Instellingen: vul UrlName/Wachtwoord van je dataprovider in. Zorg dat fmsservice_permit toegang geeft tot deze stalling."
          : "";
        setApiMessage("Fout: " + msg + hint);
      }
    } catch (e) {
      setApiMessage("Fout: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setLoading(false);
    }
  };

  const hasCreds = !!getStoredCredentials();

  return (
    <div className="bg-white border rounded-lg p-6">
      <div className="mb-4">
        <h3 className="text-lg font-semibold">{title} ({locationid})</h3>
      </div>

      <div className="flex items-center gap-2 mb-4">
        <Tabs value={panelTab} onChange={(_, v) => setPanelTab(v)}>
          <Tab label="Stalling" value="stalling" />
          <Tab label="Motorblok" value="motorblok" />
        </Tabs>
        <button
          type="button"
          onClick={() => {
            if (panelTab === "stalling") {
              loadState();
              loadLayout();
              setApiMessage(null);
            } else {
              loadMotorblok();
            }
          }}
          title={panelTab === "stalling" ? "Vernieuwen stalling" : "Vernieuwen tabellen"}
          className="p-1.5 rounded text-gray-500 hover:text-gray-700 hover:bg-gray-100"
        >
          <FiRefreshCw className={`w-5 h-5 ${panelTab === "motorblok" && motorblokLoading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {panelTab === "stalling" && (
        <>
      <div className="mb-4 p-4 bg-gray-50 rounded-lg">
        <p className="text-sm text-gray-800 mb-1">
          {berekentStallingskosten === true
            ? "FMS berekent stallingkosten"
            : berekentStallingskosten === false
              ? "Stalling geeft kosten door"
              : "Onbekend"}
        </p>
        <p className="text-xs text-gray-500">
          FMS API: {hasCreds ? "credentials geconfigureerd" : "geen credentials — configureer in Instellingen"}
        </p>
      </div>

      <div className="mb-4 p-4 bg-gray-50 rounded-lg">
        <h4 className="font-medium mb-2">Bezetting (FMS)</h4>
        <p className="text-sm text-gray-700">
          Bezet: {layout?.occupied ?? "—"} / Vrij: {layout?.free ?? "—"}
          {layout?.capacity != null && layout.capacity > 0 && ` / Capaciteit: ${layout.capacity}`}
        </p>
      </div>

      <div className="mb-4">
        <h4 className="font-medium mb-2">Secties</h4>
        {layout?.sections?.length ? (
          <ul className="space-y-2">
            {layout.sections.map((s) => (
              <li key={s.sectionid ?? s.name} className="text-sm">
                <span className="font-medium">{s.sectionid ?? "—"} – {s.name}</span>
                {s.occupation != null && (
                  <span className="text-gray-600 ml-2">(bezet: {s.occupation})</span>
                )}
                {s.places && s.places.length > 0 && (
                  <ul className="list-disc list-inside ml-4 mt-1 text-gray-600">
                    {s.places.map((p) => (
                      <li key={p.id}>
                        {p.name ?? "Plek " + p.id}: {STATUS_LABELS[p.statuscode % 10] ?? "status " + p.statuscode}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-gray-500">Geen secties</p>
        )}
      </div>

      <div className="mb-4">
          <h4 className="font-medium mb-2">Fietsen ({state?.bicycles?.length ?? 0})</h4>
          <select
            value={selectedBike ?? ""}
            onChange={(e) => setSelectedBike(e.target.value || null)}
            className="border rounded px-3 py-2 w-full"
          >
            <option value="">— Selecteer fiets</option>
            {state?.bicycles?.map((b) => (
              <option key={b.id} value={b.id}>{b.barcode} (type {b.biketypeID})</option>
            ))}
          </select>
          {selectedBike && (
            <div className="mt-2 flex gap-2">
              <Button onClick={handleCheckIn} disabled={loading}>
                Check-in
              </Button>
              <Button onClick={handleCheckOut} disabled={loading}>
                Check-out
              </Button>
            </div>
          )}
        </div>

      {apiMessage && (
        <p className={`mt-2 text-sm ${apiMessage.startsWith("Fout") ? "text-red-600" : "text-green-600"}`}>
          {apiMessage}
        </p>
      )}
        </>
      )}

      {panelTab === "motorblok" && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={handleProcessQueue} disabled={processQueueLoading}>
              {processQueueLoading ? "Bezig…" : "Process"}
            </Button>
          </div>
          {processQueueResult != null && (
            <pre className="text-sm p-3 bg-gray-50 border rounded whitespace-pre-wrap">{processQueueResult.replace(/<br\s*\/?>/gi, "\n")}</pre>
          )}
          <div>
            <h4 className="font-medium mb-2">Wachtrij transacties</h4>
            <div className="overflow-x-auto border rounded">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="text-left p-2">ID</th>
                    <th className="text-left p-2">transactionDate</th>
                    <th className="text-left p-2">bikeparkID</th>
                    <th className="text-left p-2">sectionID</th>
                    <th className="text-left p-2">placeID</th>
                    <th className="text-left p-2">passID</th>
                    <th className="text-left p-2">passtype</th>
                    <th className="text-left p-2">type</th>
                    <th className="text-left p-2">processed</th>
                    <th className="text-left p-2">processDate</th>
                    <th className="text-left p-2">dateCreated</th>
                  </tr>
                </thead>
                <tbody>
                  {motorblokLoading ? (
                    <tr><td colSpan={11} className="p-4 text-gray-500">Laden...</td></tr>
                  ) : wachtrijTransacties.length === 0 ? (
                    <tr><td colSpan={11} className="p-4 text-gray-500">Geen wachtrij transacties</td></tr>
                  ) : (
                    wachtrijTransacties.map((r) => (
                      <tr key={r.ID} className="border-t">
                        <td className="p-2">{r.ID}</td>
                        <td className="p-2">{r.transactionDate ? new Date(r.transactionDate).toLocaleString() : "—"}</td>
                        <td className="p-2">{r.bikeparkID}</td>
                        <td className="p-2">{r.sectionID}</td>
                        <td className="p-2">{r.placeID ?? "—"}</td>
                        <td className="p-2">{r.passID}</td>
                        <td className="p-2">{r.passtype ?? "—"}</td>
                        <td className="p-2">{r.type}</td>
                        <td className="p-2" title={r.error ?? undefined}>
                          <span className={r.processed === 2 ? "text-red-600" : r.processed === 1 ? "text-green-600" : "text-gray-500"}>
                            {PROCESSED_LABELS[r.processed] ?? `(${r.processed})`}
                          </span>
                        </td>
                        <td className="p-2">{r.processDate ? new Date(r.processDate).toLocaleString() : "—"}</td>
                        <td className="p-2">{new Date(r.dateCreated).toLocaleString()}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
          <div>
            <h4 className="font-medium mb-2">Transacties</h4>
            <div className="overflow-x-auto border rounded">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="text-left p-2">ID</th>
                    <th className="text-left p-2">SectieID</th>
                    <th className="text-left p-2">PasID</th>
                    <th className="text-left p-2">BarcodeFiets_in</th>
                    <th className="text-left p-2">BarcodeFiets_uit</th>
                    <th className="text-left p-2">Date_checkin</th>
                    <th className="text-left p-2">Date_checkout</th>
                    <th className="text-left p-2">Stallingsduur</th>
                    <th className="text-left p-2">Stallingskosten</th>
                    <th className="text-left p-2">dateCreated</th>
                  </tr>
                </thead>
                <tbody>
                  {motorblokLoading ? (
                    <tr><td colSpan={10} className="p-4 text-gray-500">Laden...</td></tr>
                  ) : transacties.length === 0 ? (
                    <tr><td colSpan={10} className="p-4 text-gray-500">Geen transacties</td></tr>
                  ) : (
                    transacties.map((r) => (
                      <tr key={r.ID} className="border-t">
                        <td className="p-2">{r.ID}</td>
                        <td className="p-2">{r.SectieID ?? "—"}</td>
                        <td className="p-2">{r.PasID}</td>
                        <td className="p-2">{r.BarcodeFiets_in ?? "—"}</td>
                        <td className="p-2">{r.BarcodeFiets_uit ?? "—"}</td>
                        <td className="p-2">{new Date(r.Date_checkin).toLocaleString()}</td>
                        <td className="p-2">{r.Date_checkout ? new Date(r.Date_checkout).toLocaleString() : "—"}</td>
                        <td className="p-2">{r.Stallingsduur ?? "—"}</td>
                        <td className="p-2">{r.Stallingskosten != null ? r.Stallingskosten : "—"}</td>
                        <td className="p-2">{new Date(r.dateCreated).toLocaleString()}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default StallingPanel;
