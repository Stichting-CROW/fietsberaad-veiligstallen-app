import React, { useState, useEffect } from "react";

type FmsTablesStatus = {
  tablesExist: boolean;
  triggersExist: boolean;
  tableCounts?: Record<string, number>;
};

const DataApiComponent: React.FC = () => {
  const [fmsStatus, setFmsStatus] = useState<FmsTablesStatus | null>(null);
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

  useEffect(() => {
    fetchFmsStatus();
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

  return (
    <div>
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

      <div className="bg-gray-200 border-2 border-gray-400 p-4 rounded mb-4">
        <h2 className="text-xl font-semibold mb-3">FMS test tabellen (new_*) en triggers</h2>
        <div>
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

      {loading && (
        <div className="mt-4">
          <div className="loader" />
        </div>
      )}
    </div>
  );
};

export default DataApiComponent;
