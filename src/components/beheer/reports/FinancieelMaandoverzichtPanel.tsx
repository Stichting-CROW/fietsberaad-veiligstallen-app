import React, { useEffect, useState } from "react";
import moment from "moment";
import type {
  FinancieelBedragen,
  FinancieelMaandoverzicht,
  FinancieelPaar,
} from "~/backend/services/reports/financieelMaandoverzicht";

const euro = (n: number) =>
  n.toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const count = (n: number) => n.toLocaleString("nl-NL");

type Regel = { label: string; aantal?: number; bedrag?: number; subtotaal?: number; sub?: boolean; kind?: "head" | "subtotaal" | "totaal" };

const geindeInkomsten = (b: FinancieelBedragen, exploitant: string, gemeente: string): Regel[] => {
  const I = b.D + b.E - b.F - b.W;
  const P = b.M + b.N + b.O;
  const V = b.T + b.U;
  const Y = I + P + V;
  return [
    { label: "Stallings- en kluistransacties", kind: "head" },
    { label: "Stallingstransacties" },
    { label: `Betaald via ${exploitant}`, sub: true, aantal: b.Daantal, bedrag: b.D - b.W },
    { label: "Betaald via FMS", sub: true, aantal: b.Eaantal, bedrag: b.E },
    { label: "Restitutie aan klant" },
    { label: `Via ${exploitant}`, sub: true, aantal: b.Faantal, bedrag: -b.F },
    { label: "Subtotaal stallings- en kluistransacties", kind: "subtotaal", subtotaal: I },
    { label: "Abonnementen", kind: "head" },
    { label: "Nieuwe abonnementen en verlengingen" },
    { label: `Betaald via ${exploitant}`, sub: true, aantal: b.Maantal, bedrag: b.M },
    { label: "Betaald via FMS", sub: true, aantal: b.Naantal, bedrag: b.N },
    { label: "Restitutie aan klant" },
    { label: `Via ${exploitant}`, sub: true, aantal: b.Oaantal, bedrag: b.O },
    { label: "Subtotaal abonnementen", kind: "subtotaal", subtotaal: P },
    { label: "Kluisreserveringen", kind: "head" },
    { label: "Nieuwe reserveringen en verlengingen" },
    { label: "Betaald via FMS", sub: true, aantal: b.Taantal, bedrag: b.T },
    { label: "Restitutie aan klant" },
    { label: "Via FMS", sub: true, aantal: b.Uaantal, bedrag: b.U },
    { label: "Subtotaal kluisreserveringen", kind: "subtotaal", subtotaal: V },
    { label: "Opwaardering stallingstegoed²", kind: "head" },
    { label: "Opwaardering stallingstegoed", bedrag: b.W },
    { label: "Overboeking stallingstegoed naar FMS", bedrag: b.W === 0 ? 0 : -b.W },
    { label: "Subtotaal opwaardering stallingstegoed", kind: "subtotaal", subtotaal: 0 },
    { label: `Totaal geïnde inkomsten ${exploitant} in ${gemeente}`, kind: "totaal", subtotaal: Y },
  ];
};

const balans = (b: FinancieelBedragen, exploitant: string): Array<{ label: string; bedrag: number; kind?: "subtotaal" }> => [
  { label: "Totaalwaarde transacties", bedrag: b.A },
  { label: "Totaal geïnd bij klant", bedrag: -b.D - b.E + b.W },
  { label: "Totaal uitbetaald aan klant", bedrag: b.F },
  { label: `Totaal afgewaardeerd door ${exploitant}`, bedrag: b.G },
  { label: "Totaal afgewaardeerd door FMS", bedrag: b.H },
  { label: "Nog niet geïnde stallings- en kluistransacties", bedrag: b.A - b.D - b.E + b.W + b.F + b.G + b.H, kind: "subtotaal" },
];

/** Amount the operator receives from CROW-Fietsberaad for one municipality (`X` in the exploitant PDF). */
const teOntvangen = (b: FinancieelBedragen) => b.E + b.N + b.T + b.U - b.W;

const th = "px-3 py-1 text-left font-semibold text-gray-700 border-b border-gray-400";
const tdNum = "px-3 py-1 text-right tabular-nums";

