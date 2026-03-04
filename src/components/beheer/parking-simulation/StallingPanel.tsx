import React, { useState, useEffect, useCallback, useRef } from "react";
import { FiRotateCcw } from "react-icons/fi";
import { Tabs, Tab, Dialog, DialogTitle, DialogContent, DialogActions } from "@mui/material";
import { Button } from "~/components/Button";
import { ActiesPanel } from "./ActiesPanel";
import { StallingSlotOverview } from "./StallingSlotOverview";
import { syncSector } from "~/lib/parking-simulation/fms-api-write-client";

function getStoredCredentials(): { username: string; password: string; baseUrl?: string } | null {
  if (typeof window === "undefined") return null;
  const u = localStorage.getItem("parking-sim-apiUsername");
  const p = localStorage.getItem("parking-sim-apiPassword");
  const b = localStorage.getItem("parking-sim-baseUrl");
  if (!u || !p) return null;
  return { username: u, password: p, baseUrl: b || undefined };
}

type WachtrijTransactie = {
  ID: number;
  transactionDate: string | null;
  bikeparkID: string;
  sectionID: string;
  placeID: number | null;
  passID: string;
  bikeid?: string | null;
  passtype: string | null;
  type: string;
  processed: number;
  processDate: string | null;
  error: string | null;
  dateCreated: string;
};

/** processed codes from ColdFusion processTransactions2.cfm (QUEUE_PROCESSOR_PORTING_PLAN.md Appendix B) */
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

type OccupationEntry = {
  id: string;
  bicycleId: string;
  locationid: string;
  sectionid: string;
  checkedIn?: boolean;
  bicycle?: { id: string; barcode: string; biketypeID?: number };
};

type SyncListSection = { sectionid: string; sectionName?: string; bikes: Array<{ barcode: string; id: string; checkedIn?: boolean }> };

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
  sectionid?: string | null;
  name?: string;
  locationid?: string;
};

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

type WachtrijPasid = { ID: number; bikeparkID: string; passID: string; barcode: string | null; processed: number; processDate: string | null; error: string | null; DateCreated: string };
type WachtrijBetaling = { ID: number; bikeparkID: string; passID: string; transactionDate: string | null; amount: number; processed: number; processDate: string | null; error: string | null; dateCreated: string };
type WachtrijSyncRow = { ID: number; bikeparkID: string; sectionID: string | null; transactionDate: string | null; processed: number; processDate: string | null; error: string | null; dateCreated: string };

