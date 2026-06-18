import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { userHasRight } from "~/types/utils";
import { VSSecurityTopic } from "~/types/securityprofile";

type ReportCompareType = "transacties" | "ruwedata" | "bezetting";
type CompareRowStatus = "identical" | "diff" | "old_only" | "new_only";

type ScopeOption = { id: string; name: string };

type MetricMap = Record<string, number>;
type CompareRow = {
  key: string;
  label: string;
  old: MetricMap | null;
  new: MetricMap | null;
  status: CompareRowStatus;
  diffFields: string[];
};
type CompareResult = {
  reportType: ReportCompareType;
  scopeLabel: string;
  dateStart: string;
  dateEnd: string;
  allData: boolean;
  source?: string;
  oldTable: string;
  newTable: string;
  metrics: string[];
  rows: CompareRow[];
  summary: { total: number; identical: number; diff: number; old_only: number; new_only: number };
  warnings: string[];
};

const REPORT_LABELS: Record<ReportCompareType, string> = {
  transacties: "Rapportage transacties (dagelijks)",
  ruwedata: "Rapportage ruwe data (dagelijks)",
  bezetting: "Rapportage bezetting (wekelijks)",
};

/** Files most likely responsible for each report type's new-side data. Used in the AI fix prompt. */
const RESPONSIBLE_FILES: Record<ReportCompareType, string[]> = {
  transacties: [
    "src/server/services/queue/processor.ts",
    "src/server/services/queue/transaction-service.ts",
  ],
  ruwedata: [
    "src/server/services/queue/processor.ts",
    "src/server/services/queue/transaction-service.ts",
  ],
  bezetting: ["src/server/services/bezettingsdata/update-bezettingsdata-service.ts"],
};

