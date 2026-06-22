import React, { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { userHasRight } from "~/types/utils";
import { VSSecurityTopic } from "~/types/securityprofile";

type ReplayKind = "pasids" | "transacties";

type Counts = { pasids: number; transacties: number };
type ScopeOption = { id: string; name: string };

type BatchResult = {
  ok: boolean;
  kind: ReplayKind;
  processed: number;
  errors: number;
  lastId: number;
  hasMore: boolean;
  sampleErrors: string[];
  message?: string;
};

async function postReplay(body: Record<string, unknown>): Promise<any> {
  const res = await fetch("/api/protected/parking-simulation/replay-archive", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message ?? "Verzoek mislukt");
  return data;
}

const BATCH_SIZE = 500;

const ReplayArchivePage: React.FC = () => {
  const { data: session } = useSession();
  const hasAccess = userHasRight(session?.user?.securityProfile, VSSecurityTopic.fietsberaad_superadmin);

  const [source, setSource] = useState<"live" | "archive">("live");
  const [dataOwnerId, setDataOwnerId] = useState("all");
  const [stallingId, setStallingId] = useState("all");
  const [allData, setAllData] = useState(false);
  const [dateStart, setDateStart] = useState("");
  const [dateEnd, setDateEnd] = useState("");

  const [dataOwners, setDataOwners] = useState<ScopeOption[]>([]);
  const [stallings, setStallings] = useState<ScopeOption[]>([]);

  const [counts, setCounts] = useState<Counts | null>(null);
  const [counting, setCounting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ pasids: number; transacties: number; errors: number }>({
    pasids: 0,
    transacties: 0,
    errors: 0,
  });
  const cancelRef = useRef(false);

  // Load dataowners once (reuses the reporting-compare scope options endpoint).
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

  const filterBody = () => ({
    source,
    dataOwnerId,
    stallingId,
    allData,
    dateStart: dateStart || undefined,
    dateEnd: dateEnd || undefined,
  });

  // Auto-refresh the archive row count whenever the selection changes (debounced).
  // Skipped while a replay/reset is running to avoid extra load.
  useEffect(() => {
    if (!hasAccess || busy) return;
    let cancelled = false;
    setCounting(true);
    const t = setTimeout(() => {
      void (async () => {
        try {
          const res = await fetch("/api/protected/parking-simulation/replay-archive", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "count",
              source,
              dataOwnerId,
              stallingId,
              allData,
              dateStart: dateStart || undefined,
              dateEnd: dateEnd || undefined,
            }),
          });
          const data = await res.json();
          if (!cancelled && res.ok) setCounts(data.counts as Counts);
        } catch {
          /* ignore */
        } finally {
          if (!cancelled) setCounting(false);
        }
      })();
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasAccess, busy, source, dataOwnerId, stallingId, allData, dateStart, dateEnd]);

  const addLog = (line: string) => setLog((prev) => [`${new Date().toLocaleTimeString()}  ${line}`, ...prev].slice(0, 200));

  const handleCount = async () => {
    setError(null);
    setBusy(true);
    try {
      const data = await postReplay({ action: "count", ...filterBody() });
      setCounts(data.counts as Counts);
      addLog(`Telling: ${data.counts.pasids} pasids, ${data.counts.transacties} transacties (in filter).`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fout");
    } finally {
      setBusy(false);
    }
  };

  const handleReset = async () => {
    if (!confirm("Alle new_* schaduwtabellen (input queues + output) leegmaken? Productie blijft ongemoeid.")) return;
    setError(null);
    setBusy(true);
    try {
      const data = await postReplay({ action: "reset" });
      const total = Object.values(data.reset as Record<string, number>).reduce((a, b) => a + b, 0);
      addLog(`Reset klaar: ${total} rijen verwijderd uit new_* (${Object.entries(data.reset as Record<string, number>).map(([k, v]) => `${k}=${v}`).join(", ")}).`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fout");
    } finally {
      setBusy(false);
    }
  };

  const replayKind = async (kind: ReplayKind) => {
    let afterId = 0;
    let total = 0;
    let errs = 0;
    for (;;) {
      if (cancelRef.current) {
        addLog(`Replay ${kind} geannuleerd.`);
        break;
      }
      const data: BatchResult = await postReplay({
        action: "replay",
        kind,
        afterId,
        batchSize: BATCH_SIZE,
        ...filterBody(),
      });
      total += data.processed;
      errs += data.errors;
      afterId = data.lastId;
      setProgress((p) => ({ ...p, [kind]: total, errors: p.errors + data.errors }));
      if (data.sampleErrors?.length) {
        addLog(`${kind}: ${data.processed} verwerkt, ${data.errors} fouten — bv. ${data.sampleErrors[0]}`);
      }
      if (!data.hasMore) {
        addLog(`Replay ${kind} klaar: ${total} verwerkt, ${errs} fouten.`);
        break;
      }
    }
    return { total, errs };
  };

  const handleReplayAll = async () => {
    setError(null);
    setBusy(true);
    cancelRef.current = false;
    setProgress({ pasids: 0, transacties: 0, errors: 0 });
    try {
      addLog("Start replay → new_wachtrij_* (pasids eerst, dan transacties)...");
      await replayKind("pasids");
      if (!cancelRef.current) await replayKind("transacties");
      addLog("Klaar. Draai nu de wachtrij-processor (process-queue) en vergelijk via Rapportage vergelijking.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fout");
    } finally {
      setBusy(false);
    }
  };

  const handleCancel = () => {
    cancelRef.current = true;
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

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <h1 className="text-3xl font-bold text-gray-900 mb-2">Wachtrij replay → new_*</h1>
      <p className="text-sm text-gray-600 mb-4">
        Herhaalt wachtrij-data via de FMS write-API service naar de parallelle
        schaduw-invoerqueues (<code>new_wachtrij_*</code>). Bron: de live wachtrij
        (<code>wachtrij_*</code>) of het archief-snapshot (<code>wachtrij_*_archive20240915</code>).
        De bron­tabellen worden <strong>niet</strong> aangeraakt.
      </p>
      <div className="bg-blue-50 border border-blue-200 rounded p-3 text-sm text-blue-900 mb-6">
        Werkwijze: <strong>1.</strong> (optioneel) Reset new_* &nbsp;→&nbsp; <strong>2.</strong> Replay
        &nbsp;→&nbsp; <strong>3.</strong> Draai de{" "}
        <Link href="/beheer/parking-simulation" className="text-blue-700 underline">
          wachtrij-processor
        </Link>{" "}
        (process-queue) &nbsp;→&nbsp; <strong>4.</strong> Vergelijk via{" "}
        <Link href="/test/reporting-compare" className="text-blue-700 underline">
          Rapportage vergelijking
        </Link>
        .
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">Bron</label>
          <select
            value={source}
            onChange={(e) => setSource(e.target.value as "live" | "archive")}
            className="w-full p-2 border rounded md:w-1/2"
          >
            <option value="live">Live wachtrij (wachtrij_*)</option>
            <option value="archive">Archief snapshot (wachtrij_*_archive20240915)</option>
          </select>
        </div>
        <div>
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
        <div>
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
          <label className="block text-sm font-medium text-gray-700 mb-1">Vanaf datum (optioneel)</label>
          <input
            type="date"
            value={dateStart}
            onChange={(e) => setDateStart(e.target.value)}
            disabled={allData}
            className="w-full p-2 border rounded disabled:bg-gray-100 disabled:text-gray-400"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Tot datum, excl. (optioneel)</label>
          <input
            type="date"
            value={dateEnd}
            onChange={(e) => setDateEnd(e.target.value)}
            disabled={allData}
            className="w-full p-2 border rounded disabled:bg-gray-100 disabled:text-gray-400"
          />
        </div>
        <div className="md:col-span-2">
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
      </div>

      <div className="flex flex-wrap gap-3 mb-6">
        <button onClick={() => void handleCount()} disabled={busy} className="px-4 py-2 bg-gray-700 text-white rounded hover:bg-gray-800 disabled:opacity-50">
          Tel archiefrijen
        </button>
        <button onClick={() => void handleReset()} disabled={busy} className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50">
          Reset new_*
        </button>
        <button onClick={() => void handleReplayAll()} disabled={busy} className="px-4 py-2 bg-emerald-600 text-white rounded hover:bg-emerald-700 disabled:opacity-50">
          {busy ? "Bezig..." : "Replay → new_*"}
        </button>
        {busy && (
          <button onClick={handleCancel} className="px-4 py-2 border border-gray-400 text-gray-700 rounded hover:bg-gray-100">
            Annuleren
          </button>
        )}
      </div>

      <div className="mb-4 rounded border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-800">
        <span className="font-medium">Wordt gerepliceerd met huidige selectie: </span>
        {counting && !counts ? (
          <span className="text-gray-500">tellen…</span>
        ) : counts ? (
          <span className={counting ? "opacity-60" : ""}>
            <strong>{(counts.pasids + counts.transacties).toLocaleString("nl-NL")}</strong> rijen
            {" "}(<strong>{counts.pasids.toLocaleString("nl-NL")}</strong> pasids +{" "}
            <strong>{counts.transacties.toLocaleString("nl-NL")}</strong> transacties)
            {counting && <span className="ml-2 text-gray-500">bijwerken…</span>}
          </span>
        ) : (
          <span className="text-gray-500">—</span>
        )}
      </div>

      {(progress.pasids > 0 || progress.transacties > 0 || progress.errors > 0) && (
        <div className="mb-4 text-sm text-gray-800">
          Voortgang: pasids <strong>{progress.pasids}</strong>, transacties <strong>{progress.transacties}</strong>
          {progress.errors > 0 && <span className="text-red-700"> — {progress.errors} fouten</span>}.
        </div>
      )}

      {error && <div className="mb-4 bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">{error}</div>}

      {log.length > 0 && (
        <div className="border rounded bg-gray-50 p-3 max-h-96 overflow-auto text-xs font-mono whitespace-pre-wrap">
          {log.map((l, i) => (
            <div key={i}>{l}</div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ReplayArchivePage;
