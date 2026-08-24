import React, { useState } from "react";
import { Button } from "~/components/Button";
import { addSubscription, subscribe } from "~/lib/parking-simulation/fms-api-write-client";
import { formatStallingLabel } from "~/lib/parking-simulation/types";
import { useParkingSimCredentials } from "~/hooks/useParkingSimCredentials";

export type Stalling = { id: string; locationid: string; title: string };

async function fetchSimulationTime(): Promise<string> {
  const res = await fetch("/api/protected/parking-simulation/time");
  const data = await res.json();
  return data.simulationTime ?? new Date().toISOString();
}

type Props = {
  stallings: Stalling[];
  onMessage?: (message: string | null) => void;
};

const AbonnementenTab: React.FC<Props> = ({ stallings, onMessage }) => {
  const { credentials } = useParkingSimCredentials();
  const [selectedLocationId, setSelectedLocationId] = useState(stallings[0]?.locationid ?? "");
  const [message, setMessage] = useState<string | null>(null);

  const setMsg = (m: string | null) => {
    setMessage(m);
    onMessage?.(m);
  };

  // Add subscription form
  const [addSubTypeID, setAddSubTypeID] = useState("");
  const [addSubPassID, setAddSubPassID] = useState("");
  const [addSubAmount, setAddSubAmount] = useState("");
  const [addSubIngangsdatum, setAddSubIngangsdatum] = useState("");
  const [addSubAfloopdatum, setAddSubAfloopdatum] = useState("");
  const [addSubLoading, setAddSubLoading] = useState(false);

  // Subscribe form
  const [subSubscriptionID, setSubSubscriptionID] = useState("");
  const [subPassID, setSubPassID] = useState("");
  const [subLoading, setSubLoading] = useState(false);

  const handleAddSubscription = async () => {
    if (!credentials) {
      setMsg("Geen FMS API-credentials. Vul UrlName en wachtwoord in bij Instellingen (opgeslagen in deze browser).");
      return;
    }
    const subscriptiontypeID = parseInt(addSubTypeID, 10);
    if (Number.isNaN(subscriptiontypeID) || subscriptiontypeID < 1) {
      setMsg("Vul een geldig abonnementstype ID in.");
      return;
    }
    if (!addSubPassID.trim()) {
      setMsg("Vul passID in.");
      return;
    }
    if (!selectedLocationId) {
      setMsg("Selecteer een stalling.");
      return;
    }
    setAddSubLoading(true);
    setMsg(null);
    try {
      const simulationTime = await fetchSimulationTime();
      const res = await addSubscription(credentials, selectedLocationId, {
        subscriptiontypeID,
        passID: addSubPassID.trim(),
        amount: addSubAmount ? parseFloat(addSubAmount) : 0,
        paymentTypeID: 1,
        ingangsdatum: addSubIngangsdatum || simulationTime,
        afloopdatum: addSubAfloopdatum || undefined,
        transactionDate: simulationTime,
      });
      if (res.status === 1) {
        setMsg(`Abonnement toegevoegd. ID: ${res.id ?? "—"}`);
        setAddSubTypeID("");
        setAddSubPassID("");
        setAddSubAmount("");
        setAddSubIngangsdatum("");
        setAddSubAfloopdatum("");
      } else {
        setMsg("Fout: " + (res.message ?? "onbekend"));
      }
    } catch (e) {
      setMsg("Fout: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setAddSubLoading(false);
    }
  };

  const handleSubscribe = async () => {
    if (!credentials) {
      setMsg("Geen FMS API-credentials. Vul UrlName en wachtwoord in bij Instellingen (opgeslagen in deze browser).");
      return;
    }
    const subscriptionID = parseInt(subSubscriptionID, 10);
    if (Number.isNaN(subscriptionID) || subscriptionID < 1) {
      setMsg("Vul een geldig abonnement ID in.");
      return;
    }
    if (!subPassID.trim()) {
      setMsg("Vul passID in (sleutelhanger om te koppelen).");
      return;
    }
    if (!selectedLocationId) {
      setMsg("Selecteer een stalling.");
      return;
    }
    setSubLoading(true);
    setMsg(null);
    try {
      const res = await subscribe(credentials, selectedLocationId, {
        subscriptionID,
        passID: subPassID.trim(),
      });
      if (res.status === 1) {
        setMsg("Pas gekoppeld aan abonnement.");
        setSubSubscriptionID("");
        setSubPassID("");
      } else {
        setMsg("Fout: " + (res.message ?? "onbekend"));
      }
    } catch (e) {
      setMsg("Fout: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setSubLoading(false);
    }
  };

  return (
    <div className="bg-white border rounded-lg p-6 space-y-8">
      <h3 className="text-lg font-bold">Abonnementen</h3>
      <p className="text-sm text-gray-600">
        Voeg abonnementen toe en koppel sleutelhangers via FMS v4. Gebruik de database om bestaande abonnement-IDs te vinden.
      </p>

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

      <div className="border rounded p-4 bg-gray-50 space-y-4">
        <h4 className="font-medium">Abonnement toevoegen</h4>
        <div className="flex flex-wrap gap-4 items-end">
          <div>
            <label className="block text-sm text-gray-600 mb-1">Abonnementstype ID</label>
            <input
              type="number"
              min="1"
              value={addSubTypeID}
              onChange={(e) => setAddSubTypeID(e.target.value)}
              placeholder="bijv. 8"
              className="border rounded px-3 py-2 w-32"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-600 mb-1">PassID</label>
            <input
              type="text"
              value={addSubPassID}
              onChange={(e) => setAddSubPassID(e.target.value)}
              placeholder="sleutelhanger-ID"
              className="border rounded px-3 py-2 min-w-[140px]"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-600 mb-1">Bedrag (€)</label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={addSubAmount}
              onChange={(e) => setAddSubAmount(e.target.value)}
              placeholder="0"
              className="border rounded px-3 py-2 w-24"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-600 mb-1">Ingangsdatum</label>
            <input
              type="datetime-local"
              value={addSubIngangsdatum}
              onChange={(e) => setAddSubIngangsdatum(e.target.value)}
              className="border rounded px-3 py-2"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-600 mb-1">Afloopdatum</label>
            <input
              type="datetime-local"
              value={addSubAfloopdatum}
              onChange={(e) => setAddSubAfloopdatum(e.target.value)}
              className="border rounded px-3 py-2"
            />
          </div>
          <Button
            onClick={() => void handleAddSubscription()}
            disabled={addSubLoading || !selectedLocationId || !addSubTypeID || !addSubPassID.trim() || !credentials}
          >
            Abonnement toevoegen
          </Button>
        </div>
      </div>

      <div className="border rounded p-4 bg-gray-50 space-y-4">
        <h4 className="font-medium">Pas koppelen aan abonnement</h4>
        <div className="flex flex-wrap gap-4 items-end">
          <div>
            <label className="block text-sm text-gray-600 mb-1">Abonnement ID</label>
            <input
              type="number"
              min="1"
              value={subSubscriptionID}
              onChange={(e) => setSubSubscriptionID(e.target.value)}
              placeholder="abonnement-ID uit database"
              className="border rounded px-3 py-2 w-40"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-600 mb-1">PassID (sleutelhanger)</label>
            <input
              type="text"
              value={subPassID}
              onChange={(e) => setSubPassID(e.target.value)}
              placeholder="sleutelhanger om te koppelen"
              className="border rounded px-3 py-2 min-w-[140px]"
            />
          </div>
          <Button
            onClick={() => void handleSubscribe()}
            disabled={subLoading || !selectedLocationId || !subSubscriptionID || !subPassID.trim() || !credentials}
          >
            Pas koppelen aan abonnement
          </Button>
        </div>
      </div>

      {message && (
        <p className={`text-sm ${message.startsWith("Fout") ? "text-red-600" : "text-green-600"}`}>
          {message}
        </p>
      )}
    </div>
  );
};

export default AbonnementenTab;
