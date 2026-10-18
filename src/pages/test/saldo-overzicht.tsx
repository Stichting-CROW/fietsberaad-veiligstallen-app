import React, { useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { Button } from "~/components/Button";
import type { SaldoOverzicht, SaldoOverzichtRow } from "~/server/services/test/saldo-overzicht";

function money(amount: number): string {
  return `€ ${amount.toFixed(2)}`;
}

function typeCounts(row: SaldoOverzichtRow): string {
  if (row.transactiesPerType.length === 0) return "—";
  return row.transactiesPerType.map((item) => `${item.code}: ${item.count}`).join(", ");
}

const SaldoOverzichtPage: React.FC = () => {
  const { data: session } = useSession();
  const [rows, setRows] = useState<SaldoOverzichtRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    setRows(null);
    try {
      const response = await fetch("/api/protected/test/saldo-overzicht");
      const json = await response.json();
      if (!response.ok) {
        setError(json.error ?? "Fout bij ophalen overzicht");
        return;
      }
      setRows((json as SaldoOverzicht).rows ?? []);
    } catch {
      setError("Fout bij ophalen overzicht");
    } finally {
      setLoading(false);
    }
  };

  if (!session) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="bg-yellow-50 border border-yellow-300 rounded-lg p-6 max-w-2xl mx-auto">
          <h3 className="text-lg font-medium text-yellow-800 mb-2">Inloggen vereist</h3>
          <p className="text-sm text-yellow-700">U moet ingelogd zijn om deze pagina te bekijken.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-none px-4 py-8">
      <div className="mb-4">
        <Link href="/test" className="text-blue-600 hover:text-blue-800 text-sm">
          ← Terug naar test menu
        </Link>
      </div>
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Saldo overzicht</h1>
      <p className="text-sm text-gray-600 mb-6">
        Accounts met saldo boven 0, of met minstens één geslaagde financiële transactie in de afgelopen 12 maanden. De aantallen en gemeenten gaan over die 12 maanden.
      </p>
      <form
        className="mb-8"
        onSubmit={(e) => {
          e.preventDefault();
          void load();
        }}
      >
        <Button disabled={loading} className="h-10 px-4" style={{ backgroundColor: "#3B82F6" }}>
          {loading ? "Bezig…" : "Toon overzicht"}
        </Button>
      </form>
      {error && <div className="mb-4 font-semibold text-red-600">{error}</div>}
      {rows && (
        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">{rows.length} accounts</h2>
          {rows.length === 0 ? (
            <p className="text-sm text-gray-600">Geen accounts.</p>
          ) : (
            <div className="overflow-x-auto border border-gray-200 rounded-lg">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium text-gray-600">Account</th>
                    <th className="px-3 py-2 text-left font-medium text-gray-600">E-mail</th>
                    <th className="px-3 py-2 text-right font-medium text-gray-600">Saldo</th>
                    <th className="px-3 py-2 text-left font-medium text-gray-600">Transacties per type</th>
                    <th className="px-3 py-2 text-left font-medium text-gray-600">Gemeenten</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {rows.map((row) => (
                    <tr key={row.accountID}>
                      <td className="px-3 py-2 font-mono text-xs break-all">{row.accountID}</td>
                      <td className="px-3 py-2">{row.email ?? "—"}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{money(row.saldo)}</td>
                      <td className="px-3 py-2">{typeCounts(row)}</td>
                      <td className="px-3 py-2">{row.gemeenten.length > 0 ? row.gemeenten.join(", ") : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  );
};

export default SaldoOverzichtPage;