const StallingPanel: React.FC<Props> = ({ locationid, title, berekentStallingskosten = false }) => {
  const [layout, setLayout] = useState<Layout | null>(null);
  const [state, setState] = useState<{ bicycles: Bicycle[]; occupation?: OccupationEntry[]; session?: { simulationTimeOffsetSeconds?: number } } | null>(null);
  const [apiMessage, setApiMessage] = useState<string | null>(null);
  const tableTabValues = ["wachtrij_transacties", "transacties", "wachtrij_pasids", "wachtrij_betalingen", "wachtrij_sync"] as const;
  type PanelTabValue = "stalling" | (typeof tableTabValues)[number];
  const [panelTab, setPanelTab] = useState<PanelTabValue>("stalling");
  const [wachtrijTransacties, setWachtrijTransacties] = useState<WachtrijTransactie[]>([]);
  const [transacties, setTransacties] = useState<Transactie[]>([]);
  const [wachtrijPasids, setWachtrijPasids] = useState<WachtrijPasid[]>([]);
  const [wachtrijBetalingen, setWachtrijBetalingen] = useState<WachtrijBetaling[]>([]);
  const [wachtrijSync, setWachtrijSync] = useState<WachtrijSyncRow[]>([]);
  const [motorblokLoading, setMotorblokLoading] = useState(false);
  const [processQueueLoading, setProcessQueueLoading] = useState(false);
  const [processQueueResult, setProcessQueueResult] = useState<string | null>(null);
  const [updateBezettingsdataLoading, setUpdateBezettingsdataLoading] = useState(false);
  const [updateBezettingsdataResult, setUpdateBezettingsdataResult] = useState<string | null>(null);
  const [useLocalProcessor, setUseLocalProcessor] = useState(false);
  const [resettingId, setResettingId] = useState<number | null>(null);
  const [syncListModalOpen, setSyncListModalOpen] = useState(false);
  const [syncList, setSyncList] = useState<SyncListSection[]>([]);
  const [syncLoading, setSyncLoading] = useState(false);
  const [syncLog, setSyncLog] = useState<string[]>([]);
  const loadAbortRef = useRef<AbortController | null>(null);

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
      setState({ bicycles: data.bicycles ?? [], occupation: data.occupation ?? [], session: data.session });
    } catch {
      setState(null);
    }
  };

  const loadMotorblok = useCallback(async (signal?: AbortSignal) => {
    setMotorblokLoading(true);
    const fetchOpts = signal ? { signal } : {};
    try {
      const configRes = await fetch("/api/protected/parking-simulation/config", fetchOpts);
      const configData = await configRes.json();
      const session = configData?.session;
      const useLocal = session?.useLocalProcessor ?? false;
      setUseLocalProcessor(useLocal);

      const startDate = session?.simulationStartDate as string | undefined;
      const cutoff = startDate ? new Date(startDate) : null;
      const cutoffMinusDay = cutoff && !isNaN(cutoff.getTime())
        ? new Date(cutoff.getTime() - 24 * 60 * 60 * 1000)
        : null;
      const txFromParam = cutoffMinusDay ? `&transactionDateFrom=${encodeURIComponent(cutoffMinusDay.toISOString())}` : "";
      const dateCheckinFrom = cutoffMinusDay ? `&dateCheckinFrom=${encodeURIComponent(cutoffMinusDay.toISOString())}` : "";
      const newTablesParam = useLocal ? "&useNewTables=true" : "";

      const [wachtrijRes, transactiesRes, pasidsRes, betalingenRes, syncRes] = await Promise.all([
        fetch(`/api/protected/wachtrij/wachtrij_transacties?bikeparkID=${encodeURIComponent(locationid)}&pageSize=100${txFromParam}${newTablesParam}`, fetchOpts),
        fetch(`/api/protected/transacties?bikeparkID=${encodeURIComponent(locationid)}&pageSize=100${dateCheckinFrom}${newTablesParam}`, fetchOpts),
        fetch(`/api/protected/wachtrij/wachtrij_pasids?bikeparkID=${encodeURIComponent(locationid)}&pageSize=100${txFromParam}${newTablesParam}`, fetchOpts),
        fetch(`/api/protected/wachtrij/wachtrij_betalingen?bikeparkID=${encodeURIComponent(locationid)}&pageSize=100${txFromParam}${newTablesParam}`, fetchOpts),
        fetch(`/api/protected/wachtrij/wachtrij_sync?bikeparkID=${encodeURIComponent(locationid)}&pageSize=100${txFromParam}${newTablesParam}`, fetchOpts),
      ]);

      const [wachtrijData, transactiesData, pasidsData, betalingenData, syncData] = await Promise.all([
        wachtrijRes.json(),
        transactiesRes.json(),
        pasidsRes.json(),
        betalingenRes.json(),
        syncRes.json(),
      ]);

      setWachtrijTransacties(wachtrijData?.data ?? []);
      setTransacties(transactiesData?.data ?? []);
      setWachtrijPasids(pasidsData?.data ?? []);
      setWachtrijBetalingen(betalingenData?.data ?? []);
      setWachtrijSync(syncData?.data ?? []);
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") return;
      setWachtrijTransacties([]);
      setTransacties([]);
      setWachtrijPasids([]);
      setWachtrijBetalingen([]);
      setWachtrijSync([]);
    } finally {
      setMotorblokLoading(false);
    }
  }, [locationid]);

  const handleProcessQueue = async () => {
    setProcessQueueLoading(true);
    setProcessQueueResult(null);
    setUpdateBezettingsdataResult(null);
    setSyncLog([]);
    try {
      const res = await fetch("/api/protected/parking-simulation/process-queue", { method: "POST" });
      const data = await res.json();
      if (data.ok) {
        const r = data.result;
        const text =
          typeof r === "string"
            ? r
            : r && typeof r === "object"
              ? `pasids: ${r.pasids?.processed ?? 0} ok, ${r.pasids?.errors ?? 0} err\n` +
                `transacties: ${r.transacties?.processed ?? 0} ok, ${r.transacties?.errors ?? 0} err\n` +
                `betalingen: ${r.betalingen?.processed ?? 0} ok, ${r.betalingen?.errors ?? 0} err\n` +
                `sync: ${r.sync?.processed ?? 0} ok, ${r.sync?.errors ?? 0} err`
              : "";
        setProcessQueueResult(text);
        loadState();
        loadLayout();
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

  const handleUpdateBezettingsdata = async () => {
    setUpdateBezettingsdataLoading(true);
    setUpdateBezettingsdataResult(null);
    setProcessQueueResult(null);
    try {
      const res = await fetch("/api/protected/parking-simulation/update-bezettingsdata", { method: "POST" });
      const data = await res.json();
      if (data.ok) {
        const msg = data.message ?? (data.rowsProcessed != null ? `${data.rowsProcessed} rows` : "OK");
        setUpdateBezettingsdataResult(msg);
      } else {
        setUpdateBezettingsdataResult("Fout: " + (data.message ?? res.statusText));
      }
    } catch (e) {
      setUpdateBezettingsdataResult("Fout: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setUpdateBezettingsdataLoading(false);
    }
  };

  const handleRefreshAll = () => {
    loadState();
    loadLayout();
    setApiMessage(null);
    if (tableTabValues.includes(panelTab as (typeof tableTabValues)[number])) {
      loadMotorblok();
    }
  };

  const normalizedSections = ((): Array<{ sectionid: string; name?: string }> => {
    if (!layout) return [];
    if (layout.sections && layout.sections.length > 0) {
      return layout.sections
        .filter((s): s is LayoutSection & { sectionid: string } => !!s.sectionid)
        .map((s) => ({ sectionid: s.sectionid, name: s.name }));
    }
    if (layout.sectionid || layout.locationid) {
      return [{ sectionid: layout.sectionid ?? layout.locationid ?? "", name: layout.name }];
    }
    return [];
  })();

  const buildSyncList = useCallback((): SyncListSection[] => {
    const occ = state?.occupation ?? [];
    return normalizedSections.map((s) => ({
      sectionid: s.sectionid,
      sectionName: s.name,
      bikes: occ
        .filter((o) => o.locationid === locationid && o.sectionid === s.sectionid)
        .map((o) => ({ barcode: o.bicycle?.barcode ?? o.bicycleId, id: o.bicycleId, checkedIn: o.checkedIn })),
    }));
  }, [state?.occupation, locationid, layout]);

  const handleSyncClick = async () => {
    const list = buildSyncList();
    if (list.length === 0) {
      setApiMessage("Geen secties in layout. Voeg secties toe om te synchroniseren.");
      return;
    }
    await loadMotorblok();
    setSyncList(list);
    setSyncListModalOpen(true);
  };

  const handleSyncExecute = async () => {
    const creds = getStoredCredentials();
    if (!creds) {
      setSyncLog(["Fout: Geen credentials. Configureer in Instellingen."]);
      return;
    }
    setSyncListModalOpen(false);
    setSyncLoading(true);
    setSyncLog([]);
    setProcessQueueResult(null);
    const log: string[] = [];
    try {
      const timeRes = await fetch("/api/protected/parking-simulation/time");
      const timeData = await timeRes.json();
      const transactionDate = timeData.simulationTime ?? new Date().toISOString();

      for (const sec of syncList) {
        const bikes = sec.bikes.map((b) => ({
          idcode: b.barcode,
          bikeid: b.barcode,
          idtype: 0,
          transactiondate: transactionDate,
        }));
        log.push(`syncSector ${locationid}/${sec.sectionid}: ${bikes.length} fietsen`);
        const res = await syncSector(creds, locationid, sec.sectionid, { bikes, transactionDate });
        if (res.status === 1) {
          log.push(`  OK (id: ${res.id})`);
        } else {
          log.push(`  Fout: ${res.message ?? "onbekend"}`);
        }
      }

      log.push("Process queue...");
      const pqRes = await fetch("/api/protected/parking-simulation/process-queue", { method: "POST" });
      const pqData = await pqRes.json();
      if (pqData.ok && pqData.result) {
        const r = pqData.result;
        log.push(`  pasids: ${r.pasids?.processed ?? 0} ok, ${r.pasids?.errors ?? 0} err`);
        log.push(`  transacties: ${r.transacties?.processed ?? 0} ok, ${r.transacties?.errors ?? 0} err`);
        log.push(`  betalingen: ${r.betalingen?.processed ?? 0} ok, ${r.betalingen?.errors ?? 0} err`);
        log.push(`  sync: ${r.sync?.processed ?? 0} ok, ${r.sync?.errors ?? 0} err`);
      } else {
        log.push(`  Fout: ${pqData.message ?? "onbekend"}`);
      }

      loadState();
      loadLayout();
      loadMotorblok();
    } catch (e) {
      log.push("Fout: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setSyncLog(log);
      setSyncLoading(false);
    }
  };

  const handleResetTransactie = async (id: number) => {
    setResettingId(id);
    try {
      const res = await fetch("/api/protected/wachtrij/reset-transactie", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, useNewTables: useLocalProcessor }),
      });
      const data = await res.json();
      if (data.ok) {
        loadMotorblok();
      } else {
        setProcessQueueResult("Fout reset: " + (data.error ?? res.statusText));
      }
    } catch (e) {
      setProcessQueueResult("Fout: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setResettingId(null);
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
    if (panelTab === "stalling") {
      loadState();
      loadLayout();
      return;
    }
    if (!tableTabValues.includes(panelTab as (typeof tableTabValues)[number])) return;
    loadAbortRef.current?.abort();
    const controller = new AbortController();
    loadAbortRef.current = controller;
    void loadMotorblok(controller.signal);
    return () => {
      controller.abort();
    };
  }, [panelTab, loadMotorblok]);

  return (
    <div className="bg-white border rounded-lg p-6">
      <div className="mb-4">
        <h3 className="text-lg font-semibold">{title} ({locationid})</h3>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <Button onClick={handleProcessQueue} disabled={processQueueLoading} style={{ backgroundColor: "#16a34a" }}>
          {processQueueLoading ? "Bezig…" : useLocalProcessor ? "Process (new)" : "Process"}
        </Button>
        <Button onClick={handleUpdateBezettingsdata} disabled={updateBezettingsdataLoading} style={{ backgroundColor: "#16a34a" }}>
          {updateBezettingsdataLoading ? "Bezig…" : "Update bezettingsdata"}
        </Button>
        <Button onClick={handleSyncClick} disabled={!getStoredCredentials()} style={{ backgroundColor: "#16a34a" }}>
          Sync
        </Button>
        <Button onClick={handleRefreshAll} disabled={motorblokLoading} style={{ backgroundColor: "#16a34a" }}>
          {motorblokLoading ? "Bezig…" : "refresh"}
        </Button>
      </div>

      <div className="flex items-center gap-2 mb-4">
        <Tabs value={panelTab} onChange={(_, v) => setPanelTab(v as PanelTabValue)}>
          <Tab label="Stalling" value="stalling" />
          <Tab label={useLocalProcessor ? "Wachtrij transacties (new)" : "Wachtrij transacties"} value="wachtrij_transacties" />
          <Tab label={useLocalProcessor ? "Wachtrij pasids (new)" : "Wachtrij pasids"} value="wachtrij_pasids" />
          <Tab label={useLocalProcessor ? "Wachtrij betalingen (new)" : "Wachtrij betalingen"} value="wachtrij_betalingen" />
          <Tab label={useLocalProcessor ? "Wachtrij sync (new)" : "Wachtrij sync"} value="wachtrij_sync" />
          <Tab label={useLocalProcessor ? "Transacties (new)" : "Transacties"} value="transacties" />
        </Tabs>
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
          FMS API: {getStoredCredentials() ? "credentials geconfigureerd" : "geen credentials — configureer in Instellingen"}
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
          <ActiesPanel
            locationid={locationid}
            stallings={[{ id: locationid, locationid, title }]}
            onMessage={setApiMessage}
            onSuccess={() => {
              loadState();
              loadLayout();
              window.dispatchEvent(new CustomEvent("parking-slot-updated"));
            }}
          />
        </div>

      <div className="mb-4">
        <StallingSlotOverview locationid={locationid} title="Plaatsen overzicht" />
      </div>

      {apiMessage && (
        <p className={`mt-2 text-sm ${apiMessage.startsWith("Fout") ? "text-red-600" : "text-green-600"}`}>
          {apiMessage}
        </p>
      )}
        </>
      )}

      {tableTabValues.includes(panelTab as (typeof tableTabValues)[number]) && (
        <div className="space-y-4">
          {(processQueueResult != null || updateBezettingsdataResult != null || syncLog.length > 0) && (
            <pre className="text-sm p-3 bg-gray-50 border rounded whitespace-pre-wrap">
              {syncLog.length > 0
                ? syncLog.join("\n")
                : updateBezettingsdataResult != null
                  ? String(updateBezettingsdataResult).replace(/<br\s*\/?>/gi, "\n")
                  : String(processQueueResult).replace(/<br\s*\/?>/gi, "\n")}
            </pre>
          )}
          {panelTab === "wachtrij_transacties" && (
          <div>
            <h4 className="font-medium mb-2">{useLocalProcessor ? "Wachtrij transacties (new)" : "Wachtrij transacties"}</h4>
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
                    <th className="text-left p-2">bikeid</th>
                    <th className="text-left p-2">passtype</th>
                    <th className="text-left p-2">type</th>
                    <th className="text-left p-2">processed</th>
                    <th className="text-left p-2">processDate</th>
                    <th className="text-left p-2">dateCreated</th>
                    <th className="text-left p-2">Acties</th>
                  </tr>
                </thead>
                <tbody>
                  {motorblokLoading ? (
                    <tr><td colSpan={13} className="p-4 text-gray-500">Laden...</td></tr>
                  ) : wachtrijTransacties.length === 0 ? (
                    <tr><td colSpan={13} className="p-4 text-gray-500">Geen wachtrij transacties</td></tr>
                  ) : (
                    wachtrijTransacties.map((r) => (
                      <tr key={r.ID} className="border-t">
                        <td className="p-2">{r.ID}</td>
                        <td className="p-2">{r.transactionDate ? new Date(r.transactionDate).toLocaleString() : "—"}</td>
                        <td className="p-2">{r.bikeparkID}</td>
                        <td className="p-2">{r.sectionID}</td>
                        <td className="p-2">{r.placeID ?? "—"}</td>
                        <td className="p-2">{r.passID}</td>
                        <td className="p-2">{r.bikeid ?? "—"}</td>
                        <td className="p-2">{r.passtype ?? "—"}</td>
                        <td className="p-2">{r.type}</td>
                        <td className="p-2" title={r.error ?? undefined}>
                          <span className={r.processed === 2 ? "text-red-600" : r.processed === 1 ? "text-green-600" : "text-gray-500"}>
                            {PROCESSED_LABELS[r.processed] ?? `(${r.processed})`}
                          </span>
                        </td>
                        <td className="p-2">{r.processDate ? new Date(r.processDate).toLocaleString() : "—"}</td>
                        <td className="p-2">{new Date(r.dateCreated).toLocaleString()}</td>
                        <td className="p-2">
                          {(r.processed === 2 || r.processed === 8 || r.processed === 9) && (
                            <button
                              type="button"
                              onClick={() => handleResetTransactie(r.ID)}
                              disabled={resettingId === r.ID}
                              className="p-1 rounded hover:bg-gray-200 text-gray-600 hover:text-gray-800 disabled:opacity-50"
                              title="Reset naar wachtend (opnieuw verwerken)"
                            >
                              <FiRotateCcw className={`w-4 h-4 ${resettingId === r.ID ? "animate-spin" : ""}`} />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
          )}
          {panelTab === "transacties" && (
          <div>
            <h4 className="font-medium mb-2">{useLocalProcessor ? "Transacties (new)" : "Transacties"}</h4>
            <div className="overflow-x-auto border rounded">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="text-left p-2">ID</th>
                    <th className="text-left p-2">SectieID</th>
                    <th className="text-left p-2">PasID</th>
                    <th className="text-left p-2">Fiets in</th>
                    <th className="text-left p-2">Fiets uit</th>
                    <th className="text-left p-2">Type_checkin</th>
                    <th className="text-left p-2">Type_checkout</th>
                    <th className="text-left p-2">Date_checkin</th>
                    <th className="text-left p-2">Date_checkout</th>
                    <th className="text-left p-2">Stallingsduur</th>
                    <th className="text-left p-2">Stallingskosten</th>
                    <th className="text-left p-2">dateCreated</th>
                  </tr>
                </thead>
                <tbody>
                  {motorblokLoading ? (
                    <tr><td colSpan={12} className="p-4 text-gray-500">Laden...</td></tr>
                  ) : transacties.length === 0 ? (
                    <tr><td colSpan={12} className="p-4 text-gray-500">Geen transacties</td></tr>
                  ) : (
                    transacties.map((r) => (
                      <tr key={r.ID} className="border-t">
                        <td className="p-2">{r.ID}</td>
                        <td className="p-2">{r.SectieID ?? "—"}</td>
                        <td className="p-2">{r.PasID}</td>
                        <td className="p-2">{r.BarcodeFiets_in ?? "—"}</td>
                        <td className="p-2">{r.BarcodeFiets_uit ?? "—"}</td>
                        <td className="p-2">{r.Type_checkin ?? "—"}</td>
                        <td className="p-2">{r.Type_checkout ?? "—"}</td>
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
          )}
          {panelTab === "wachtrij_pasids" && (
          <div>
            <h4 className="font-medium mb-2">{useLocalProcessor ? "Wachtrij pasids (new)" : "Wachtrij pasids"}</h4>
            <div className="overflow-x-auto border rounded">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="text-left p-2">ID</th>
                    <th className="text-left p-2">bikeparkID</th>
                    <th className="text-left p-2">passID</th>
                    <th className="text-left p-2">barcode</th>
                    <th className="text-left p-2">processed</th>
                    <th className="text-left p-2">processDate</th>
                    <th className="text-left p-2">DateCreated</th>
                  </tr>
                </thead>
                <tbody>
                  {motorblokLoading ? (
                    <tr><td colSpan={7} className="p-4 text-gray-500">Laden...</td></tr>
                  ) : wachtrijPasids.length === 0 ? (
                    <tr><td colSpan={7} className="p-4 text-gray-500">Geen wachtrij pasids</td></tr>
                  ) : (
                    wachtrijPasids.map((r) => (
                      <tr key={r.ID} className="border-t">
                        <td className="p-2">{r.ID}</td>
                        <td className="p-2">{r.bikeparkID}</td>
                        <td className="p-2">{r.passID}</td>
                        <td className="p-2">{r.barcode ?? "—"}</td>
                        <td className="p-2">{PROCESSED_LABELS[r.processed] ?? `(${r.processed})`}</td>
                        <td className="p-2">{r.processDate ? new Date(r.processDate).toLocaleString() : "—"}</td>
                        <td className="p-2">{new Date(r.DateCreated).toLocaleString()}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
          )}
          {panelTab === "wachtrij_betalingen" && (
          <div>
            <h4 className="font-medium mb-2">{useLocalProcessor ? "Wachtrij betalingen (new)" : "Wachtrij betalingen"}</h4>
            <div className="overflow-x-auto border rounded">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="text-left p-2">ID</th>
                    <th className="text-left p-2">bikeparkID</th>
                    <th className="text-left p-2">passID</th>
                    <th className="text-left p-2">transactionDate</th>
                    <th className="text-left p-2">amount</th>
                    <th className="text-left p-2">processed</th>
                    <th className="text-left p-2">processDate</th>
                    <th className="text-left p-2">dateCreated</th>
                  </tr>
                </thead>
                <tbody>
                  {motorblokLoading ? (
                    <tr><td colSpan={8} className="p-4 text-gray-500">Laden...</td></tr>
                  ) : wachtrijBetalingen.length === 0 ? (
                    <tr><td colSpan={8} className="p-4 text-gray-500">Geen wachtrij betalingen</td></tr>
                  ) : (
                    wachtrijBetalingen.map((r) => (
                      <tr key={r.ID} className="border-t">
                        <td className="p-2">{r.ID}</td>
                        <td className="p-2">{r.bikeparkID}</td>
                        <td className="p-2">{r.passID}</td>
                        <td className="p-2">{r.transactionDate ? new Date(r.transactionDate).toLocaleString() : "—"}</td>
                        <td className="p-2">{r.amount}</td>
                        <td className="p-2">{PROCESSED_LABELS[r.processed] ?? `(${r.processed})`}</td>
                        <td className="p-2">{r.processDate ? new Date(r.processDate).toLocaleString() : "—"}</td>
                        <td className="p-2">{new Date(r.dateCreated).toLocaleString()}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
          )}
          {panelTab === "wachtrij_sync" && (
          <div>
            <h4 className="font-medium mb-2">{useLocalProcessor ? "Wachtrij sync (new)" : "Wachtrij sync"}</h4>
            <div className="overflow-x-auto border rounded">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="text-left p-2">ID</th>
                    <th className="text-left p-2">bikeparkID</th>
                    <th className="text-left p-2">sectionID</th>
                    <th className="text-left p-2">transactionDate</th>
                    <th className="text-left p-2">processed</th>
                    <th className="text-left p-2">processDate</th>
                    <th className="text-left p-2">dateCreated</th>
                  </tr>
                </thead>
                <tbody>
                  {motorblokLoading ? (
                    <tr><td colSpan={7} className="p-4 text-gray-500">Laden...</td></tr>
                  ) : wachtrijSync.length === 0 ? (
                    <tr><td colSpan={7} className="p-4 text-gray-500">Geen wachtrij sync</td></tr>
                  ) : (
                    wachtrijSync.map((r) => (
                      <tr key={r.ID} className="border-t">
                        <td className="p-2">{r.ID}</td>
                        <td className="p-2">{r.bikeparkID}</td>
                        <td className="p-2">{r.sectionID ?? "—"}</td>
                        <td className="p-2">{r.transactionDate ? new Date(r.transactionDate).toLocaleString() : "—"}</td>
                        <td className="p-2">{PROCESSED_LABELS[r.processed] ?? `(${r.processed})`}</td>
                        <td className="p-2">{r.processDate ? new Date(r.processDate).toLocaleString() : "—"}</td>
                        <td className="p-2">{new Date(r.dateCreated).toLocaleString()}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
          )}
        </div>
      )}

      <Dialog open={syncListModalOpen} onClose={() => setSyncListModalOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Sync-lijst</DialogTitle>
        <DialogContent>
          <p className="text-sm text-gray-600 mb-2">Fietsen die worden gemeld als aanwezig:</p>
          <ul className="space-y-2 text-sm mb-4">
            {syncList.map((sec) => (
              <li key={sec.sectionid}>
                <span className="font-medium">{sec.sectionName ?? sec.sectionid}</span>:
                <ul className="ml-4 mt-1 list-disc">
                  {sec.bikes.length === 0 ? (
                    <li className="text-gray-500">(geen)</li>
                  ) : (
                    sec.bikes.map((b) => (
                      <li key={b.id}>
                        {b.barcode} <span className="text-gray-500">({b.checkedIn === true ? "niet uitgecheckt" : "niet ingecheckt"})</span>
                      </li>
                    ))
                  )}
                </ul>
              </li>
            ))}
          </ul>
          {(() => {
            const openTx = transacties.filter((t) => !t.Date_checkout);
            if (openTx.length === 0) return null;
            const bySection = new Map<string, Transactie[]>();
            for (const t of openTx) {
              const sid = t.SectieID ?? "";
              if (!bySection.has(sid)) bySection.set(sid, []);
              bySection.get(sid)!.push(t);
            }
            return (
              <>
                <p className="text-sm text-gray-600 mb-2">Open transacties die worden uitgecheckt (niet in bovenstaande lijst):</p>
                <ul className="space-y-2 text-sm">
                  {Array.from(bySection.entries()).map(([sid, txList]) => {
                    const sec = syncList.find((s) => s.sectionid === sid);
                    return (
                      <li key={sid}>
                        <span className="font-medium">{(sec?.sectionName ?? sid) || "(geen sectie)"}</span>:
                        <ul className="ml-4 mt-1 list-disc">
                          {txList.map((t) => (
                            <li key={t.ID}>{t.BarcodeFiets_in ?? t.PasID}</li>
                          ))}
                        </ul>
                      </li>
                    );
                  })}
                </ul>
              </>
            );
          })()}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSyncListModalOpen(false)}>Annuleren</Button>
          <Button onClick={() => void handleSyncExecute()} disabled={syncLoading}>
            {syncLoading ? "Bezig…" : "OK"}
          </Button>
        </DialogActions>
      </Dialog>
    </div>
  );
};

export default StallingPanel;