function todayPlus(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

const STATUS_LABEL: Record<CompareRowStatus, string> = {
  identical: "Identiek",
  diff: "Verschilt",
  old_only: "Alleen oud (CF)",
  new_only: "Alleen nieuw",
};

const STATUS_BG: Record<CompareRowStatus, string> = {
  identical: "bg-green-50",
  diff: "bg-red-50",
  old_only: "bg-amber-50",
  new_only: "bg-amber-50",
};

function fmtMetric(v: number | undefined): string {
  if (v === undefined) return "—";
  return Number.isInteger(v) ? String(v) : v.toFixed(2);
}

function buildFixPrompt(result: CompareResult, rows: CompareRow[]): string {
  const files = RESPONSIBLE_FILES[result.reportType];
  const lines: (string | null)[] = [
    "The new Next.js data pipeline produces shadow tables (new_*) that must match the data the old ColdFusion processor produces in the production tables, so the two can be compared 1-on-1.",
    `Report: ${REPORT_LABELS[result.reportType]}`,
    `Old (ColdFusion) table: ${result.oldTable}    New (Next.js) table: ${result.newTable}`,
    result.source ? `Bezettingsdata source: ${result.source}` : null,
    `Period: ${result.allData ? "ALL DATA (no date range)" : `${result.dateStart} .. ${result.dateEnd} (end exclusive)`}, scope: ${result.scopeLabel}`,
    `Metrics compared per key: ${result.metrics.join(", ")}`,
    "",
    "Fix the new-side processing so the metrics for each comparison key match the old side. Each row below is keyed by a natural key (stalling/section + period). Statuses: 'diff' = present on both sides but metric mismatch; 'old_only' = the new pipeline did not produce this key; 'new_only' = the new pipeline produced an extra key.",
    `Likely files to inspect: ${files.join(", ")}.`,
    "Do not change the old ColdFusion behaviour; only adjust the new pipeline to reach parity. Investigate the root cause (e.g. missing in/out matching, occupation running-total, checkin/checkout type mapping) rather than special-casing.",
    "",
    "Differences:",
  ];

  const max = 60;
  const shown = rows.slice(0, max);
  for (const r of shown) {
    const oldStr = r.old ? result.metrics.map((m) => `${m}=${fmtMetric(r.old![m])}`).join(" ") : "(ontbreekt)";
    const newStr = r.new ? result.metrics.map((m) => `${m}=${fmtMetric(r.new![m])}`).join(" ") : "(ontbreekt)";
    lines.push(
      `- [${STATUS_LABEL[r.status]}] ${r.label}` +
        (r.diffFields.length ? ` (verschilt op: ${r.diffFields.join(", ")})` : "") +
        `\n    oud: ${oldStr}\n    nieuw: ${newStr}`
    );
  }
  if (rows.length > max) lines.push(`... en nog ${rows.length - max} rijen (ingekort).`);

  return lines.filter((l): l is string => l != null).join("\n");
}

const ReportingComparePage: React.FC = () => {
  const { data: session } = useSession();
  const hasAccess = userHasRight(session?.user?.securityProfile, VSSecurityTopic.fietsberaad_superadmin);

  const [reportType, setReportType] = useState<ReportCompareType>("transacties");
  const [dataOwnerId, setDataOwnerId] = useState("all");
  const [stallingId, setStallingId] = useState("all");
  const [allData, setAllData] = useState(false);
  const [source, setSource] = useState("FMS");
  const [dateStart, setDateStart] = useState(todayPlus(-30));
  const [dateEnd, setDateEnd] = useState(todayPlus(1));
  const [showOnlyDifferences, setShowOnlyDifferences] = useState(true);

  const [dataOwners, setDataOwners] = useState<ScopeOption[]>([]);
  const [stallings, setStallings] = useState<ScopeOption[]>([]);

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CompareResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Load the list of dataowners once.
  useEffect(() => {
    if (!hasAccess) return;
    void (async () => {
      try {
        const res = await fetch("/api/protected/reporting-compare/scope-options");
        if (!res.ok) return;
        const data = await res.json();
        setDataOwners((data.dataOwners ?? []) as ScopeOption[]);
      } catch {
        /* ignore */
      }
    })();
  }, [hasAccess]);

  // Load stallingen whenever the selected dataowner changes.
  useEffect(() => {
    setStallingId("all");
    if (!hasAccess || dataOwnerId === "all") {
      setStallings([]);
      return;
    }
    void (async () => {
      try {
        const res = await fetch(`/api/protected/reporting-compare/scope-options?dataOwnerId=${encodeURIComponent(dataOwnerId)}`);
        if (!res.ok) return;
        const data = await res.json();
        setStallings((data.stallings ?? []) as ScopeOption[]);
      } catch {
        /* ignore */
      }
    })();
  }, [dataOwnerId, hasAccess]);

  const handleCompare = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/protected/reporting-compare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reportType, dateStart, dateEnd, allData, dataOwnerId, stallingId, source }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? "Verzoek mislukt");
      setResult(data as CompareResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fout");
    } finally {
      setLoading(false);
    }
  };

  const visibleRows = (result?.rows ?? []).filter(
    (r) => !showOnlyDifferences || r.status !== "identical"
  );

  const handleCopyAllDiffs = () => {
    if (!result) return;
    const diffRows = result.rows.filter((r) => r.status !== "identical");
    void navigator.clipboard.writeText(buildFixPrompt(result, diffRows));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleCopyRow = (row: CompareRow) => {
    if (!result) return;
    void navigator.clipboard.writeText(buildFixPrompt(result, [row]));
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

  if (!hasAccess) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="bg-red-50 border border-red-300 rounded-lg p-6 max-w-2xl mx-auto">
          <h3 className="text-lg font-medium text-red-800 mb-2">Geen toegang</h3>
          <p className="text-sm text-red-700">Alleen fietsberaad superadmins hebben toegang tot deze pagina.</p>
        </div>
      </div>
    );
  }

  const metrics = result?.metrics ?? [];

  return (
    <div className="container mx-auto px-4 py-8 max-w-full">
      <h1 className="text-3xl font-bold text-gray-900 mb-2">Rapportage vergelijking</h1>
      <p className="text-sm text-gray-600 mb-6">
        1-op-1 vergelijking van rapportages tussen de oude ColdFusion-data (productietabellen) en de
        nieuwe Next.js-data (<code>new_*</code> schaduwtabellen). Zie ook{" "}
        <Link href="/test/fms-api-compare" className="text-blue-600 hover:underline">
          FMS API vergelijking
        </Link>
        .
      </p>

      {/* Controls */}
      <div className="grid grid-cols-1 md:grid-cols-6 gap-4 mb-4 items-end">
        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">Rapportage</label>
          <select
            value={reportType}
            onChange={(e) => setReportType(e.target.value as ReportCompareType)}
            className="w-full p-2 border rounded"
          >
            {(Object.keys(REPORT_LABELS) as ReportCompareType[]).map((t) => (
              <option key={t} value={t}>
                {REPORT_LABELS[t]}
              </option>
            ))}
          </select>
        </div>
        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">Dataeigenaar</label>
          <select
            value={dataOwnerId}
            onChange={(e) => setDataOwnerId(e.target.value)}
            className="w-full p-2 border rounded"
          >
            <option value="all">Alle dataeigenaren</option>
            {dataOwners.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </div>
        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">Fietsenstalling</label>
          <select
            value={stallingId}
            onChange={(e) => setStallingId(e.target.value)}
            disabled={dataOwnerId === "all"}
            className="w-full p-2 border rounded disabled:bg-gray-100 disabled:text-gray-400"
          >
            <option value="all">Alle stallingen</option>
            {stallings.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Vanaf</label>
          <input
            type="date"
            value={dateStart}
            onChange={(e) => setDateStart(e.target.value)}
            disabled={allData}
            className="w-full p-2 border rounded disabled:bg-gray-100 disabled:text-gray-400"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Tot (excl.)</label>
          <input
            type="date"
            value={dateEnd}
            onChange={(e) => setDateEnd(e.target.value)}
            disabled={allData}
            className="w-full p-2 border rounded disabled:bg-gray-100 disabled:text-gray-400"
          />
        </div>
        <div className="flex items-center h-full pb-2">
          <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-700">
            <input
              type="checkbox"
              checked={allData}
              onChange={(e) => setAllData(e.target.checked)}
              className="rounded border-gray-300"
            />
            Alle data (geen datumbereik)
          </label>
        </div>
        {reportType === "bezetting" && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Source</label>
            <select
              value={source}
              onChange={(e) => setSource(e.target.value)}
              className="w-full p-2 border rounded"
            >
              <option value="FMS">FMS</option>
              <option value="Lumiguide">Lumiguide</option>
            </select>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-4 mb-6">
        <button
          onClick={() => void handleCompare()}
          disabled={loading}
          className="px-4 py-2 bg-emerald-600 text-white rounded hover:bg-emerald-700 disabled:opacity-50"
        >
          {loading ? "Bezig..." : "Vergelijk"}
        </button>
        <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-700">
          <input
            type="checkbox"
            checked={showOnlyDifferences}
            onChange={(e) => setShowOnlyDifferences(e.target.checked)}
            className="rounded border-gray-300"
          />
          Alleen verschillen tonen
        </label>
        {result && result.summary.diff + result.summary.old_only + result.summary.new_only > 0 && (
          <button
            onClick={handleCopyAllDiffs}
            className="px-4 py-2 border border-blue-600 text-blue-600 rounded hover:bg-blue-50"
          >
            {copied ? "Gekopieerd!" : "Kopieer AI-fix prompt (alle verschillen)"}
          </button>
        )}
      </div>

      {error && (
        <div className="mb-4 bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">{error}</div>
      )}

      {result?.warnings?.map((w, i) => (
        <div key={i} className="mb-2 bg-yellow-50 border border-yellow-300 text-yellow-800 px-4 py-2 rounded text-sm">
          {w}
        </div>
      ))}

      {result && (
        <div className="mb-3 text-sm text-gray-700">
          <strong>{result.summary.total}</strong> sleutels: {result.summary.identical} identiek,{" "}
          <span className="text-red-700">{result.summary.diff} verschillend</span>,{" "}
          <span className="text-amber-700">{result.summary.old_only} alleen oud</span>,{" "}
          <span className="text-amber-700">{result.summary.new_only} alleen nieuw</span>. Tabellen:{" "}
          <code>{result.oldTable}</code> vs <code>{result.newTable}</code>. Selectie:{" "}
          <strong>{result.scopeLabel}</strong>,{" "}
          {result.allData ? "alle data" : `${result.dateStart} t/m ${result.dateEnd} (excl.)`}.
        </div>
      )}

      {result && (
        <div className="w-full border rounded overflow-auto max-h-[calc(100vh-22rem)]">
          <table className="w-full text-sm table-auto">
            <thead className="bg-gray-100 sticky top-0">
              <tr>
                <th className="text-left p-2 font-medium">Status</th>
                <th className="text-left p-2 font-medium">Sleutel</th>
                {metrics.map((m) => (
                  <th key={m} className="text-right p-2 font-medium">
                    {m} (oud / nieuw)
                  </th>
                ))}
                <th className="p-2"></th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((r) => (
                <tr key={r.key} className={`border-t ${STATUS_BG[r.status]}`}>
                  <td className="p-2 whitespace-nowrap">{STATUS_LABEL[r.status]}</td>
                  <td className="p-2">{r.label}</td>
                  {metrics.map((m) => {
                    const isDiff = r.diffFields.includes(m);
                    return (
                      <td
                        key={m}
                        className={`p-2 text-right whitespace-nowrap ${isDiff ? "font-bold text-red-700" : ""}`}
                      >
                        {fmtMetric(r.old?.[m])} / {fmtMetric(r.new?.[m])}
                      </td>
                    );
                  })}
                  <td className="p-2 text-right">
                    {r.status !== "identical" && (
                      <button
                        onClick={() => handleCopyRow(r)}
                        title="Kopieer AI-fix prompt voor deze rij"
                        className="text-blue-600 hover:underline text-xs"
                      >
                        AI-fix
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {visibleRows.length === 0 && (
                <tr>
                  <td colSpan={metrics.length + 3} className="p-4 text-center text-gray-500">
                    {showOnlyDifferences ? "Geen verschillen gevonden." : "Geen data."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default ReportingComparePage;
