import React, { useCallback, useEffect, useState } from "react";
import type { LaagSaldoResultaat } from "~/backend/services/reports/laagSaldo";

const LaagSaldoPanel: React.FC = () => {
  const [maxSaldoInput, setMaxSaldoInput] = useState("0,00");
  const [stallingsId, setStallingsId] = useState("");
  const [data, setData] = useState<LaagSaldoResultaat | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async (maxSaldo: string, stalling: string) => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/reports/laag_saldo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ maxSaldo, stallingsId: stalling }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error((json as { error?: string } | null)?.error ?? "Het overzicht kon niet worden geladen");
      setData(json as LaagSaldoResultaat);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Het overzicht kon niet worden geladen");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load("0", "");
  }, [load]);

  const totaal = data?.regels.reduce((s, r) => s + r.aantal, 0) ?? 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
      <p className="text-sm text-gray-600">
        Aantal fietsen dat nu in de stalling staat met een stallingstegoed lager dan het opgegeven bedrag.
      </p>
      <form
        className="flex flex-wrap items-end gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          void load(maxSaldoInput, stallingsId);
        }}
      >
        <label className="flex flex-col text-sm font-semibold text-gray-700">
          Saldo lager dan (€)
          <input
            type="text"
            inputMode="decimal"
            value={maxSaldoInput}
            onChange={(e) => setMaxSaldoInput(e.target.value)}
            maxLength={7}
            className="mt-1 h-10 w-28 rounded-md border border-gray-300 px-3 text-right font-normal"
          />
        </label>
        <label className="flex flex-col text-sm font-semibold text-gray-700">
          Stalling
          <select
            value={stallingsId}
            onChange={(e) => setStallingsId(e.target.value)}
            className="mt-1 h-10 min-w-56 rounded-md border border-gray-300 px-3 font-normal"
          >
            <option value="">Alle stallingen</option>
            {data?.stallingen.map((s) => (
              <option key={s.StallingsID} value={s.StallingsID}>{s.Title}</option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          className="h-10 rounded-md bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700"
        >
          Zoek
        </button>
      </form>

      {error && <div className="font-bold text-red-600">{error}</div>}
      {loading && <div className="spinner"><div className="loader"></div></div>}

      {!loading && data && (
        data.regels.length === 0 ? (
          <div className="text-gray-600">Geen actieve FMS-stallingen{data.stallingsId ? " of secties" : ""} gevonden.</div>
        ) : (
          <table className="w-full max-w-2xl text-sm">
            <thead>
              <tr>
                <th className="border-b border-gray-400 px-3 py-1 text-left">{data.stallingsId ? "Sectie" : "Stalling"}</th>
                <th className="border-b border-gray-400 px-3 py-1 text-right">Aantal fietsen</th>
              </tr>
            </thead>
            <tbody>
              {data.regels.map((r) => (
                <tr key={r.id} className="border-b border-gray-100">
                  <td className="px-3 py-1">{r.naam}</td>
                  <td className="px-3 py-1 text-right tabular-nums">{r.aantal}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-black font-bold">
                <td className="px-3 py-1">Totaal</td>
                <td className="px-3 py-1 text-right tabular-nums">{totaal}</td>
              </tr>
            </tfoot>
          </table>
        )
      )}
    </div>
  );
};

export default LaagSaldoPanel;
