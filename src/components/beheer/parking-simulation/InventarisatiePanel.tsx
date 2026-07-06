import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "~/components/Button";
import { syncSector } from "~/lib/parking-simulation/fms-api-write-client";
import { formatSimulationPass, syncIdcodeForBike } from "~/lib/parking-simulation/types";
import { useParkingSimCredentials } from "~/hooks/useParkingSimCredentials";

type OccupationEntry = {
  bicycleId: string;
  locationid: string;
  sectionid: string;
  passID?: string | null;
  checkedIn?: boolean;
  bicycle?: { id: string; barcode: string };
};

type InventoryBike = {
  bicycleId: string;
  barcode: string;
  passID: string | null;
  sectionid: string;
  checkedIn?: boolean;
};

type Props = {
  locationid: string;
  sectionIds: string[];
  /** Bump to reload occupation from API (e.g. after Acties). */
  refreshKey?: number;
  onSuccess?: () => void;
  onMessage?: (message: string | null) => void;
};

function scanLookupKey(bike: InventoryBike): string {
  return syncIdcodeForBike(bike.passID, bike.barcode).toLowerCase();
}

function toInventoryBike(o: OccupationEntry): InventoryBike {
  return {
    bicycleId: o.bicycleId,
    barcode: o.bicycle?.barcode ?? o.bicycleId,
    passID: o.passID ?? null,
    sectionid: o.sectionid,
    checkedIn: o.checkedIn,
  };
}

