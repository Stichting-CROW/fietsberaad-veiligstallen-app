import React, { useState, useEffect, useMemo } from "react";
import { useSession } from "next-auth/react";
import { FiTrash2 } from "react-icons/fi";
import { Dialog, DialogTitle, DialogContent, DialogActions } from "@mui/material";
import { Button } from "~/components/Button";
import { userHasRight } from "~/types/utils";
import { VSSecurityTopic } from "~/types/securityprofile";
import { useFietsenstallingenCompact } from "~/hooks/useFietsenstallingenCompact";
import { useFietsenstallingtypen } from "~/hooks/useFietsenstallingtypen";
import { useGemeentenInLijst } from "~/hooks/useGemeenten";
type TestStalling = { id: string; locationid: string; title: string; type: string };

const SettingsTab: React.FC = () => {
  const { data: session } = useSession();
  const [apiUsername, setApiUsername] = useState("");
  const [apiPassword, setApiPassword] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [processQueueBaseUrl, setProcessQueueBaseUrl] = useState("https://remote.veiligstallenontwikkel.nl");
  const [simulationDataproviderExists, setSimulationDataproviderExists] = useState<boolean | null>(null);
  const [simulationDataproviderLoading, setSimulationDataproviderLoading] = useState(false);
  const [bootstrapMessage, setBootstrapMessage] = useState<string | null>(null);
  const [testGemeenteStatus, setTestGemeenteStatus] = useState<{ exists: boolean; id: string | null } | null>(null);
  const [testStallings, setTestStallings] = useState<TestStalling[]>([]);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [cloneType, setCloneType] = useState("");
  const [cloneSiteId, setCloneSiteId] = useState("");
  const [cloneStallingSearch, setCloneStallingSearch] = useState("");
  const [selectedSourceId, setSelectedSourceId] = useState("");
  const [cloneTitle, setCloneTitle] = useState("");
  const [cloneLoading, setCloneLoading] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState<string | null>(null);
  const [tablesExist, setTablesExist] = useState<boolean | null>(null);
  const [tablesLoading, setTablesLoading] = useState(false);

  const hasAccess = userHasRight(session?.user?.securityProfile, VSSecurityTopic.fietsberaad_superadmin);

  const { fietsenstallingtypen } = useFietsenstallingtypen();
  const { gemeenten } = useGemeentenInLijst();
  const cloneDataOwners = useMemo(
    () => gemeenten.filter((g) => g.hasStallingen).map((g) => ({ id: g.ID, companyName: g.CompanyName ?? g.ID })),
    [gemeenten]
  );

  const { fietsenstallingen, isLoading: cloneStallingsLoading } = useFietsenstallingenCompact(cloneSiteId || undefined);
  const cloneStallings = useMemo(() => {
    if (!cloneType || !cloneSiteId) return [];
    let filtered = fietsenstallingen.filter((f) => f.Type === cloneType);
    if (cloneStallingSearch.trim()) {
      const q = cloneStallingSearch.trim().toLowerCase();
      filtered = filtered.filter((f) => (f.Title ?? "").toLowerCase().includes(q));
    }
    return filtered.map((f) => ({
      id: f.ID,
      locationid: f.StallingsID ?? "",
      title: f.Title ?? "",
      type: f.Type ?? "",
    }));
  }, [fietsenstallingen, cloneType, cloneSiteId, cloneStallingSearch]);

  const fetchTablesStatus = async () => {
    try {
      const res = await fetch("/api/protected/parking-simulation/tables");
      if (res.ok) {
        const data = await res.json();
        setTablesExist(data.tablesExist ?? false);
      } else {
        setTablesExist(null);
      }
    } catch {
      setTablesExist(null);
    }
  };

  useEffect(() => {
    if (hasAccess) void fetchTablesStatus();
  }, [hasAccess]);

  const loadCredentials = async () => {
    try {
      const res = await fetch("/api/protected/parking-simulation/config");
      const data = await res.json();
      const session = data.session;
      if (session) {
        setBaseUrl(session.baseUrl ?? "");
        setProcessQueueBaseUrl(session.processQueueBaseUrl ?? "https://remote.veiligstallenontwikkel.nl");
      } else {
        setBaseUrl("");
        setProcessQueueBaseUrl("https://remote.veiligstallenontwikkel.nl");
      }
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    loadCredentials();
  }, []);

  useEffect(() => {
    const onStallingsUpdated = () => loadCredentials();
    window.addEventListener("stallings-updated", onStallingsUpdated);
    return () => window.removeEventListener("stallings-updated", onStallingsUpdated);
  }, []);

  const fetchTestGemeenteStatus = async () => {
    if (!hasAccess) return;
    try {
      const res = await fetch("/api/protected/parking-simulation/test-gemeente/status");
      if (res.ok) {
        const data = await res.json();
        setTestGemeenteStatus({ exists: data.exists, id: data.id ?? null });
      }
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    void fetchTestGemeenteStatus();
  }, [hasAccess]);

  const fetchTestStallings = async () => {
    if (!hasAccess || !testGemeenteStatus?.exists || !testGemeenteStatus?.id) {
      setTestStallings([]);
      return;
    }
    try {
      const res = await fetch(`/api/protected/fietsenstallingen?GemeenteID=${testGemeenteStatus.id}`);
      const json = (await (res.ok ? res.json() : { data: [] })) as { data?: Array<{ ID: string; StallingsID: string; Title: string | null; Type: string | null }> };
      const list = json.data ?? [];
      setTestStallings(
        list.map((s) => ({
          id: s.ID,
          locationid: s.StallingsID,
          title: s.Title ?? "",
          type: s.Type ?? "",
        }))
      );
    } catch {
      setTestStallings([]);
    }
  };

  useEffect(() => {
    if (testGemeenteStatus?.exists && testGemeenteStatus?.id) {
      void fetchTestStallings();
    } else {
      setTestStallings([]);
    }
  }, [testGemeenteStatus?.exists, testGemeenteStatus?.id, hasAccess]);

  useEffect(() => {
    const onUpdated = () => {
      void fetchTestStallings();
      void fetchTestGemeenteStatus();
    };
    window.addEventListener("stallings-updated", onUpdated);
    return () => window.removeEventListener("stallings-updated", onUpdated);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setApiUsername(localStorage.getItem("parking-sim-apiUsername") ?? "");
    setApiPassword(localStorage.getItem("parking-sim-apiPassword") ?? "");
  }, []);

  const fetchSimulationDataproviderStatus = async () => {
    if (!hasAccess) return;
    try {
      const res = await fetch("/api/protected/parking-simulation/dataprovider");
      if (res.ok) {
        const data = await res.json();
        setSimulationDataproviderExists(data.exists ?? false);
      } else {
        setSimulationDataproviderExists(null);
      }
    } catch {
      setSimulationDataproviderExists(null);
    }
  };

  useEffect(() => {
    void fetchSimulationDataproviderStatus();
  }, [hasAccess]);

  const saveToStorage = async () => {
    if (typeof window === "undefined") return;
    localStorage.setItem("parking-sim-apiUsername", apiUsername);
    localStorage.setItem("parking-sim-apiPassword", apiPassword ?? "");
    localStorage.setItem("parking-sim-baseUrl", baseUrl);
    try {
      await fetch("/api/protected/parking-simulation/config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ baseUrl: baseUrl || null, processQueueBaseUrl: processQueueBaseUrl || null }),
      });
    } catch (e) {
      console.error(e);
    }
  };

  const createSimulationDataprovider = async () => {
    setSimulationDataproviderLoading(true);
    setBootstrapMessage(null);
    try {
      const res = await fetch("/api/protected/parking-simulation/dataprovider", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? res.statusText);
      if (typeof window !== "undefined") {
        localStorage.setItem("parking-sim-apiUsername", data.urlname ?? "");
        localStorage.setItem("parking-sim-apiPassword", data.password ?? "");
        setApiUsername(data.urlname ?? "");
        setApiPassword(data.password ?? "");
      }
      setSimulationDataproviderExists(true);
      setBootstrapMessage("Simulatie dataprovider aangemaakt. Credentials opgeslagen.");
    } catch (e) {
      setBootstrapMessage("Fout: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setSimulationDataproviderLoading(false);
    }
  };

  const deleteSimulationDataprovider = async () => {
    setSimulationDataproviderLoading(true);
    setBootstrapMessage(null);
    try {
      const res = await fetch("/api/protected/parking-simulation/dataprovider", { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? res.statusText);
      if (typeof window !== "undefined") {
        localStorage.removeItem("parking-sim-apiUsername");
        localStorage.removeItem("parking-sim-apiPassword");
        setApiUsername("");
        setApiPassword("");
      }
      setSimulationDataproviderExists(false);
      setBootstrapMessage("Simulatie dataprovider verwijderd.");
    } catch (e) {
      setBootstrapMessage("Fout: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setSimulationDataproviderLoading(false);
    }
  };

  useEffect(() => {
    if (!cloneType || !cloneSiteId) setSelectedSourceId("");
  }, [cloneType, cloneSiteId]);

  useEffect(() => {
    if (selectedSourceId && fietsenstallingtypen.length > 0) {
      const src = cloneStallings.find((s) => s.id === selectedSourceId);
      const typeName = fietsenstallingtypen.find((t) => t.id === (src?.type ?? cloneType))?.name ?? cloneType;
      const existingTitles = testStallings.filter((s) => s.type === (src?.type ?? cloneType)).map((s) => s.title);
      let n = 1;
      let defaultTitle = `API ${typeName} #${n}`;
      while (existingTitles.includes(defaultTitle)) {
        n++;
        defaultTitle = `API ${typeName} #${n}`;
      }
      setCloneTitle(defaultTitle);
    }
  }, [selectedSourceId, cloneStallings, fietsenstallingtypen, cloneType, testStallings]);

  const handleCloneStalling = async () => {
    if (!selectedSourceId || !cloneTitle.trim()) return;
    setCloneLoading(true);
    setBootstrapMessage(null);
    try {
      const res = await fetch("/api/protected/parking-simulation/clone-stalling", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceStallingId: selectedSourceId, title: cloneTitle.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? res.statusText);
      setBootstrapMessage("Stalling gekloond.");
      setAddDialogOpen(false);
      setSelectedSourceId("");
      setCloneTitle("");
      window.dispatchEvent(new CustomEvent("stallings-updated"));
    } catch (e) {
      setBootstrapMessage("Fout: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setCloneLoading(false);
    }
  };

  const handleTablesAction = async (action: "create" | "remove") => {
    if (!hasAccess) return;
    setTablesLoading(true);
    setBootstrapMessage(null);
    try {
      if (action === "remove" && !window.confirm("Weet je zeker dat je de parkingmgmt-tabellen wilt verwijderen? Alle simulatiegegevens gaan verloren.")) {
        setTablesLoading(false);
        return;
      }
      const res = await fetch("/api/protected/parking-simulation/tables", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (data.ok) {
        setBootstrapMessage(data.message ?? (action === "create" ? "Tabellen aangemaakt" : "Tabellen verwijderd"));
        await fetchTablesStatus();
        window.dispatchEvent(new CustomEvent("tables-updated"));
      } else {
        setBootstrapMessage("Fout: " + (data.message ?? res.statusText));
      }
    } catch (e) {
      setBootstrapMessage("Fout: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setTablesLoading(false);
    }
  };

  const handleDeleteStalling = async (id: string) => {
    setDeleteLoading(id);
    setBootstrapMessage(null);
    try {
      const res = await fetch(`/api/protected/fietsenstallingen/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? res.statusText);
      setBootstrapMessage("Stalling verwijderd.");
      window.dispatchEvent(new CustomEvent("stallings-updated"));
    } catch (e) {
      setBootstrapMessage("Fout: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setDeleteLoading(null);
    }
  };

  return (
    <div className="bg-white border rounded-lg p-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">Instellen Simulatieomgeving</h2>
        <div className="space-y-6">
          {hasAccess && (
            <div>
              <h4 className="text-base font-medium text-gray-900 mb-2">Parkeer Simulatie tabellen</h4>
              <div className="flex items-center gap-4 [&_button]:mb-0">
                <span className="text-sm font-medium">
                  Status: {tablesLoading ? "Bezig…" : tablesExist === true ? "Aanwezig" : tablesExist === false ? "Niet aanwezig" : "—"}
                </span>
                <Button
                  onClick={() => void handleTablesAction(tablesExist === true ? "remove" : "create")}
                  disabled={tablesLoading}
                  className={tablesExist === true ? "bg-red-600 hover:bg-red-700" : undefined}
                >
                  {tablesExist === true ? "Verwijder tabellen" : "Maak tabellen"}
                </Button>
              </div>
            </div>
          )}
          {tablesExist === true && (
          <>
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h4 className="text-base font-medium text-gray-900">Teststallingen</h4>
              <button
                type="button"
                onClick={() => {
                  setAddDialogOpen(true);
                  setCloneType("");
                  setCloneSiteId("");
                  setCloneStallingSearch("");
                  setSelectedSourceId("");
                  setCloneTitle("");
                }}
                disabled={!testGemeenteStatus?.exists || !hasAccess}
                title="Stalling toevoegen"
                className="px-4 py-2 rounded font-medium text-white bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-green-600"
              >
                Toevoegen
              </button>
            </div>
            <p className="text-sm text-gray-600 mb-2">
              Kloon bestaande stallingen naar de testgemeente. Nodig voor de simulatie.
            </p>
            <div className="overflow-x-auto border rounded mt-2">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="px-3 py-2 text-left text-sm font-medium text-gray-700">Title</th>
                    <th className="px-3 py-2 text-left text-sm font-medium text-gray-700">Type</th>
                    <th className="px-3 py-2 text-right text-sm font-medium text-gray-700 w-20">Acties</th>
                  </tr>
                </thead>
                <tbody>
                  {testStallings.map((s) => (
                    <tr key={s.id} className="border-b hover:bg-gray-50">
                      <td className="px-3 py-2">{s.title}</td>
                      <td className="px-3 py-2">{s.type ?? "—"}</td>
                      <td className="px-3 py-2 text-right">
                        <button
                          type="button"
                          onClick={() => void handleDeleteStalling(s.id)}
                          disabled={deleteLoading === s.id}
                          title="Verwijderen"
                          className="p-1 rounded text-gray-500 hover:text-red-600 hover:bg-red-50 disabled:opacity-50"
                        >
                          <FiTrash2 className="w-4 h-4 inline" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
                <Dialog open={addDialogOpen} onClose={() => setAddDialogOpen(false)} maxWidth="sm" fullWidth>
                  <DialogTitle>Stalling toevoegen (klonen)</DialogTitle>
                  <DialogContent className="space-y-4 pt-2">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                      <select
                        value={cloneType}
                        onChange={(e) => setCloneType(e.target.value)}
                        className="border rounded px-3 py-2 w-full"
                      >
                        <option value="">—</option>
                        {fietsenstallingtypen.map((t) => (
                          <option key={t.id} value={t.id}>{t.name ?? t.id}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Data-eigenaar</label>
                      <select
                        value={cloneSiteId}
                        onChange={(e) => setCloneSiteId(e.target.value)}
                        className="border rounded px-3 py-2 w-full"
                      >
                        <option value="">—</option>
                        {cloneDataOwners.map((c) => (
                          <option key={c.id} value={c.id}>{c.companyName ?? c.id}</option>
                        ))}
                      </select>
                    </div>
                    {cloneType && cloneSiteId && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Bronstalling</label>
                        <input
                          type="text"
                          placeholder="Zoeken..."
                          value={cloneStallingSearch}
                          onChange={(e) => setCloneStallingSearch(e.target.value)}
                          className="border rounded px-3 py-2 w-full mb-2"
                        />
                        <select
                          value={selectedSourceId}
                          onChange={(e) => setSelectedSourceId(e.target.value)}
                          className="border rounded px-3 py-2 w-full"
                          disabled={cloneStallingsLoading}
                        >
                          <option value="">{cloneStallingsLoading ? "Laden..." : "—"}</option>
                          {cloneStallings.map((s) => (
                            <option key={s.id} value={s.id}>{s.title} ({s.locationid})</option>
                          ))}
                        </select>
                      </div>
                    )}
                    {selectedSourceId && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Titel</label>
                        <input
                          type="text"
                          value={cloneTitle}
                          onChange={(e) => setCloneTitle(e.target.value)}
                          className="border rounded px-3 py-2 w-full"
                          placeholder="API bewaakt #1"
                        />
                      </div>
                    )}
                  </DialogContent>
                  <DialogActions>
                    <button type="button" onClick={() => setAddDialogOpen(false)} className="px-4 py-2 text-gray-600 hover:text-gray-800">
                      Annuleren
                    </button>
                    <Button
                      onClick={() => void handleCloneStalling()}
                      disabled={cloneLoading || !selectedSourceId || !cloneTitle.trim()}
                    >
                      Aanmaken
                    </Button>
                  </DialogActions>
                </Dialog>
          </div>
          {hasAccess && testGemeenteStatus?.exists && (
            <div>
              <h4 className="text-base font-medium text-gray-900 mb-2">Dataprovider</h4>
              {simulationDataproviderExists ? (
                <button
                  type="button"
                  onClick={deleteSimulationDataprovider}
                  disabled={simulationDataproviderLoading}
                  className="px-4 py-1 rounded-full border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 disabled:opacity-50"
                >
                  {simulationDataproviderLoading ? "Bezig…" : "Verwijderen"}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={createSimulationDataprovider}
                  disabled={simulationDataproviderLoading}
                  className="px-4 py-1 rounded-full border border-green-200 bg-green-50 text-green-700 hover:bg-green-100 disabled:opacity-50"
                >
                  {simulationDataproviderLoading ? "Bezig…" : "Toevoegen"}
                </button>
              )}
            </div>
          )}
          </>
          )}
        </div>
        {bootstrapMessage && (
          <p className={`mt-4 text-sm ${bootstrapMessage.startsWith("Fout") ? "text-red-600" : "text-green-600"}`}>
            {bootstrapMessage}
          </p>
        )}

      {tablesExist === true && (
      <div className="border-t pt-6 mt-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">FMS API instellingen</h3>
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            UrlName en Wachtwoord voor FMS API (check-in/check-out). Opgeslagen in browser.
          </p>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">UrlName</label>
            <input
              type="text"
              value={apiUsername}
              onChange={(e) => setApiUsername(e.target.value)}
              className="border rounded px-3 py-2 w-full"
              placeholder="simulatie"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Wachtwoord</label>
            <input
              type="password"
              value={apiPassword}
              onChange={(e) => setApiPassword(e.target.value)}
              className="border rounded px-3 py-2 w-full"
              placeholder="••••••••"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">API Base URL (optioneel)</label>
            <input
              type="text"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              className="border rounded px-3 py-2 w-full"
              placeholder="Leeg = huidige origin"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Process queue URL (motorblok)</label>
            <input
              type="text"
              value={processQueueBaseUrl}
              onChange={(e) => setProcessQueueBaseUrl(e.target.value)}
              className="border rounded px-3 py-2 w-full"
              placeholder="https://remote.veiligstallenontwikkel.nl"
            />
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            <Button onClick={saveToStorage}>
              Opslaan
            </Button>
          </div>
        </div>
      </div>
      )}
    </div>
  );
};

export default SettingsTab;
