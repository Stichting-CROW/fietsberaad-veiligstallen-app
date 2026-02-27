import React, { useState, useEffect } from "react";
import { Button } from "~/components/Button";
import { useBikeTypes } from "~/hooks/useBikeTypes";

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

type Stalling = { id: string; locationid: string; title: string };

function loadStoredSelections(): { biketypeId: number | ""; locationId: string } {
  try {
    const raw = localStorage.getItem(FIETSEN_TAB_STORAGE_KEY);
    if (!raw) return { biketypeId: "", locationId: "" };
    const parsed = JSON.parse(raw) as { biketypeId?: number; locationId?: string };
    return {
      biketypeId: typeof parsed.biketypeId === "number" ? parsed.biketypeId : "",
      locationId: typeof parsed.locationId === "string" ? parsed.locationId : "",
    };
  } catch {
    return { biketypeId: "", locationId: "" };
  }
}

function saveStoredSelections(biketypeId: number | "", locationId: string) {
  try {
    localStorage.setItem(FIETSEN_TAB_STORAGE_KEY, JSON.stringify({ biketypeId, locationId }));
  } catch {
    /* ignore */
  }
}

const FietsenTab: React.FC<{ stallings: Stalling[] }> = ({ stallings }) => {
  const { data: bikeTypes } = useBikeTypes();
  const [state, setState] = useState<{ bicycles: Bicycle[]; occupation: OccupationEntry[] } | null>(null);
  const [selectedBiketypeId, setSelectedBiketypeId] = useState<number | "">(() => loadStoredSelections().biketypeId);
  const [selectedBicycleId, setSelectedBicycleId] = useState<string>("");
  const [selectedLocationId, setSelectedLocationId] = useState<string>(() => {
    const stored = loadStoredSelections().locationId;
    return stored || "";
  });

  useEffect(() => {
    if (stallings.length === 0) return;
    const stored = loadStoredSelections().locationId;
    const validStored = stallings.some((s) => s.locationid === stored);
    setSelectedLocationId((prev) => {
      const prevValid = prev && stallings.some((s) => s.locationid === prev);
      if (prevValid) return prev;
      return validStored ? stored : stallings[0]?.locationid ?? "";
    });
  }, [stallings]);
  const [layout, setLayout] = useState<Layout | null>(null);
  const [statusFilter, setStatusFilter] = useState<"occupied" | "free" | "all">("occupied");
  const [parkingFilter, setParkingFilter] = useState<string>("all");
  const [fietstypeFilter, setFietstypeFilter] = useState<number | "all">("all");
  const [parkLoading, setParkLoading] = useState(false);
  const [removeLoading, setRemoveLoading] = useState<string | null>(null);
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

  useEffect(() => {
    saveStoredSelections(selectedBiketypeId, selectedLocationId);
  }, [selectedBiketypeId, selectedLocationId]);

  useEffect(() => {
    if (selectedLocationId) {
      fetch(`/api/protected/parking-simulation/sections-places/${selectedLocationId}`)
        .then((r) => (r.ok ? r.json() : {}))
        .then((data: Layout) => setLayout(data))
        .catch(() => setLayout(null));
    } else {
      setLayout(null);
    }
  }, [selectedLocationId]);

  const occupiedBicycleIds = new Set((state?.occupation ?? []).map((o) => o.bicycleId));
  const freeBicycles = (state?.bicycles ?? []).filter((b) => !occupiedBicycleIds.has(b.id));
  const biketypeIdsWithFree = [...new Set(freeBicycles.map((b) => b.biketypeID ?? 1))];
  const freeBicyclesOfType = freeBicycles.filter((b) => (b.biketypeID ?? 1) === selectedBiketypeId);

  useEffect(() => {
    if (!state) return;
    const occIds = new Set((state.occupation ?? []).map((o) => o.bicycleId));
    const free = (state.bicycles ?? []).filter((b) => !occIds.has(b.id));
    if (free.length === 0) return;
    const btIds = [...new Set(free.map((b) => b.biketypeID ?? 1))];
    const firstBiketypeId = btIds[0];
    const firstBikeOfType = free.filter((b) => (b.biketypeID ?? 1) === firstBiketypeId)[0];
    setSelectedBiketypeId((prev) => (btIds.includes(prev) ? prev : (firstBiketypeId ?? "")));
    setSelectedBicycleId((prev) => (free.some((b) => b.id === prev) ? prev : (firstBikeOfType?.id ?? "")));
  }, [state?.bicycles, state?.occupation]);

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

  const findFirstSuitableSpot = (
    locationid: string,
    biketypeId: number,
    sections: LayoutSection[],
    occupation: OccupationEntry[]
  ): { sectionid: string; placeId?: number } | null => {
    const occupiedInLocation = occupation.filter((o) => o.locationid === locationid);
    const occupiedSet = new Set(
      occupiedInLocation.map((o) => `${o.sectionid}:${o.placeId ?? "n"}`)
    );

    for (const sec of sections) {
      const sectionid = sec.sectionid;
      if (!sectionid) continue;
      const bt = sec.biketypes?.find((b) => b.biketypeid === biketypeId);
      if (!bt?.allowed) continue;

      if (sec.places && sec.places.length > 0) {
        for (const place of sec.places) {
          const key = `${sectionid}:${place.id}`;
          if (!occupiedSet.has(key)) {
            return { sectionid, placeId: place.id };
          }
        }
      } else {
        const capacity = bt.capacity ?? 999;
        const count = occupiedInLocation.filter(
          (o) => o.sectionid === sectionid && o.placeId == null
        ).length;
        if (count < capacity) {
          return { sectionid };
        }
      }
    }
    return null;
  };

  const handlePark = async () => {
    if (!selectedBicycleId || !selectedLocationId) {
      setMessage("Selecteer fiets en stalling.");
      return;
    }
    if (normalizedSections.length === 0) {
      setMessage("Geen secties gevonden voor deze stalling.");
      return;
    }
    const bike = state?.bicycles?.find((b) => b.id === selectedBicycleId);
    if (!bike) return;
    const biketypeId = bike.biketypeID ?? 1;

    const spot = findFirstSuitableSpot(
      selectedLocationId,
      biketypeId,
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
          locationid: selectedLocationId,
          sectionid: spot.sectionid,
          placeId: spot.placeId ?? undefined,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setMessage("Fiets gestald.");
        loadState();
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
      } else {
        setMessage(data.message ?? "Fout");
      }
    } catch (e) {
      setMessage("Fout: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setRemoveLoading(null);
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
      <div>
        <h3 className="text-lg font-bold mb-3">Stallen (zonder check-in)</h3>
        <div className="flex flex-wrap gap-4 items-end">
          <div>
            <label className="block text-sm text-gray-600 mb-1">Fiets type</label>
            <select
              value={biketypeIdsWithFree.includes(selectedBiketypeId) ? selectedBiketypeId : ""}
              onChange={(e) => {
                setSelectedBiketypeId(e.target.value === "" ? "" : Number(e.target.value));
                setSelectedBicycleId("");
              }}
              disabled={biketypeIdsWithFree.length === 0}
              className="border rounded px-3 py-2 disabled:opacity-60 disabled:bg-gray-100"
            >
              <option value="">—</option>
              {bikeTypes
                .filter((t) => biketypeIdsWithFree.includes(t.ID))
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
              value={freeBicyclesOfType.some((b) => b.id === selectedBicycleId) ? selectedBicycleId : ""}
              onChange={(e) => setSelectedBicycleId(e.target.value)}
              disabled={freeBicyclesOfType.length === 0}
              className="border rounded px-3 py-2 disabled:opacity-60 disabled:bg-gray-100"
            >
              <option value="">—</option>
              {freeBicyclesOfType.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.barcode}
                </option>
              ))}
            </select>
          </div>
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
          <Button
            onClick={() => void handlePark()}
            disabled={parkLoading || !selectedBicycleId || !selectedLocationId}
          >
            Stallen (zonder check-in)
          </Button>
        </div>
      </div>

      <div>
        <h3 className="text-lg font-bold mb-3">Pool state</h3>
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
                      <Button
                        onClick={() => void handleRemove(bike.id)}
                        disabled={removeLoading === bike.id}
                        className="mb-0 whitespace-nowrap"
                      >
                        Uit stalling (zonder check-uit)
                      </Button>
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
