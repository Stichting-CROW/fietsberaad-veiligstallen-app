import React, { useState, useEffect } from "react";
import { useDispatch } from "react-redux";
import { useSession } from "next-auth/react";
import { useRouter } from "next/router";
import { incrementGemeentenVersion } from "~/store/appSlice";

type FmsTablesStatus = {
  tablesExist: boolean;
  triggersExist: boolean;
  tableCounts?: Record<string, number>;
};

type TestGemeenteStatus = {
  exists: boolean;
  id: string | null;
};

const DataApiComponent: React.FC = () => {
  const dispatch = useDispatch();
  const { data: session, update: updateSession } = useSession();
  const router = useRouter();
  const [fmsStatus, setFmsStatus] = useState<FmsTablesStatus | null>(null);
  const [testGemeenteStatus, setTestGemeenteStatus] = useState<TestGemeenteStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [manualSql, setManualSql] = useState<string | null>(null);

  const fetchFmsStatus = async () => {
    try {
      const res = await fetch("/api/protected/data-api/fms-tables");
      if (!res.ok) throw new Error(res.statusText);
      const data = await res.json();
      setFmsStatus(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fout bij laden");
    }
  };

  const fetchTestGemeenteStatus = async () => {
    try {
      const res = await fetch("/api/protected/test-gemeente/status");
      if (!res.ok) throw new Error(res.statusText);
      const data = await res.json();
      setTestGemeenteStatus(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fout bij laden");
    }
  };

  useEffect(() => {
    fetchFmsStatus();
    fetchTestGemeenteStatus();
  }, []);

  const handleFmsAction = async (action: string) => {
    setLoading(true);
    setError(undefined);
    setManualSql(null);
    try {
      const res = await fetch("/api/protected/data-api/fms-tables", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.manualSql && (action === "drop" || action === "create-triggers" || action === "create")) {
          setManualSql(data.manualSql);
          setError(data.error);
          void fetchFmsStatus();
          setLoading(false);
          return;
        }
        throw new Error(data.error || res.statusText);
      }
      await fetchFmsStatus();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Actie mislukt");
    } finally {
      setLoading(false);
    }
  };

  const handleTestGemeenteAction = async () => {
    setLoading(true);
    setError(undefined);
    try {
      const endpoint = testGemeenteStatus?.exists ? "/api/protected/test-gemeente/delete" : "/api/protected/test-gemeente/create";
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || res.statusText);
      await fetchTestGemeenteStatus();
      if (!testGemeenteStatus?.exists) {
        dispatch(incrementGemeentenVersion());
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Actie mislukt");
    } finally {
      setLoading(false);
    }
  };

  const handleSwitchToTestgemeente = async () => {
    const contactId = testGemeenteStatus?.id;
    if (!contactId || !session) return;
    setLoading(true);
    setError(undefined);
    try {
      const res = await fetch("/api/security/switch-contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactId }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || res.statusText);
      }
      const { user } = await res.json();
      await updateSession({ ...session, user });
      await router.replace("/beheer/fietsenstallingen");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Wisselen mislukt");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6">
      <h1 className="text-3xl font-bold mb-4">Data | API</h1>

      {error && (
        <div className="mb-4 p-3 bg-red-100 text-red-700 rounded font-semibold">
          {error}
        </div>
      )}

      {manualSql && (
        <div className="mb-4 p-4 bg-amber-50 border border-amber-300 rounded">
          <p className="font-semibold text-amber-800 mb-2">Voer deze SQL handmatig uit in een MySQL-client:</p>
          <pre className="p-3 bg-white border rounded text-sm overflow-x-auto mb-2">{manualSql}</pre>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => {
                void navigator.clipboard.writeText(manualSql ?? "");
              }}
              className="p-2 rounded-md bg-amber-500 hover:bg-amber-600 text-white"
            >
              Kopieer naar klembord
            </button>
            <button
              onClick={() => {
                setManualSql(null);
                setError(undefined);
                void fetchFmsStatus();
              }}
              className="p-2 rounded-md bg-green-600 hover:bg-green-700 text-white"
            >
              Klaar
            </button>
          </div>
        </div>
      )}

      <div className="bg-gray-200 border-2 border-gray-400 p-4 pl-4 rounded mb-4">
        <h2 className="text-xl font-semibold">FMS test tabellen (new_*) en triggers</h2>
        <div className="mt-4">
          {fmsStatus && (
            <table className="table-auto">
              <tbody>
                <tr>
                  <td className="font-semibold">Test tabellen:</td>
                  <td className="pl-2">{fmsStatus.tablesExist ? "Aanwezig" : "Niet aanwezig"}</td>
                </tr>
                <tr>
                  <td className="font-semibold">Triggers:</td>
                  <td className="pl-2">{fmsStatus.triggersExist ? "Aanwezig" : "Niet aanwezig"}</td>
                </tr>
                {fmsStatus.tableCounts && (
                  <tr>
                    <td className="font-semibold align-top">Aantal per tabel:</td>
                    <td className="pl-2">
                      <ul className="text-sm text-gray-700">
                        {Object.entries(fmsStatus.tableCounts).map(([k, v]) => (
                          <li key={k}>{k}: {v >= 0 ? v : "—"}</li>
                        ))}
                      </ul>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            onClick={() => handleFmsAction("create-tables")}
            disabled={loading || fmsStatus?.tablesExist}
            className="p-2 rounded-md bg-blue-500 hover:bg-blue-700 disabled:bg-gray-400 text-white"
          >
            Maak test tabellen
          </button>
          <button
            onClick={() => handleFmsAction("create-triggers")}
            disabled={loading || !fmsStatus?.tablesExist || fmsStatus?.triggersExist}
            className="p-2 rounded-md bg-blue-500 hover:bg-blue-700 disabled:bg-gray-400 text-white"
          >
            Maak triggers
          </button>
          <button
            onClick={() => handleFmsAction("drop")}
            disabled={loading || !fmsStatus?.tablesExist}
            className="p-2 rounded-md bg-red-500 hover:bg-red-700 disabled:bg-gray-400 text-white"
          >
            Verwijder test tabellen
          </button>
        </div>
      </div>

      <div className="bg-gray-200 border-2 border-gray-400 p-4 pl-4 rounded mb-4">
        <h2 className="text-xl font-semibold">Test API gemeente</h2>
        <div className="mt-4">
          {testGemeenteStatus && (
            <p>
              Status: {testGemeenteStatus.exists ? "Aanwezig" : "Niet aanwezig"}
              {testGemeenteStatus.id && ` (ID: ${testGemeenteStatus.id})`}
            </p>
          )}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            onClick={handleTestGemeenteAction}
            disabled={loading}
            className={`p-2 rounded-md ${testGemeenteStatus?.exists ? "bg-red-500 hover:bg-red-700" : "bg-green-500 hover:bg-green-700"} disabled:bg-gray-400 text-white`}
          >
            {testGemeenteStatus?.exists ? "Verwijder Test API gemeente" : "Maak Test API gemeente"}
          </button>
          {testGemeenteStatus?.exists && testGemeenteStatus.id && (
            <button
              onClick={handleSwitchToTestgemeente}
              disabled={loading}
              className="p-2 rounded-md bg-blue-500 hover:bg-blue-700 disabled:bg-gray-400 text-white"
            >
              Ga naar testgemeente (fietsenstallingen)
            </button>
          )}
        </div>
      </div>

      {loading && (
        <div className="mt-4">
          <div className="loader" />
        </div>
      )}
    </div>
  );
};

export default DataApiComponent;