export const InventarisatiePanel: React.FC<Props> = ({
  locationid,
  sectionIds,
  refreshKey = 0,
  onSuccess,
  onMessage,
}) => {
  const { credentials } = useParkingSimCredentials();
  const [phase, setPhase] = useState<"idle" | "active">("idle");
  const [liveOccupation, setLiveOccupation] = useState<InventoryBike[]>([]);
  const [pending, setPending] = useState<InventoryBike[]>([]);
  const [scanned, setScanned] = useState<InventoryBike[]>([]);
  const [activeSections, setActiveSections] = useState<string[]>([]);
  const [scanInput, setScanInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [log, setLog] = useState<string[]>([]);

  const setMessage = (msg: string | null) => onMessage?.(msg);

  const loadOccupation = useCallback(async () => {
    try {
      const res = await fetch("/api/protected/parking-simulation/state");
      const data = await res.json();
      const occupation = (data.occupation ?? []) as OccupationEntry[];
      const here = occupation
        .filter((o) => o.locationid === locationid)
        .map(toInventoryBike);
      setLiveOccupation(here);
      return here;
    } catch {
      setLiveOccupation([]);
      return [];
    }
  }, [locationid]);

  const resetInventory = useCallback(() => {
    setPhase("idle");
    setPending([]);
    setScanned([]);
    setActiveSections([]);
    setScanInput("");
    setLog([]);
  }, []);

  useEffect(() => {
    resetInventory();
    void loadOccupation();
  }, [locationid, resetInventory, loadOccupation]);

  useEffect(() => {
    if (phase === "idle") {
      void loadOccupation();
    }
  }, [refreshKey, phase, loadOccupation]);

  const startInventory = async () => {
    setMessage(null);
    setLog([]);
    const bikes = await loadOccupation();
    setPending(bikes);
    setScanned([]);
    setActiveSections(
      bikes.length > 0 ? [...new Set(bikes.map((b) => b.sectionid))] : sectionIds
    );
    setPhase("active");
    setMessage(
      bikes.length === 0
        ? "Inventarisatie gestart — geen fietsen in bezetting. Rond af met lege scanlijst om sync-checkout te testen."
        : `Inventarisatie gestart — ${bikes.length} fiets(en) te scannen (momentopname).`
    );
  };

  const markScanned = (bike: InventoryBike) => {
    if (phase !== "active") return;
    setPending((prev) => prev.filter((b) => b.bicycleId !== bike.bicycleId));
    setScanned((prev) => (prev.some((b) => b.bicycleId === bike.bicycleId) ? prev : [...prev, bike]));
    setScanInput("");
  };

  const handleScanInput = () => {
    if (phase !== "active") {
      setMessage("Start eerst de inventarisatie.");
      return;
    }
    const q = scanInput.trim().toLowerCase();
    if (!q) return;
    const match = pending.find((b) => scanLookupKey(b) === q || b.barcode.toLowerCase() === q);
    if (!match) {
      setMessage(`Geen openstaande fiets met pas/barcode "${scanInput.trim()}".`);
      return;
    }
    markScanned(match);
    setMessage(`Gescand: ${match.barcode}`);
  };

  const finishInventory = async () => {
    if (!credentials) {
      setMessage("Geen FMS API-credentials — configureer in Instellingen of via FMS_TEST_*.");
      return;
    }
    setLoading(true);
    setMessage(null);
    const lines: string[] = [];
    const notScanned = [...pending];

    try {
      const timeRes = await fetch("/api/protected/parking-simulation/time");
      const timeData = await timeRes.json();
      const transactionDate = timeData.simulationTime ?? new Date().toISOString();

      const sections =
        activeSections.length > 0
          ? activeSections
          : sectionIds.length > 0
            ? sectionIds
            : [...new Set([...scanned, ...notScanned].map((b) => b.sectionid))];

      for (const sectionid of sections) {
        const sectionScanned = scanned.filter((b) => b.sectionid === sectionid);
        const bikes = sectionScanned.map((b) => ({
          idcode: syncIdcodeForBike(b.passID, b.barcode),
          bikeid: b.barcode,
          idtype: 0,
          transactiondate: transactionDate,
        }));
        lines.push(
          `syncSector ${locationid}/${sectionid}: ${bikes.length} gescande fiets(en) → wachtrij_sync`
        );
        const res = await syncSector(credentials, locationid, sectionid, {
          bikes,
          transactionDate,
        });
        if (res.status === 1) {
          lines.push(`  OK (wachtrij_sync id: ${res.id})`);
        } else {
          lines.push(`  Fout: ${res.message ?? "onbekend"}`);
          setLog(lines);
          setMessage("Sync mislukt — zie log.");
          return;
        }
      }

      lines.push("Process queue...");
      const pqRes = await fetch("/api/protected/parking-simulation/process-queue", { method: "POST" });
      const pqData = await pqRes.json();
      if (pqData.ok && pqData.result) {
        const r = pqData.result;
        lines.push(`  sync: ${r.sync?.processed ?? 0} verwerkt, ${r.sync?.errors ?? 0} fout(en)`);
        lines.push(`  transacties: ${r.transacties?.processed ?? 0} verwerkt`);
      } else {
        lines.push(`  Fout: ${pqData.message ?? "onbekend"}`);
      }

      for (const bike of notScanned) {
        await fetch("/api/protected/parking-simulation/state", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "remove", bicycleId: bike.bicycleId }),
        });
        lines.push(`Simulatie: ${bike.barcode} uit stalling (sync-checkout verwacht)`);
      }

      setLog(lines);
      resetInventory();
      await loadOccupation();
      setMessage(
        notScanned.length > 0
          ? `Inventarisatie afgerond — ${notScanned.length} niet-gescande fiets(en) sync-checkout, ${scanned.length} bevestigd.`
          : `Inventarisatie afgerond — alle ${scanned.length} fiets(en) bevestigd.`
      );
      onSuccess?.();
      window.dispatchEvent(new CustomEvent("parking-slot-updated"));
    } catch (e) {
      lines.push("Fout: " + (e instanceof Error ? e.message : String(e)));
      setLog(lines);
      setMessage("Fout bij afronden inventarisatie.");
    } finally {
      setLoading(false);
    }
  };

  const scannedIds = useMemo(() => new Set(scanned.map((b) => b.bicycleId)), [scanned]);

  const displayBikes = phase === "active" ? [...pending, ...scanned] : liveOccupation;

  const bikesBySection = useMemo(() => {
    const map = new Map<string, InventoryBike[]>();
    for (const b of displayBikes) {
      const list = map.get(b.sectionid) ?? [];
      list.push(b);
      map.set(b.sectionid, list);
    }
    return map;
  }, [displayBikes]);

  return (
    <div className="space-y-4">
      <div className="border rounded-lg p-4 bg-white">
        <h4 className="font-medium mb-2">Inventariseren</h4>
        <div className="text-sm text-gray-700 space-y-2 mb-4">
          <p>
            Pas eerst de bezetting aan via <strong>Acties</strong> hierboven. Start daarna de inventarisatie:
            een momentopname van alle fietsen in deze stalling. Scan fietsen; bij afronden volgt{" "}
            <strong>syncSector</strong> → <code className="text-xs bg-gray-100 px-1">wachtrij_sync</code>.
          </p>
        </div>

        <div className="mb-4">
          <h5 className="font-medium text-sm mb-2">
            {phase === "active" ? "Inventarisatie (momentopname)" : "Huidige bezetting"}
            {" "}({displayBikes.length})
          </h5>
          {displayBikes.length === 0 ? (
            <p className="text-sm text-gray-500">Geen fietsen in deze stalling.</p>
          ) : (
            <div className="border rounded overflow-hidden">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="text-left p-2">Sectie</th>
                    <th className="text-left p-2">Fiets</th>
                    <th className="text-left p-2">Pass</th>
                    <th className="text-left p-2">Check-in</th>
                    <th className="text-left p-2">Status</th>
                    <th className="text-left p-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {[...bikesBySection.entries()].flatMap(([sectionid, bikes]) =>
                    bikes.map((b) => {
                      const isScanned = scannedIds.has(b.bicycleId);
                      const canScan = phase === "active" && !isScanned;
                      return (
                        <tr key={b.bicycleId} className="border-t">
                          <td className="p-2 text-gray-600">{sectionid}</td>
                          <td className="p-2 font-medium">{b.barcode}</td>
                          <td className="p-2">{formatSimulationPass(b.passID)}</td>
                          <td className="p-2">{b.checkedIn ? "ja" : "nee"}</td>
                          <td className="p-2">
                            {phase !== "active" ? (
                              <span className="text-gray-500">—</span>
                            ) : isScanned ? (
                              <span className="text-green-700">Gescand</span>
                            ) : (
                              <span className="text-amber-700">Te scannen</span>
                            )}
                          </td>
                          <td className="p-2">
                            {canScan ? (
                              <Button
                                onClick={() => {
                                  markScanned(b);
                                  setMessage(`Gescand: ${b.barcode}`);
                                }}
                                className="mb-0 py-1 px-2 text-xs"
                                style={{ backgroundColor: "#16a34a" }}
                              >
                                Scan
                              </Button>
                            ) : null}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {phase === "idle" && (
          <Button onClick={() => void startInventory()} disabled={sectionIds.length === 0}>
            Start inventarisatie
          </Button>
        )}

        {phase === "active" && (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2 items-end">
              <div>
                <label className="block text-sm text-gray-600 mb-1">Scan pas / barcode</label>
                <input
                  type="text"
                  value={scanInput}
                  onChange={(e) => setScanInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleScanInput()}
                  placeholder="PasID of barcode"
                  className="border rounded px-3 py-2 min-w-[200px]"
                />
              </div>
              <Button onClick={handleScanInput} disabled={!scanInput.trim()}>
                Scan invoer
              </Button>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() => void finishInventory()}
                disabled={loading || !credentials}
                style={{ backgroundColor: "#16a34a" }}
              >
                {loading ? "Bezig…" : "Inventariseren klaar — alle fietsen gescand"}
              </Button>
              <Button onClick={resetInventory} disabled={loading}>
                Inventariseren annuleren
              </Button>
            </div>
            <p className="text-xs text-gray-500">
              Nog te scannen: {pending.length} · Gescand: {scanned.length}
            </p>
          </div>
        )}

        {log.length > 0 && (
          <pre className="mt-3 text-xs p-3 bg-gray-50 border rounded whitespace-pre-wrap">{log.join("\n")}</pre>
        )}
      </div>
    </div>
  );
};
