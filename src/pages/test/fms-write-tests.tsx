import React, { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { userHasRight } from "~/types/utils";
import { VSSecurityTopic } from "~/types/securityprofile";
import FietsberaadSuperadminAccessDenied from "~/components/beheer/common/FietsberaadSuperadminAccessDenied";

type ScenarioInfo = {
  id: string;
  label: string;
  description: string;
  writeMethods: string[];
};

type AssertionResult = {
  label: string;
  ok: boolean;
  expected: string;
  actual: string;
};

type ScenarioRunResult = {
  id: string;
  label: string;
  description: string;
  writeMethods: string[];
  ok: boolean;
  durationMs: number;
  assertions: AssertionResult[];
  error?: string;
  teardownError?: string;
};

type RunResponse = {
  ok: boolean;
  message?: string;
  tier?: string;
  scope?: { siteID: string; bikeparkID: string; sectionID: string; stallingLabel: string };
  results?: ScenarioRunResult[];
  passed?: number;
  failed?: number;
};

type Tier = "A" | "B" | "C";

const TIER_META: Record<
  Tier,
  { title: string; intro: string; listUrl: string; runUrl: string; aiHint: string; body?: Record<string, string> }
> = {
  A: {
    title: "Tier A — queue processor golden tests",
    intro:
      "Gedragstests via wachtrij-service (new_wachtrij_*) → processQueues → productietabellen (testgemeente). Prefix WTEST_.",
    listUrl: "/api/protected/fms-write-tests",
    runUrl: "/api/protected/fms-write-tests",
    aiHint: "Scenario speelt af via wachtrij-service (new_wachtrij_*) → processQueues → productietabellen.",
  },
  B: {
    title: "Tier B — HTTP ingress write tests",
    intro:
      "Roept echte /api/fms/v4 routes aan met Basic Auth (FMS_TEST_*). Writes gaan naar new_wachtrij_* / new_bezettingsdata_tmp en daarna productietabellen (testgemeente). Prefix WTEST_API_. Vereist ENABLE_WRITE_API=true.",
    listUrl: "/api/protected/fms-api-write-tests",
    runUrl: "/api/protected/fms-api-write-tests",
    aiHint: "Scenario roept HTTP FMS-endpoints aan en controleert wachtrij- of DB-side-effect.",
  },
  C: {
    title: "Write sequences — teststalling",
    intro:
      "Multi-step HTTP sequences on the teststalling (testgemeente 9933): bike visit, inventory sync, sync-only, Lumiguide, saldo, and 410 negatives. Example flows were derived from Utrecht Vredenburg CF wachtrij patterns, mapped to v4 twins. POST v4 → new_wachtrij_* / new_bezettingsdata_tmp → processQueues → production tables. Prefix WTEST_API_. Requires ENABLE_WRITE_API=true.",
    listUrl: "/api/protected/fms-api-write-tests?suite=sequences",
    runUrl: "/api/protected/fms-api-write-tests",
    body: { suite: "sequences" },
    aiHint:
      "Write sequence on teststalling: HTTP FMS write → queue row → processQueues / Lumiguide rollup → production table. Investigate write service, processor, or occupation rollup.",
  },
};

const FmsWriteTestsPage: React.FC = () => {
  const { data: session } = useSession();
  const hasAccess = userHasRight(
    session?.user?.securityProfile,
    VSSecurityTopic.fietsberaad_superadmin
  );

  const [tier, setTier] = useState<Tier>("A");
  const [scenarios, setScenarios] = useState<ScenarioInfo[]>([]);
  const [results, setResults] = useState<Record<string, ScenarioRunResult>>({});
  const [scope, setScope] = useState<RunResponse["scope"] | null>(null);
  const [running, setRunning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!hasAccess) return;
    setScenarios([]);
    setResults({});
    setScope(null);
    setError(null);
    fetch(TIER_META[tier].listUrl)
      .then((r) => r.json())
      .then((d: RunResponse & { scenarios?: ScenarioInfo[] }) => {
        setScenarios(d.scenarios ?? []);
      })
      .catch(() => setError("Kon scenario's niet laden"));
  }, [hasAccess, tier]);

  const run = async (scenarioId?: string) => {
    setRunning(scenarioId ?? "__all__");
    setError(null);
    try {
      const resp = await fetch(TIER_META[tier].runUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(TIER_META[tier].body ?? {}),
          ...(scenarioId ? { scenarioId } : {}),
        }),
      });
      const data = (await resp.json()) as RunResponse;
      if (!resp.ok || !data.ok) {
        setError(data.message ?? `Fout (${resp.status})`);
        return;
      }
      if (data.scope) setScope(data.scope);
      setResults((prev) => {
        const next = { ...prev };
        for (const r of data.results ?? []) next[r.id] = r;
        return next;
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(null);
    }
  };

  const aiPrompt = (r: ScenarioRunResult): string => {
    const failed = r.assertions.filter((a) => !a.ok);
    return [
      `Schrijftest "${r.label}" (id: ${r.id}, tier ${tier}) faalt.`,
      r.error ? `Fout: ${r.error}` : "",
      failed.length
        ? "Gefaalde asserties:\n" +
          failed.map((a) => `- ${a.label}: verwacht "${a.expected}", kreeg "${a.actual}"`).join("\n")
        : "",
      TIER_META[tier].aiHint,
      `Onderzoek de write/processor/API-code en stel een fix voor.`,
    ]
      .filter(Boolean)
      .join("\n");
  };

  if (!session) {
    return (
      <div className="container mx-auto px-4 py-8">
        <p className="text-yellow-700">U moet ingelogd zijn om deze pagina te bekijken.</p>
      </div>
    );
  }
  if (!hasAccess) {
    return <FietsberaadSuperadminAccessDenied />;
  }

  const allRun = running === "__all__";
  const meta = TIER_META[tier];

  return (
    <div className="container mx-auto px-4 py-8 max-w-5xl">
      <h1 className="text-3xl font-bold text-gray-900 mb-2">FMS schrijf-tests</h1>

      <div className="flex gap-2 mb-4">
        {(["A", "B", "C"] as Tier[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTier(t)}
            className={`px-4 py-2 rounded text-sm font-medium ${
              tier === t
                ? "bg-blue-600 text-white"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            {t === "C" ? "Sequences" : `Tier ${t}`}
          </button>
        ))}
      </div>

      <h2 className="text-lg font-semibold text-gray-800 mb-2">{meta.title}</h2>
      <p className="text-sm text-gray-600 mb-4">{meta.intro}</p>

      {scope && (
        <div className="bg-gray-50 border border-gray-200 rounded p-3 mb-4 text-sm text-gray-700">
          Scope: stalling <strong>{scope.stallingLabel}</strong> (bikeparkID{" "}
          <code>{scope.bikeparkID}</code>, sectie <code>{scope.sectionID}</code>)
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-300 text-red-700 rounded p-3 mb-4 text-sm">
          {error}
        </div>
      )}

      <div className="mb-4">
        <button
          onClick={() => run()}
          disabled={running !== null}
          className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium py-2 px-5 rounded"
        >
          {allRun ? "Bezig…" : "Alle tests uitvoeren"}
        </button>
      </div>

      <div className="space-y-4">
        {scenarios.map((s) => {
          const r = results[s.id];
          const isRunning = running === s.id || allRun;
          return (
            <div
              key={s.id}
              className={`border rounded-lg p-4 ${
                r ? (r.ok ? "border-green-300 bg-green-50" : "border-red-300 bg-red-50") : "border-gray-200"
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    {r && (
                      <span className={`text-lg ${r.ok ? "text-green-600" : "text-red-600"}`}>
                        {r.ok ? "✓" : "✗"}
                      </span>
                    )}
                    <h2 className="font-semibold text-gray-900">{s.label}</h2>
                  </div>
                  <p className="text-sm text-gray-600 mt-1">{s.description}</p>
                  <p className="text-xs text-gray-400 mt-1">{s.writeMethods.join(", ")}</p>
                </div>
                <button
                  onClick={() => run(s.id)}
                  disabled={running !== null}
                  className="shrink-0 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm py-1.5 px-4 rounded"
                >
                  {isRunning ? "…" : "Run"}
                </button>
              </div>

              {r && (
                <div className="mt-3">
                  {r.error && (
                    <div className="text-sm text-red-700 mb-2">Fout: {r.error}</div>
                  )}
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr className="text-left text-gray-500">
                        <th className="py-1 pr-3 font-medium"></th>
                        <th className="py-1 pr-3 font-medium">Controle</th>
                        <th className="py-1 pr-3 font-medium">Verwacht</th>
                        <th className="py-1 font-medium">Werkelijk</th>
                      </tr>
                    </thead>
                    <tbody>
                      {r.assertions.map((a, i) => (
                        <tr key={i} className="border-t border-gray-200">
                          <td className="py-1 pr-3">
                            <span className={a.ok ? "text-green-600" : "text-red-600"}>
                              {a.ok ? "✓" : "✗"}
                            </span>
                          </td>
                          <td className="py-1 pr-3 text-gray-800">{a.label}</td>
                          <td className="py-1 pr-3 text-gray-600">{a.expected}</td>
                          <td className={`py-1 ${a.ok ? "text-gray-600" : "text-red-700 font-medium"}`}>
                            {a.actual}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="text-xs text-gray-400 mt-2">{r.durationMs} ms</div>
                  {r.teardownError && (
                    <div className="text-xs text-orange-600 mt-1">
                      Opruimen gaf een fout: {r.teardownError}
                    </div>
                  )}
                  {!r.ok && (
                    <details className="mt-2">
                      <summary className="text-xs text-blue-600 cursor-pointer">
                        AI-fix prompt
                      </summary>
                      <pre className="mt-1 text-xs bg-white border border-gray-200 rounded p-2 whitespace-pre-wrap">
                        {aiPrompt(r)}
                      </pre>
                    </details>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default FmsWriteTestsPage;
