import React, { useEffect, useState } from "react";
import moment from "moment";

type MaandrapportRow = {
  stallingsId: string | null;
  externalId: string | null;
  title: string | null;
  type: string | null;
  capacity: number;
  occupied: number;
  occupancyRate: number;
  created: number;
  cancelled: number;
  waiting: number;
};

type Maandrapport = {
  organisatieNaam: string;
  periodeStart: string;
  periodeEind: string;
  rows: MaandrapportRow[];
};

const soort = (type: string | null) => {
  if (type === "buurtstalling") return "Buurtstalling";
  if (type === "fietstrommel") return "Fietstrommel";
  return type ?? "";
};

const num = (n: number) => n.toLocaleString("nl-NL");

const th = "px-3 py-1 text-left font-semibold text-gray-700 border-b border-gray-400 whitespace-nowrap";
const td = "px-3 py-1 border-b border-gray-200";
const tdNum = `${td} text-right tabular-nums`;

const MaandrapportBuurtstallingenPanel: React.FC = () => {
  const [month, setMonth] = useState(() => moment().format("YYYY-MM"));
  const [data, setData] = useState<Maandrapport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const abort = new AbortController();
    setLoading(true);
    setError("");
    fetch("/api/reports/maandrapport_buurtstallingen", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ month }),
      signal: abort.signal,
    })
      .then(async (res) => {
        const json = await res.json().catch(() => null);
        if (!res.ok) throw new Error((json as { error?: string } | null)?.error ?? "Het rapport kon niet worden geladen");
        setData(json as Maandrapport);
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
        <div className="space-y-4">
          <div>
            <h3 className="text-xl font-semibold text-sky-700">
              MAANDRAPPORT BUURTSTALLINGEN {data.organisatieNaam.toUpperCase()}
            </h3>
            <div className="font-semibold">{periode}</div>
            <p className="mt-1 max-w-3xl text-sm text-gray-600">
              Bezetting telt betaalde abonnementen die in de gekozen maand liepen, tot het einde van die maand of tot nu als de maand nog loopt. Het aantal wachtenden is de wachtlijst op dit moment.
            </p>
          </div>

          {data.rows.length === 0 ? (
            <div className="text-gray-600">Geen buurtstallingen of fietstrommels voor deze organisatie.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[64rem] text-sm">
                <thead>
                  <tr>
                    <th className={th}>StallingsID FMS</th>
                    <th className={th}>StallingsID Intern</th>
                    <th className={th}>Naam stalling</th>
                    <th className={th}>Soort stalling</th>
                    <th className={`${th} text-right`}>Capaciteit</th>
                    <th className={`${th} text-right`}>Bezetting</th>
                    <th className={`${th} text-right`}>Bezettingsgraad</th>
                    <th className={`${th} text-right`}>Aantal nieuwe abonnees</th>
                    <th className={`${th} text-right`}>Aantal opzeggingen</th>
                    <th className={`${th} text-right`}>Aantal wachtenden</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((row) => (
                    <tr key={`${row.type}-${row.stallingsId}`}>
                      <td className={td}>{row.stallingsId ?? ""}</td>
                      <td className={td}>{row.externalId ?? ""}</td>
                      <td className={td}>{row.title ?? ""}</td>
                      <td className={td}>{soort(row.type)}</td>
                      <td className={tdNum}>{num(row.capacity)}</td>
                      <td className={tdNum}>{num(row.occupied)}</td>
                      <td className={tdNum}>{num(row.occupancyRate)}%</td>
                      <td className={tdNum}>{num(row.created)}</td>
                      <td className={tdNum}>{num(row.cancelled)}</td>
                      <td className={tdNum}>{num(row.waiting)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default MaandrapportBuurtstallingenPanel;
