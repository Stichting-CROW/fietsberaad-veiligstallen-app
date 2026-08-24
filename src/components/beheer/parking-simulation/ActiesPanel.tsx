import React, { useState, useEffect } from "react";
import { Button } from "~/components/Button";
import { useBikeTypes } from "~/hooks/useBikeTypes";
import { addSaldo, postManagedTransaction, postManagedTransactions, saveBike } from "~/lib/parking-simulation/fms-api-write-client";
import {
  buildManagedCheckIn,
  buildManagedCheckOut,
  citycodeFromLocationId,
  generateExternalTransactionId,
} from "~/lib/parking-simulation/managed-transaction";
import { formatStallingLabel } from "~/lib/parking-simulation/types";
import { useParkingSimCredentials } from "~/hooks/useParkingSimCredentials";
import {
  readManagedWriteScope,
  readSimCheckType,
  writeManagedWriteScope,
  writeSimCheckType,
  type ManagedWriteScope,
  type SimCheckType,
} from "~/lib/parking-simulation/credentials";
import {
  reportBezettingSnapshots,
  type BezettingSnapshot,
} from "~/lib/parking-simulation/report-bezetting";

type Bicycle = { id: string; barcode: string; biketypeID?: number };
type OccupationEntry = {
  id: string;
  bicycleId: string;
  locationid: string;
  sectionid: string;
  passID?: string | null;
  externalTransactionID?: string | null;
  checkInDate?: string | null;
  createdAt?: string | null;
  bicycle?: Bicycle;
};

function fmsWriteErrorHint(message: string): string {
  return /rechten|unauthorized|401/i.test(message)
    ? " Controleer Instellingen: dataprovider heeft type2 nodig voor managed transactions."
    : "";
}
type PasidEntry = {
  id: string;
  pasID: string;
  pastype: string;
  bikeTypeID: number;
  barcodeFiets: string | null;
  hasParkedBike: boolean;
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

const PASSID_AUTO = "__auto__";

function loadStored(storageKey: string): { biketypeId: number | ""; locationId: string; actieType: "in" | "uit"; passID: string } {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return { biketypeId: "", locationId: "", actieType: "in", passID: PASSID_AUTO };
    const parsed = JSON.parse(raw) as { biketypeId?: number; locationId?: string; actieType?: "in" | "uit"; passID?: string };
    return {
      biketypeId: typeof parsed.biketypeId === "number" ? parsed.biketypeId : "",
      locationId: typeof parsed.locationId === "string" ? parsed.locationId : "",
      actieType: parsed.actieType === "uit" ? "uit" : "in",
      passID: typeof parsed.passID === "string" ? parsed.passID : PASSID_AUTO,
    };
  } catch {
    return { biketypeId: "", locationId: "", actieType: "in", passID: PASSID_AUTO };
  }
}

function saveStored(storageKey: string, biketypeId: number | "", locationId: string, actieType: "in" | "uit", passID: string) {
  try {
    localStorage.setItem(storageKey, JSON.stringify({ biketypeId, locationId, actieType, passID }));
  } catch {
    /* ignore */
  }
}

