import React, { useState } from "react";
import { useSession } from "next-auth/react";
import type { PasOverzicht } from "~/server/display/overzichten-queries";
import { userHasRight } from "~/types/utils";
import { VSSecurityTopic } from "~/types/securityprofile";

function formatWhen(iso: string, withType: string | null): string {
  const d = new Date(iso);
  const today = new Date();
  const day = d.toDateString() === today.toDateString()
    ? "Vandaag"
    : `${String(d.getDate()).padStart(2, "0")}-${String(d.getMonth() + 1).padStart(2, "0")}-${d.getFullYear()}`;
  const time = `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
  const extra = withType && withType !== "user" ? ` (${withType})` : "";
  return `${day} ${time}${extra}`;
}

const PasPanel: React.FC = () => {
  const { data: session } = useSession();
  const isFietsberaad = userHasRight(session?.user?.securityProfile, VSSecurityTopic.fietsberaad_superadmin)
    || userHasRight(session?.user?.securityProfile, VSSecurityTopic.fietsberaad_admin);
  const [pas, setPas] = useState("");
  const [data, setData] = useState<PasOverzicht | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const search = async (pasId: string) => {
    const trimmed = pasId.trim();
    if (!trimmed) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/reports/pas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pas: trimmed }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error((json as { error?: string } | null)?.error ?? "De pas kon niet worden opgezocht");
      setData(json as PasOverzicht);
    } catch (e) {
      setError(e instanceof Error ? e.message : "De pas kon niet worden opgezocht");
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
      <p className="text-sm text-gray-600">
        {isFietsberaad
          ? "Alle stallingen voor deze pas. Een fietsberaad-superadmin zoekt in alle gemeenten."
          : "Stallingen voor deze pas in de afgelopen 30 dagen."}
      </p>
      <form
        className="flex flex-wrap items-end gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          void search(pas);
        }}
      >
        <label className="flex flex-col text-sm font-semibold text-gray-700">
          Pasnummer
          <input
            type="text"
            value={pas}
            onChange={(e) => setPas(e.target.value)}
            className="mt-1 h-10 w-56 rounded-md border border-gray-300 px-3 font-normal"
          />
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

      {!loading && data && !data.found && (
        <div className="text-gray-600">Pas niet gevonden.</div>
      )}

      {!loading && data?.found && (
        <>
          <p className="text-sm text-gray-800">
            {data.email
              ? <>Pas gekoppeld aan account van <a className="text-blue-700 underline" href={`mailto:${data.email}`}>{data.email}</a>.</>
              : "Pas niet gekoppeld aan een account."}
            {data.gemeente ? ` Gemeente: ${data.gemeente}.` : ""}
          </p>
          {data.transactions.length === 0 ? (
            <div className="text-gray-600">
              {data.days == null
                ? "Geen transacties gevonden voor deze pas."
                : "Geen transacties gevonden voor deze pas in de afgelopen 30 dagen."}
            </div>
          ) : (
            <table className="w-full max-w-4xl text-sm">
              <thead>
                <tr>
                  <th className="border-b border-gray-400 px-3 py-1 text-left">Check in</th>
                  <th className="border-b border-gray-400 px-3 py-1 text-left">Check uit</th>
                  <th className="border-b border-gray-400 px-3 py-1 text-left">Omschrijving</th>
                  <th className="border-b border-gray-400 px-3 py-1 text-right">Bij- en afschrijvingen</th>
                </tr>
              </thead>
              <tbody>
                {data.transactions.map((t, i) => (
                  <tr key={`${t.checkin}-${t.stallingsId}-${i}`} className="border-b border-gray-100">
                    <td className="px-3 py-1 whitespace-nowrap">{formatWhen(t.checkin, t.typeCheckin)}</td>
                    <td className="px-3 py-1 whitespace-nowrap">{t.checkout ? formatWhen(t.checkout, t.typeCheckout) : "—"}</td>
                    <td className="px-3 py-1">{t.description}</td>
                    <td className={`px-3 py-1 text-right tabular-nums ${t.amount > 0 ? "text-green-700" : t.amount < 0 ? "text-red-700" : ""}`}>
                      € {t.amount.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="mt-3 text-xs text-gray-500">
            Bezoeken ouder dan 18 maanden zijn verwijderd vanwege de bewaartermijn voor privacy.
          </p>
        </>
      )}
    </div>
  );
};

export default PasPanel;
