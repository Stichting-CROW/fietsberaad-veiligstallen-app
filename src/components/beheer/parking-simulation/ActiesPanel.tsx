import React, { useState, useEffect } from "react";
import { Button } from "~/components/Button";
import { useBikeTypes } from "~/hooks/useBikeTypes";
import { uploadTransaction } from "~/lib/parking-simulation/fms-api-client";

type Bicycle = { id: string; barcode: string; biketypeID?: number };
type OccupationEntry = {
  id: string;
  bicycleId: string;
  locationid: string;
  sectionid: string;
  placeId?: number | null;
  bicycle?: Bicycle;
};
type LayoutSection = {
  sectionid: string | null;
  name?: string;
  biketypes?: Array<{ allowed: boolean; biketypeid: number; capacity?: number }>;
  places?: Array<{ id: number; name?: string }>;
};
type Layout = {
  sections?: LayoutSection[];
  sectionid?: string | null;
  biketypes?: LayoutSection["biketypes"];
  places?: LayoutSection["places"];
  locationid?: string;
};

export type Stalling = { id: string; locationid: string; title: string };

function getStoredCredentials(): { username: string; password: string; baseUrl?: string } | null {
  if (typeof window === "undefined") return null;
  const u = localStorage.getItem("parking-sim-apiUsername");
  const p = localStorage.getItem("parking-sim-apiPassword");
  const b = localStorage.getItem("parking-sim-baseUrl");
  if (!u || !p) return null;
  return { username: u, password: p, baseUrl: b || undefined };
}

type Props = {
  /** When set, single-stalling mode: fixed location, no stalling dropdown */
  locationid?: string;
  /** Stallings for dropdown. When locationid is set, can be empty or single item. */
  stallings: Stalling[];
  /** Storage key for persisting selections (omit to disable persistence) */
  storageKey?: string;
  /** Callback for status messages */
  onMessage?: (message: string | null) => void;
  /** Callback when an action succeeds (e.g. for parent to refresh layout) */
  onSuccess?: () => void;
};

function loadStored(storageKey: string): { biketypeId: number | ""; locationId: string; actieType: "in" | "uit" } {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return { biketypeId: "", locationId: "", actieType: "in" };
    const parsed = JSON.parse(raw) as { biketypeId?: number; locationId?: string; actieType?: "in" | "uit" };
    return {
      biketypeId: typeof parsed.biketypeId === "number" ? parsed.biketypeId : "",
      locationId: typeof parsed.locationId === "string" ? parsed.locationId : "",
      actieType: parsed.actieType === "uit" ? "uit" : "in",
    };
  } catch {
    return { biketypeId: "", locationId: "", actieType: "in" };
  }
}

function saveStored(storageKey: string, biketypeId: number | "", locationId: string, actieType: "in" | "uit") {
  try {
    localStorage.setItem(storageKey, JSON.stringify({ biketypeId, locationId, actieType }));
  } catch {
    /* ignore */
  }
}