function generateNewPassID(): string {
  return `SIM-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export const ActiesPanel: React.FC<Props> = ({ locationid: fixedLocationId, stallings, storageKey, onMessage, onSuccess }) => {
  const { credentials, loading: credentialsLoading } = useParkingSimCredentials();
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
  const [selectedPassID, setSelectedPassID] = useState<string>(() =>
    storageKey ? loadStored(storageKey).passID : PASSID_AUTO
  );
  const [pasids, setPasids] = useState<PasidEntry[]>([]);
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
  const [saldoPassID, setSaldoPassID] = useState("");
  const [saldoAmount, setSaldoAmount] = useState("");
  const [saldoPaymentTypeID, setSaldoPaymentTypeID] = useState(1);
  const [saldoLoading, setSaldoLoading] = useState(false);
  const [batchCount, setBatchCount] = useState(1);
  const [checkType, setCheckType] = useState<SimCheckType>(() => readSimCheckType());
  const [managedScope, setManagedScope] = useState<ManagedWriteScope>(() => readManagedWriteScope());
  const [linkBikeId, setLinkBikeId] = useState("");
  const [linkPassID, setLinkPassID] = useState("");
  const [linkLoading, setLinkLoading] = useState(false);
  const [showSaldoBlock, setShowSaldoBlock] = useState(false);
  const [showLinkBlock, setShowLinkBlock] = useState(false);

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
    fetch("/api/protected/parking-simulation/pasids")
      .then((r) => (r.ok ? r.json() : {}))
      .then((data: { data?: PasidEntry[] }) => setPasids(data.data ?? []))
      .catch(() => setPasids([]));
  }, []);

  useEffect(() => {
    const handler = () => {
      loadState();
      fetch("/api/protected/parking-simulation/pasids")
        .then((r) => (r.ok ? r.json() : {}))
        .then((data: { data?: PasidEntry[] }) => setPasids(data.data ?? []))
        .catch(() => {});
    };
    window.addEventListener("simulation-clock-updated", handler);
    return () => window.removeEventListener("simulation-clock-updated", handler);
  }, []);

  const currentLocationId = singleStallingMode ? effectiveLocationId : selectedLocationId;

  useEffect(() => {
    if (storageKey) {
      saveStored(storageKey, selectedBiketypeId, selectedLocationId, actieType, selectedPassID);
    }
  }, [storageKey, selectedBiketypeId, selectedLocationId, actieType, selectedPassID]);

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
    setSelectedBiketypeId((prev) =>
      typeof prev === "number" && btIds.includes(prev) ? prev : (firstBiketypeId ?? "")
    );
    if (actieType === "in") {
      const activeBiketypeId =
        typeof selectedBiketypeId === "number" && btIds.includes(selectedBiketypeId)
          ? selectedBiketypeId
          : firstBiketypeId;
      const freeOfType = free.filter(
        (b) => (b.biketypeID ?? 1) === activeBiketypeId
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

  useEffect(() => {
    if (!showLinkBlock || linkBikeId) return;
    if (selectedBicycleId && (state?.bicycles ?? []).some((b) => b.id === selectedBicycleId)) {
      setLinkBikeId(selectedBicycleId);
    }
  }, [showLinkBlock, linkBikeId, selectedBicycleId, state?.bicycles]);

  const normalizedSections = ((): LayoutSection[] => {
    if (!layout) return [];
    if (layout.sections && layout.sections.length > 0) {
      return layout.sections.filter((s) => s.sectionid != null && s.sectionid !== "");
    }
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
  ): { sectionid: string } | null => {
    const occupiedInLocation = occupation.filter((o) => o.locationid === locationid);

    for (const sec of sections) {
      const sectionid = sec.sectionid;
      if (!sectionid) continue;
      const bt = sec.biketypes?.find((b) => b.biketypeid === biketypeId);
      if (!bt?.allowed) continue;

      const capacity = bt.capacity ?? 999;
      const count = occupiedInLocation.filter((o) => o.sectionid === sectionid).length;
      if (count < capacity) return { sectionid };
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
        }),
      });
      const data = await res.json();
      if (data.ok) {
        await reportBezettingSnapshots(credentials, data.bezetting as BezettingSnapshot[] | undefined);
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
        await reportBezettingSnapshots(credentials, data.bezetting as BezettingSnapshot[] | undefined);
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
    if (!credentials) {
      setMessage("Geen FMS API-credentials. Vul UrlName en wachtwoord in bij Instellingen (opgeslagen in deze browser).");
      return;
    }
    if (!firstSectionId || !currentLocationId) {
      setMessage("Selecteer fiets en stalling. Geen secties beschikbaar.");
      return;
    }
    const count = Math.min(50, Math.max(1, batchCount));
    const freeBikes = (state?.bicycles ?? []).filter((b) => {
      if (occupiedBicycleIds.has(b.id)) return false;
      if (selectedBiketypeId !== "" && (b.biketypeID ?? 1) !== selectedBiketypeId) return false;
      return true;
    });
    const selectedFirst = selectedBicycleId
      ? freeBikes.filter((b) => b.id === selectedBicycleId)
      : [];
    const rest = freeBikes.filter((b) => b.id !== selectedBicycleId);
    const bikesToCheckIn = [...selectedFirst, ...rest].slice(0, count);
    if (bikesToCheckIn.length === 0) {
      setMessage("Selecteer een vrije fiets.");
      return;
    }

    let workingOcc = [...(state?.occupation ?? [])];
    const planned: Array<{
      bike: Bicycle;
      sectionid: string;
      passID: string;
      externalTransactionID: string;
    }> = [];
    for (const bike of bikesToCheckIn) {
      const spot = findFirstSuitableSpot(
        currentLocationId,
        bike.biketypeID ?? 1,
        normalizedSections,
        workingOcc
      );
      if (!spot) {
        setMessage(
          planned.length === 0
            ? "Geen geschikte vrije plek gevonden."
            : `Slechts ${planned.length} plek(ken) vrij — verlaag aantal.`
        );
        if (planned.length === 0) return;
        break;
      }
      const passID =
        planned.length === 0 && selectedPassID !== PASSID_AUTO
          ? selectedPassID
          : (freePasids[planned.length]?.pasID ?? generateNewPassID());
      const externalTransactionID = generateExternalTransactionId();
      planned.push({ bike, sectionid: spot.sectionid, passID, externalTransactionID });
      workingOcc = [
        ...workingOcc,
        {
          id: `pending-${bike.id}`,
          bicycleId: bike.id,
          locationid: currentLocationId,
          sectionid: spot.sectionid,
        },
      ];
    }
    if (planned.length === 0) return;

    setCheckInLoading(true);
    setMessage(null);
    try {
      const simulationTime = await fetchSimulationTime();
      const citycode = citycodeFromLocationId(currentLocationId);
      const items = planned.map((p) =>
        buildManagedCheckIn({
          externaltransactionid: p.externalTransactionID,
          idcode: p.passID,
          checkindate: simulationTime,
          barcode: p.bike.barcode,
          biketypeid: p.bike.biketypeID ?? 1,
          checkintype: checkType,
          sectionid: p.sectionid,
        })
      );
      const res =
        items.length === 1
          ? await postManagedTransaction(
              credentials,
              citycode,
              currentLocationId,
              planned[0]!.sectionid,
              items[0]!,
              managedScope
            )
          : await postManagedTransactions(
              credentials,
              citycode,
              currentLocationId,
              planned[0]!.sectionid,
              items,
              managedScope
            );
      if (res.status !== 1) {
        const msg = res.message ?? "onbekend";
        setMessage("Fout: " + msg + fmsWriteErrorHint(String(msg)));
        return;
      }

      const lastBezetting: BezettingSnapshot[] = [];
      for (const p of planned) {
        const parkRes = await fetch("/api/protected/parking-simulation/state", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "park",
            bicycleId: p.bike.id,
            locationid: currentLocationId,
            sectionid: p.sectionid,
            checkedIn: true,
            passID: p.passID,
            externalTransactionID: p.externalTransactionID,
            checkInDate: simulationTime,
          }),
        });
        const parkData = await parkRes.json();
        if (!parkData.ok) {
          setMessage(parkData.message ?? "Park mislukt");
          return;
        }
        for (const snap of (parkData.bezetting ?? []) as BezettingSnapshot[]) {
          const idx = lastBezetting.findIndex(
            (s) => s.locationid === snap.locationid && s.sectionid === snap.sectionid
          );
          if (idx >= 0) lastBezetting[idx] = snap;
          else lastBezetting.push(snap);
        }
      }
      await reportBezettingSnapshots(credentials, lastBezetting);
      setMessage(planned.length === 1 ? "Check-in succesvol." : `${planned.length} check-ins succesvol.`);
      loadState();
      fetch("/api/protected/parking-simulation/pasids")
        .then((r) => (r.ok ? r.json() : {}))
        .then((data: { data?: PasidEntry[] }) => {
          setPasids(data.data ?? []);
          setSelectedPassID(PASSID_AUTO);
        })
        .catch(() => setSelectedPassID(PASSID_AUTO));
      onSuccess?.();
    } catch (e) {
      setMessage("Fout: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setCheckInLoading(false);
    }
  };

  const handleCheckOut = async (bicycleId: string) => {
    if (!credentials) {
      setMessage("Geen FMS API-credentials. Vul UrlName en wachtwoord in bij Instellingen (opgeslagen in deze browser).");
      return;
    }
    const occ = (state?.occupation ?? []).find((o) => o.bicycleId === bicycleId);
    if (!occ) {
      setMessage("Fiets niet gestald.");
      return;
    }
    const bike = state?.bicycles?.find((b) => b.id === bicycleId);
    if (!bike) return;
    const passID = occ.passID ?? bike.barcode;
    setCheckOutLoading(bicycleId);
    setMessage(null);
    try {
      const simulationTime = await fetchSimulationTime();
      const checkindate = occ.checkInDate ?? occ.createdAt ?? simulationTime;
      const res = await postManagedTransaction(
        credentials,
        citycodeFromLocationId(occ.locationid),
        occ.locationid,
        occ.sectionid,
        buildManagedCheckOut({
          externaltransactionid: occ.externalTransactionID?.trim() || generateExternalTransactionId(),
          idcode: passID,
          checkindate,
          checkoutdate: simulationTime,
          barcode: bike.barcode,
          biketypeid: bike.biketypeID ?? 1,
          checkouttype: checkType,
          checkintype: checkType,
          sectionid: occ.sectionid,
        }),
        managedScope
      );
      if (res.status === 1) {
        const removeRes = await fetch("/api/protected/parking-simulation/state", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "remove", bicycleId }),
        });
        const removeData = await removeRes.json();
        if (removeData.ok) {
          await reportBezettingSnapshots(credentials, removeData.bezetting as BezettingSnapshot[] | undefined);
          setMessage("Check-out succesvol.");
          loadState();
          onSuccess?.();
        } else {
          setMessage(removeData.message ?? "Remove mislukt");
        }
      } else {
        const msg = res.message ?? "onbekend";
        setMessage("Fout: " + msg + fmsWriteErrorHint(String(msg)));
      }
    } catch (e) {
      setMessage("Fout: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setCheckOutLoading(null);
    }
  };

  const handleAddSaldo = async () => {
    if (!credentials) {
      setMessage("Geen FMS API-credentials. Vul UrlName en wachtwoord in bij Instellingen (opgeslagen in deze browser).");
      return;
    }
    const passID = saldoPassID.trim() || (freePasids[0]?.pasID ?? "");
    if (!passID) {
      setMessage("Vul passID in of selecteer een pas.");
      return;
    }
    const amount = parseFloat(saldoAmount);
    if (Number.isNaN(amount) || amount <= 0) {
      setMessage("Vul een geldig bedrag in (positief getal).");
      return;
    }
    if (!currentLocationId) {
      setMessage("Selecteer een stalling.");
      return;
    }
    setSaldoLoading(true);
    setMessage(null);
    try {
      const simulationTime = await fetchSimulationTime();
      const res = await addSaldo(credentials, currentLocationId, {
        passID,
        amount,
        paymentTypeID: saldoPaymentTypeID,
        transactionDate: simulationTime,
      });
      if (res.status === 1) {
        setMessage("Saldo toegevoegd.");
        setSaldoAmount("");
        fetch("/api/protected/parking-simulation/pasids")
          .then((r) => (r.ok ? r.json() : {}))
          .then((data: { data?: PasidEntry[] }) => setPasids(data.data ?? []))
          .catch(() => {});
        onSuccess?.();
      } else {
        setMessage("Fout: " + (res.message ?? "onbekend"));
      }
    } catch (e) {
      setMessage("Fout: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setSaldoLoading(false);
    }
  };

  const handleLinkBike = async () => {
    if (!credentials) {
      setMessage("Geen FMS API-credentials. Vul UrlName en wachtwoord in bij Instellingen (opgeslagen in deze browser).");
      return;
    }
    const bike = state?.bicycles?.find((b) => b.id === linkBikeId);
    if (!bike) {
      setMessage("Selecteer een fiets.");
      return;
    }
    const passID = linkPassID.trim() || (freePasids[0]?.pasID ?? "");
    if (!passID) {
      setMessage("Vul passID in of selecteer een pas.");
      return;
    }
    if (!currentLocationId) {
      setMessage("Selecteer een stalling.");
      return;
    }
    setLinkLoading(true);
    setMessage(null);
    try {
      const res = await saveBike(credentials, currentLocationId, {
        barcode: bike.barcode,
        passID,
      });
      if (res.status === 1) {
        setMessage("Fiets gekoppeld aan pas.");
        setLinkBikeId("");
        setLinkPassID("");
        fetch("/api/protected/parking-simulation/pasids")
          .then((r) => (r.ok ? r.json() : {}))
          .then((data: { data?: PasidEntry[] }) => setPasids(data.data ?? []))
          .catch(() => {});
        onSuccess?.();
      } else {
        setMessage("Fout: " + (res.message ?? "onbekend"));
      }
    } catch (e) {
      setMessage("Fout: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setLinkLoading(false);
    }
  };

  const freePasids = pasids.filter((p) => !p.hasParkedBike);

  return (
    <div>
      <h4 className="font-medium mb-2">Report transactions</h4>
      <p className="text-sm text-gray-600 mb-2">
        Check-in/out schrijft managed transactions (v4). Park/unpark stuurt daarna{" "}
        <strong>report bezetting</strong> voor dezelfde stalling.
      </p>
      <div className="flex flex-wrap gap-4 items-end mb-3">
        <div>
          <label className="block text-sm text-gray-600 mb-1">Check type</label>
          <select
            value={checkType}
            onChange={(e) => {
              const v = e.target.value as SimCheckType;
              setCheckType(v);
              writeSimCheckType(v);
            }}
            className="border rounded px-3 py-2"
          >
            <option value="user">user</option>
            <option value="controle">controle</option>
            <option value="system">system</option>
          </select>
        </div>
        <div>
          <label className="block text-sm text-gray-600 mb-1">Report transactions niveau</label>
          <select
            value={managedScope}
            onChange={(e) => {
              const v = e.target.value as ManagedWriteScope;
              setManagedScope(v);
              writeManagedWriteScope(v);
            }}
            className="border rounded px-3 py-2"
          >
            <option value="section">sectie</option>
            <option value="location">stalling (location)</option>
          </select>
        </div>
        {actieType === "in" && (
          <div>
            <label className="block text-sm text-gray-600 mb-1">Aantal (batch, max 50)</label>
            <input
              type="number"
              min={1}
              max={50}
              value={batchCount}
              onChange={(e) => setBatchCount(Math.min(50, Math.max(1, Number(e.target.value) || 1)))}
              className="border rounded px-3 py-2 w-24"
            />
          </div>
        )}
      </div>
      {!credentialsLoading && !credentials && (
        <p className="text-sm text-amber-700 mb-2">
          FMS API-credentials ontbreken. Vul UrlName en wachtwoord in bij Instellingen (opgeslagen in deze browser).
        </p>
      )}
      {currentLocationId && layout && normalizedSections.length === 0 && (
        <p className="text-sm text-amber-700 mb-2">
          Geen secties gevonden voor deze stalling — check-in is niet mogelijk.
        </p>
      )}
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
        {actieType === "in" && (
          <div>
            <label className="block text-sm text-gray-600 mb-1">Pass</label>
            <select
              value={selectedPassID}
              onChange={(e) => setSelectedPassID(e.target.value)}
              className="border rounded px-3 py-2 min-w-[140px]"
            >
              <option value={PASSID_AUTO}>Selecteer automatisch</option>
              {freePasids.map((p) => (
                <option key={p.id} value={p.pasID}>
                  {p.pasID} {p.barcodeFiets ? `(${p.barcodeFiets})` : ""}
                </option>
              ))}
              {pasids.filter((p) => p.hasParkedBike).map((p) => (
                <option key={p.id} value={p.pasID}>
                  {p.pasID} {p.barcodeFiets ? `(${p.barcodeFiets})` : ""} – gestald
                </option>
              ))}
            </select>
          </div>
        )}
        <div>
          <label className="block text-sm text-gray-600 mb-1">Fiets type</label>
          <select
            value={typeof selectedBiketypeId === "number" && biketypeIdsWithBikes.includes(selectedBiketypeId) ? selectedBiketypeId : ""}
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
                  {formatStallingLabel(s.title, s.locationid)}
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
                !credentials
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
                !credentials
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

      <div className="mt-4 space-y-3">
        <div className="border rounded p-3 bg-gray-50">
          <button
            type="button"
            onClick={() => setShowSaldoBlock(!showSaldoBlock)}
            className="flex items-center gap-2 text-sm font-medium text-gray-700 hover:text-gray-900"
          >
            {showSaldoBlock ? "▼" : "▶"} Saldo toevoegen
          </button>
          {showSaldoBlock && (
            <div className="mt-3 flex flex-wrap gap-4 items-end">
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
                        {formatStallingLabel(s.title, s.locationid)}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div>
                <label className="block text-sm text-gray-600 mb-1">Pass</label>
                <select
                  value={saldoPassID || "__auto__"}
                  onChange={(e) => setSaldoPassID(e.target.value === "__auto__" ? "" : e.target.value)}
                  className="border rounded px-3 py-2 min-w-[140px]"
                >
                  <option value="__auto__">Selecteer automatisch</option>
                  {pasids.map((p) => (
                    <option key={p.id} value={p.pasID}>
                      {p.pasID} {p.barcodeFiets ? `(${p.barcodeFiets})` : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">Bedrag (€)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={saldoAmount}
                  onChange={(e) => setSaldoAmount(e.target.value)}
                  placeholder="5.00"
                  className="border rounded px-3 py-2 w-24"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">Betaalmethode</label>
                <select
                  value={saldoPaymentTypeID}
                  onChange={(e) => setSaldoPaymentTypeID(Number(e.target.value))}
                  className="border rounded px-3 py-2"
                >
                  <option value={1}>Betaald</option>
                  <option value={2}>Kwijtschelding</option>
                </select>
              </div>
              <Button
                onClick={() => void handleAddSaldo()}
                disabled={saldoLoading || !currentLocationId || !saldoAmount || !credentials}
              >
                Saldo toevoegen
              </Button>
            </div>
          )}
        </div>

        <div className="border rounded p-3 bg-gray-50">
          <button
            type="button"
            onClick={() => setShowLinkBlock(!showLinkBlock)}
            className="flex items-center gap-2 text-sm font-medium text-gray-700 hover:text-gray-900"
          >
            {showLinkBlock ? "▼" : "▶"} Koppel fiets aan pas
          </button>
          {showLinkBlock && (
            <div className="mt-3 flex flex-wrap gap-4 items-end">
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
                        {formatStallingLabel(s.title, s.locationid)}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div>
                <label className="block text-sm text-gray-600 mb-1">Fiets</label>
                <select
                  value={linkBikeId}
                  onChange={(e) => setLinkBikeId(e.target.value)}
                  className="border rounded px-3 py-2 min-w-[140px]"
                >
                  <option value="">—</option>
                  {(state?.bicycles ?? []).map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.barcode}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">Pass</label>
                <select
                  value={linkPassID || "__auto__"}
                  onChange={(e) => setLinkPassID(e.target.value === "__auto__" ? "" : e.target.value)}
                  className="border rounded px-3 py-2 min-w-[140px]"
                >
                  <option value="__auto__">Selecteer automatisch</option>
                  {pasids.map((p) => (
                    <option key={p.id} value={p.pasID}>
                      {p.pasID} {p.barcodeFiets ? `(${p.barcodeFiets})` : ""}
                    </option>
                  ))}
                </select>
              </div>
              <Button
                onClick={() => void handleLinkBike()}
                disabled={linkLoading || !currentLocationId || !linkBikeId || !credentials}
              >
                Koppelen
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