const GeindeInkomstenTable: React.FC<{ paar: FinancieelPaar }> = ({ paar }) => (
  <table className="w-full max-w-3xl text-sm">
    <thead>
      <tr>
        <th className={th}>&nbsp;</th>
        <th className={`${th} text-right`}>Aantal</th>
        <th className={`${th} text-right`}>Bedrag (€)¹</th>
        <th className={`${th} text-right`}>Subtotaal (€)</th>
      </tr>
    </thead>
    <tbody>
      {geindeInkomsten(paar.bedragen, paar.exploitantNaam, paar.gemeenteNaam).map((r, i) => {
        if (r.kind === "head") {
          return (
            <tr key={i}>
              <td colSpan={4} className="px-3 pt-4 pb-1 font-semibold border-b border-gray-300">{r.label}</td>
            </tr>
          );
        }
        const rowClass = r.kind === "subtotaal"
          ? "italic border-t border-gray-300"
          : r.kind === "totaal"
            ? "font-bold border-t-2 border-black"
            : "";
        return (
          <tr key={i} className={rowClass}>
            <td className={`px-3 py-1 ${r.sub ? "pl-10" : ""}`}>{r.sub ? `- ${r.label}` : r.label}</td>
            <td className={tdNum}>{r.aantal !== undefined ? count(r.aantal) : ""}</td>
            <td className={tdNum}>{r.bedrag !== undefined ? euro(r.bedrag) : ""}</td>
            <td className={tdNum}>{r.subtotaal !== undefined ? euro(r.subtotaal) : ""}</td>
          </tr>
        );
      })}
    </tbody>
  </table>
);

const BalansTable: React.FC<{ paar: FinancieelPaar }> = ({ paar }) => (
  <table className="w-full max-w-3xl text-sm">
    <thead>
      <tr>
        <th className={th}>&nbsp;</th>
        <th className={`${th} text-right`}>Bedrag (€)</th>
      </tr>
    </thead>
    <tbody>
      {balans(paar.bedragen, paar.exploitantNaam).map((r, i) => (
        <tr key={i} className={r.kind === "subtotaal" ? "italic border-t border-gray-300" : ""}>
          <td className="px-3 py-1">{r.label}</td>
          <td className={tdNum}>{euro(r.bedrag)}</td>
        </tr>
      ))}
    </tbody>
  </table>
);

const Noten: React.FC = () => (
  <div className="mt-2 max-w-3xl border-t border-gray-300 pt-2 text-xs text-gray-600 space-y-1">
    <div>¹ De getoonde bedragen zijn de bedragen zoals deze inclusief BTW zijn ontvangen van de klant.</div>
    <div>² Een klant kan zijn stallingstegoed opwaarderen in de stalling door daar meer te betalen dan hij verschuldigd is. Positieve stallingstegoeden worden altijd overgeboekt naar het FMS.</div>
    <div>³ De getoonde bedragen en aantallen zijn indicatief en kunnen afwijken van de brongegevens.</div>
  </div>
);

const CrowOverzicht: React.FC<{ data: FinancieelMaandoverzicht }> = ({ data }) => {
  const sumX = data.paren.reduce((s, p) => s + teOntvangen(p.bedragen), 0);
  const btw = data.btwPercentage ?? 21;
  const btwBedrag = sumX - sumX / (btw / 100 + 1);
  return (
    <section className="space-y-2">
      <h3 className="text-lg font-semibold text-sky-700">ALLE GEMEENTEN - TE ONTVANGEN VAN CROW-FIETSBERAAD</h3>
      <table className="w-full max-w-3xl text-sm">
        <thead>
          <tr>
            <th className={th}>&nbsp;</th>
            <th className={`${th} text-right`}>Bedrag (€)</th>
          </tr>
        </thead>
        {data.paren.map((p) => {
          const b = p.bedragen;
          return (
            <tbody key={p.gemeenteId}>
              <tr><td className="px-3 pt-3 font-semibold" colSpan={2}>Gemeente {p.gemeenteNaam}</td></tr>
              <tr><td className="px-3 py-1">Stallingstransacties/restituties betaald via FMS</td><td className={tdNum}>{euro(b.E)}</td></tr>
              <tr><td className="px-3 py-1">Abonnementen betaald via FMS</td><td className={tdNum}>{euro(b.N)}</td></tr>
              <tr><td className="px-3 py-1">Kluisreserveringen betaald via FMS</td><td className={tdNum}>{euro(b.T)}</td></tr>
              <tr><td className="px-3 py-1">Restitutie kluisreserveringen via FMS</td><td className={tdNum}>{euro(b.U)}</td></tr>
              <tr><td className="px-3 py-1">Opwaardering stallingstegoed via {p.exploitantNaam}³</td><td className={tdNum}>{euro(-b.W)}</td></tr>
              <tr className="italic border-t border-gray-300"><td className="px-3 py-1">Subtotaal gemeente {p.gemeenteNaam}</td><td className={tdNum}>{euro(teOntvangen(b))}</td></tr>
            </tbody>
          );
        })}
        <tbody className="border-t-2 border-black font-bold">
          <tr><td className="px-3 py-1">Totaal exclusief BTW</td><td className={tdNum}>{euro(sumX - btwBedrag)}</td></tr>
          <tr><td className="px-3 py-1">BTW {btw}%</td><td className={tdNum}>{euro(btwBedrag)}</td></tr>
          <tr><td className="px-3 py-1">Totaal inclusief BTW</td><td className={tdNum}>{euro(sumX)}</td></tr>
        </tbody>
      </table>
    </section>
  );
};