export const ActiesPanel: React.FC<Props> = ({ locationid: fixedLocationId, stallings, storageKey, onMessage, onSuccess }) => {
  const { data: bikeTypes } = useBikeTypes();
  const singleStallingMode = !!fixedLocationId;
  const effectiveLocationId = singleStallingMode ? fixedLocationId! : "";

  const [state, setState] = useState<{ bicycles: Bicycle[]; occupation: OccupationEntry[] } | null>(null);
  const [actieType, setActieType] = useState<"in" | "uit">(() =>
    storageKey ? loadStored(storageKey).actieType : "in"
  );
  const [selectedBiketypeId, setSelectedBiketypeId] = useState<number | "">(() =>
    storageKey ? loadStored(storageKey).biketypeId : ""
  );
  const [selectedBicycleId, setSelectedBicycleId] = useState<string>("");
  const [selectedLocationId, setSelectedLocationId] = useState<string>(() => {
    if (singleStallingMode) return effectiveLocationId;
    return storageKey ? loadStored(storageKey).locationId : "";
  });

  useEffect(() => {
    if (singleStallingMode) {
      setSelectedLocationId(effectiveLocationId);
    } else if (stallings.length > 0) {
      const stored = storageKey ? loadStored(storageKey).locationId : "";
      const validStored = stallings.some((s) => s.locationid === stored);
      setSelectedLocationId((prev) => {
        const prevValid = prev && stallings.some((s) => s.locationid === prev);
        if (prevValid) return prev;
        return validStored ? stored : stallings[0]?.locationid ?? "";
      });
    }
  }, [singleStallingMode, effectiveLocationId, stallings, storageKey]);

  const [layout, setLayout] = useState<Layout | null>(null);
  const [parkLoading, setParkLoading] = useState(false);
  const [removeLoading, setRemoveLoading] = useState<string | null>(null);
  const [checkInLoading, setCheckInLoading] = useState(false);
  const [checkOutLoading, setCheckOutLoading] = useState<string | null>(null);

  const setMessage = (msg: string | null) => onMessage?.(msg);

  const loadState = () => {
    fetch("/api/protected/parking-simulation/state")
      .then((r) => (r.ok ? r.json() : {}))
      .then((data: { bicycles?: Bicycle[]; occupation?: OccupationEntry[] }) => {
        setState({ bicycles: data.bicycles ?? [], occupation: data.occupation ?? [] });
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

  const currentLocationId = singleStallingMode ? effectiveLocationId : selectedLocationId;

  useEffect(() => {
    if (storageKey && !singleStallingMode) {
      saveStored(storageKey, selectedBiketypeId, selectedLocationId, actieType);
    }
  }, [storageKey, singleStallingMode, selectedBiketypeId, selectedLocationId, actieType]);

  useEffect(() => {
    if (currentLocationId) {
      fetch(`/api/protected/parking-simulation/sections-places/${currentLocationId}`)
        .then((r) => (r.ok ? r.json() : {}))
        .then((data: Layout) => setLayout(data))
        .catch(() => setLayout(null));
    } else {
      setLayout(null);
    }
  }, [currentLocationId]);

  const occupiedBicycleIds = new Set((state?.occupation ?? []).map((o) => o.bicycleId));
  const freeBicycles = (state?.bicycles ?? []).filter((b) => !occupiedBicycleIds.has(b.id));
  const biketypeIdsWithBikes = [...new Set((state?.bicycles ?? []).map((b) => b.biketypeID ?? 1))];
  const allBicyclesOfType = (state?.bicycles ?? []).filter((b) => (b.biketypeID ?? 1) === selectedBiketypeId);
  const freeBicyclesOfType = freeBicycles.filter((b) => (b.biketypeID ?? 1) === selectedBiketypeId);
  const occupiedAtSelectedLocation = (state?.occupation ?? []).filter((o) => o.locationid === currentLocationId);
  const occupiedBicyclesHere = occupiedAtSelectedLocation
    .map((o) => state?.bicycles?.find((b) => b.id === o.bicycleId))
    .filter((b): b is Bicycle => !!b);

  const getBikeStatusSuffix = (bike: Bicycle): string => {
    const occ = (state?.occupation ?? []).find((o) => o.bicycleId === bike.id);
    if (!occ) return "";
    return occ.locationid === currentLocationId ? " (parked here)" : " (parked elsewhere)";
  };

  const isSelectedBikeParkedHere = selectedBicycleId && occupiedBicyclesHere.some((b) => b.id === selectedBicycleId);
  const isSelectedBikeFree = selectedBicycleId && freeBicyclesOfType.some((b) => b.id === selectedBicycleId);

  useEffect(() => {
    if (!state) return;
    const occIds = new Set((state.occupation ?? []).map((o) => o.bicycleId));
    const free = (state.bicycles ?? []).filter((b) => !occIds.has(b.id));
    const btIds = [...new Set((state.bicycles ?? []).map((b) => b.biketypeID ?? 1))];
    if (btIds.length === 0) return;
    const firstBiketypeId = btIds[0];
    setSelectedBiketypeId((prev) => (btIds.includes(prev) ? prev : (firstBiketypeId ?? "")));
    if (actieType === "in") {
      const freeOfType = free.filter(
        (b) => (b.biketypeID ?? 1) === (btIds.includes(selectedBiketypeId) ? selectedBiketypeId : firstBiketypeId)
      );
      const firstFree = freeOfType[0];
      setSelectedBicycleId((prev) => (free.some((b) => b.id === prev) ? prev : (firstFree?.id ?? "")));
    } else {
      const occAtLoc = (state.occupation ?? []).filter((o) => o.locationid === currentLocationId);
      const occBikes = occAtLoc.map((o) => o.bicycleId);
      const firstOcc = occBikes[0];
      setSelectedBicycleId((prev) => (occBikes.includes(prev) ? prev : (firstOcc ?? "")));
    }
  }, [state?.bicycles, state?.occupation, actieType, currentLocationId, selectedBiketypeId]);

  const normalizedSections = ((): LayoutSection[] => {
    if (!layout) return [];
    if (layout.sections && layout.sections.length > 0) return layout.sections;
    if (layout.sectionid != null || layout.biketypes) {
      return [{
        sectionid: layout.sectionid ?? layout.locationid ?? null,
        biketypes: layout.biketypes,
        places: layout.places,
      }];
    }
    return [];
  })();

  const firstSectionId = normalizedSections[0]?.sectionid ?? null;

  const findFirstSuitableSpot = (
    locationid: string,
    biketypeId: number,
    sections: LayoutSection[],
    occupation: OccupationEntry[]
  ): { sectionid: string; placeId?: number } | null => {
    const occupiedInLocation = occupation.filter((o) => o.locationid === locationid);
    const occupiedSet = new Set(occupiedInLocation.map((o) => `${o.sectionid}:${o.placeId ?? "n"}`));

    for (const sec of sections) {
      const sectionid = sec.sectionid;
      if (!sectionid) continue;
      const bt = sec.biketypes?.find((b) => b.biketypeid === biketypeId);
      if (!bt?.allowed) continue;

      if (sec.places && sec.places.length > 0) {
        for (const place of sec.places) {
          const key = `${sectionid}:${place.id}`;
          if (!occupiedSet.has(key)) return { sectionid, placeId: place.id };
        }
      } else {
        const capacity = bt.capacity ?? 999;
        const count = occupiedInLocation.filter((o) => o.sectionid === sectionid && o.placeId == null).length;
        if (count < capacity) return { sectionid };
      }
    }
    return null;
  };

  const fetchSimulationTime = async (): Promise<string> => {
    const res = await fetch("/api/protected/parking-simulation/time");
    const data = await res.json();
    return data.simulationTime ?? new Date().toISOString();
  };

  const handlePark = async () => {
    if (!selectedBicycleId || !currentLocationId) {
      setMessage("Selecteer fiets en stalling.");
      return;
    }
    if (normalizedSections.length === 0) {
      setMessage("Geen secties gevonden voor deze stalling.");
      return;
    }
    const bike = state?.bicycles?.find((b) => b.id === selectedBicycleId);
    if (!bike) return;
    const spot = findFirstSuitableSpot(
      currentLocationId,
      bike.biketypeID ?? 1,
      normalizedSections,
      state?.occupation ?? []
    );
    if (!spot) {
      setMessage("Geen geschikte vrije plek gevonden. Controleer of het fiets type toegestaan is.");
      return;
    }
    setParkLoading(true);
    setMessage(null);
    try {
      const res = await fetch("/api/protected/parking-simulation/state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "park",
          bicycleId: selectedBicycleId,
          locationid: currentLocationId,
          sectionid: spot.sectionid,
          placeId: spot.placeId ?? undefined,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setMessage("Fiets gestald.");
        loadState();
        onSuccess?.();
      } else {
        setMessage(data.message ?? "Fout");
      }
    } catch (e) {
      setMessage("Fout: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setParkLoading(false);
    }
  };

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
        onSuccess?.();
      } else {
        setMessage(data.message ?? "Fout");
      }
    } catch (e) {
      setMessage("Fout: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setRemoveLoading(null);
    }
  };

  const handleCheckIn = async () => {
    const creds = getStoredCredentials();
    if (!creds) {
      setMessage("Geen credentials. Configureer in Instellingen of voeg Simulatie Dataprovider toe.");
      return;
    }
    if (!firstSectionId || !selectedBicycleId || !currentLocationId) {
      setMessage("Selecteer fiets en stalling. Geen secties beschikbaar.");
      return;
    }
    const bike = state?.bicycles?.find((b) => b.id === selectedBicycleId);
    if (!bike || occupiedBicycleIds.has(bike.id)) {
      setMessage("Selecteer een vrije fiets.");
      return;
    }
    const spot = findFirstSuitableSpot(
      currentLocationId,
      bike.biketypeID ?? 1,
      normalizedSections,
      state?.occupation ?? []
    );
    if (!spot) {
      setMessage("Geen geschikte vrije plek gevonden.");
      return;
    }
    setCheckInLoading(true);
    setMessage(null);
    try {
      const simulationTime = await fetchSimulationTime();
      const tx = {
        type: "in" as const,
        transactionDate: simulationTime,
        passID: "SIM-PASS-001",
        idtype: 0,
        barcodeBike: bike.barcode,
        bikeid: bike.barcode,
      };
      const res = await uploadTransaction(creds, currentLocationId, spot.sectionid, tx);
      if (res.status === 1) {
        const parkRes = await fetch("/api/protected/parking-simulation/state", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "park",
            bicycleId: selectedBicycleId,
            locationid: currentLocationId,
            sectionid: spot.sectionid,
            placeId: spot.placeId ?? undefined,
            checkedIn: true,
          }),
        });
        const parkData = await parkRes.json();
        if (parkData.ok) {
          setMessage("Check-in succesvol.");
          loadState();
          onSuccess?.();
        } else {
          setMessage(parkData.message ?? "Park mislukt");
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
      setCheckInLoading(false);
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
          onSuccess?.();
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

  return (
    <div>
      <h4 className="font-medium mb-2">Acties</h4>
      <div className="flex flex-wrap gap-4 items-end">
        <div>
          <label className="block text-sm text-gray-600 mb-1">Type</label>
          <select
            value={actieType}
            onChange={(e) => setActieType(e.target.value as "in" | "uit")}
            className="border rounded px-3 py-2"
          >
            <option value="in">In</option>
            <option value="uit">Uit</option>
          </select>
        </div>
        <div>
          <label className="block text-sm text-gray-600 mb-1">Fiets type</label>
          <select
            value={biketypeIdsWithBikes.includes(selectedBiketypeId) ? selectedBiketypeId : ""}
            onChange={(e) => {
              setSelectedBiketypeId(e.target.value === "" ? "" : Number(e.target.value));
              setSelectedBicycleId("");
            }}
            disabled={biketypeIdsWithBikes.length === 0}
            className="border rounded px-3 py-2 disabled:opacity-60 disabled:bg-gray-100"
          >
            <option value="">—</option>
            {bikeTypes
              ?.filter((t) => biketypeIdsWithBikes.includes(t.ID))
              .map((t) => (
                <option key={t.ID} value={t.ID}>
                  {t.Name ?? t.naamenkelvoud}
                </option>
              ))}
          </select>
        </div>
        <div>
          <label className="block text-sm text-gray-600 mb-1">Fiets</label>
          <select
            value={allBicyclesOfType.some((b) => b.id === selectedBicycleId) ? selectedBicycleId : ""}
            onChange={(e) => setSelectedBicycleId(e.target.value)}
            disabled={allBicyclesOfType.length === 0}
            className="border rounded px-3 py-2 disabled:opacity-60 disabled:bg-gray-100"
          >
            <option value="">—</option>
            {allBicyclesOfType.map((b) => (
              <option key={b.id} value={b.id}>
                {b.barcode}{getBikeStatusSuffix(b)}
              </option>
            ))}
          </select>
        </div>
        {!singleStallingMode && (
          <div>
            <label className="block text-sm text-gray-600 mb-1">Stalling</label>
            <select
              value={selectedLocationId}
              onChange={(e) => setSelectedLocationId(e.target.value)}
              className="border rounded px-3 py-2"
            >
              <option value="">—</option>
              {stallings.map((s) => (
                <option key={s.id} value={s.locationid}>
                  {s.title}
                </option>
              ))}
            </select>
          </div>
        )}
        {actieType === "in" && (
          <>
            <Button
              onClick={() => void handleCheckIn()}
              disabled={
                checkInLoading ||
                !selectedBicycleId ||
                !currentLocationId ||
                !firstSectionId ||
                !isSelectedBikeFree ||
                !getStoredCredentials()
              }
              style={{ backgroundColor: "#16a34a" }}
            >
              Check-in
            </Button>
            <Button
              onClick={() => void handlePark()}
              disabled={parkLoading || !selectedBicycleId || !currentLocationId || !isSelectedBikeFree}
            >
              Stallen (zonder check-in)
            </Button>
          </>
        )}
        {actieType === "uit" && (
          <>
            <Button
              onClick={() => selectedBicycleId && void handleCheckOut(selectedBicycleId)}
              disabled={
                checkOutLoading !== null ||
                !selectedBicycleId ||
                !isSelectedBikeParkedHere ||
                !getStoredCredentials()
              }
              className="mb-0 whitespace-nowrap"
              style={{ backgroundColor: "#16a34a" }}
            >
              Check-out
            </Button>
            <Button
              onClick={() => selectedBicycleId && void handleRemove(selectedBicycleId)}
              disabled={removeLoading !== null || !selectedBicycleId || !isSelectedBikeParkedHere}
              className="mb-0 whitespace-nowrap"
            >
              Uit stalling (zonder check-uit)
            </Button>
          </>
        )}
      </div>
    </div>
  );
};