const FinancieelMaandoverzichtPanel: React.FC = () => {
  const [month, setMonth] = useState(() => moment().subtract(1, "month").format("YYYY-MM"));
  const [data, setData] = useState<FinancieelMaandoverzicht | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const abort = new AbortController();
    setLoading(true);
    setError("");
    fetch("/api/reports/financieel_maandoverzicht", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ month }),
      signal: abort.signal,
    })
      .then(async (res) => {
        const json = await res.json().catch(() => null);
        if (!res.ok) throw new Error((json as { error?: string } | null)?.error ?? "Het overzicht kon niet worden geladen");
        setData(json as FinancieelMaandoverzicht);
      })
      .catch((e: unknown) => {
        if (e instanceof Error && e.name !== "AbortError") {
          setError(e.message);
          setData(null);
        }
      })
      .finally(() => {
        if (!abort.signal.aborted) setLoading(false);
      });
    return () => abort.abort();
  }, [month]);

  const periode = data
    ? `Periode ${moment(data.periodeStart).format("DD-MM-YYYY")} t/m ${moment(data.periodeEind).format("DD-MM-YYYY")}`
    : "";

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
      <div className="flex flex-wrap items-end gap-4">
        <label className="flex flex-col text-sm font-semibold text-gray-700">
          Maand
          <input
            type="month"
            value={month}
            max={moment().format("YYYY-MM")}
            onChange={(e) => e.target.value && setMonth(e.target.value)}
            className="mt-1 h-10 rounded-md border border-gray-300 px-3 font-normal"
          />
        </label>
      </div>

      {error && <div className="font-bold text-red-600">{error}</div>}
      {loading && <div className="spinner"><div className="loader"></div></div>}

      {!loading && data && (
        <div id="financieel-maandoverzicht" className="space-y-8">
          <div>
            <h3 className="text-xl font-semibold text-sky-700">
              MAANDOVERZICHT {data.scope === "gemeente" ? "GEMEENTE " : ""}{data.organisatieNaam.toUpperCase()}
            </h3>
            <div className="font-semibold">{periode}</div>
          </div>

          {data.paren.length === 0 && (
            <div className="text-gray-600">
              In deze periode zijn geen financiële transacties gevonden voor de gekoppelde partijen
              {data.scope === "gemeente" ? " (exploitanten)." : " (gemeenten met FMS-module)."}
            </div>
          )}

          {data.paren.map((p) => {
            const kop = data.scope === "gemeente" ? p.exploitantNaam.toUpperCase() : `GEMEENTE ${p.gemeenteNaam.toUpperCase()}`;
            return (
              <section key={`${p.gemeenteId}-${p.exploitantId}`} className="space-y-3">
                <h3 className="text-lg font-semibold text-sky-700">{kop} - OVERZICHT GEÏNDE INKOMSTEN</h3>
                <GeindeInkomstenTable paar={p} />
                <h3 className="text-lg font-semibold text-sky-700">{kop} - BALANS STALLINGS- EN KLUISTRANSACTIES</h3>
                <BalansTable paar={p} />
                <Noten />
              </section>
            );
          })}

          {data.scope === "exploitant" && data.paren.length > 0 && <CrowOverzicht data={data} />}
        </div>
      )}
    </div>
  );
};

export default FinancieelMaandoverzichtPanel;
