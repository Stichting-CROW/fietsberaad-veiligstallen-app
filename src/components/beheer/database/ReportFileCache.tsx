import React, { useCallback, useEffect, useState } from "react";

type ReportFileCacheStatus = {
  status: "missing" | "available" | "error";
  size: number;
  fileCount: number;
  firstUpdate: Date | string | null;
  lastUpdate: Date | string | null;
  baseDir: string;
};

type ReportFileCacheResult = {
  success: boolean;
  message: string;
  status?: ReportFileCacheStatus;
  deleted?: number;
  errors?: number;
};

const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
};

const formatDate = (value: Date | string | null | undefined): string => {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("nl-NL");
};

/**
 * Admin controls for the on-demand gzip CSV export cache on disk.
 * Only files that were actually downloaded are stored; unused ones expire
 * after ≈ 3 months (REPORT_CACHE_MAX_AGE_DAYS).
 */
const ReportFileCacheComponent: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<ReportFileCacheStatus | undefined>();

  const postAction = useCallback(async (action: "status" | "clear" | "expire") => {
    setLoading(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/protected/database/reportfilecache", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ databaseParams: { action } }),
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const result = (await response.json()) as ReportFileCacheResult;
      if (!result.success) {
        setError(result.message || "Actie mislukt");
      } else {
        setMessage(result.message);
      }
      if (result.status) setStatus(result.status);
    } catch (err) {
      console.error(err);
      setError("CSV-bestandscache actie mislukt");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void postAction("status");
  }, [postAction]);

  return (
    <div className="mb-8 rounded border border-gray-200 p-4">
      <h2 className="mb-2 text-xl font-semibold">CSV export bestandscache</h2>
      <p className="mb-3 text-sm text-gray-600">
        Gzip-bestanden van downloads die daadwerkelijk zijn aangevraagd. Lopend
        jaar/maand wordt altijd opnieuw gegenereerd. Ongebruikte bestanden
        verdwijnen na ongeveer 3 maanden.
      </p>

      {status && (
        <div className="mb-3 text-sm">
          <div>
            Status: <strong>{status.status}</strong> — {status.fileCount} bestand
            {status.fileCount === 1 ? "" : "en"}, {formatBytes(status.size)}
          </div>
          <div>Map: {status.baseDir}</div>
          <div>
            Oudste / nieuwste: {formatDate(status.firstUpdate)} /{" "}
            {formatDate(status.lastUpdate)}
          </div>
        </div>
      )}

      {error && <div className="mb-2 text-sm text-red-600">{error}</div>}
      {message && !error && <div className="mb-2 text-sm text-green-700">{message}</div>}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="rounded bg-gray-700 px-3 py-1 text-sm text-white disabled:opacity-50"
          disabled={loading}
          onClick={() => void postAction("status")}
        >
          Status vernieuwen
        </button>
        <button
          type="button"
          className="rounded bg-amber-600 px-3 py-1 text-sm text-white disabled:opacity-50"
          disabled={loading}
          onClick={() => void postAction("expire")}
        >
          Verwijder &gt; 3 maanden ongebruikt
        </button>
        <button
          type="button"
          className="rounded bg-red-700 px-3 py-1 text-sm text-white disabled:opacity-50"
          disabled={loading}
          onClick={() => {
            if (window.confirm("Hele CSV-bestandscache legen?")) {
              void postAction("clear");
            }
          }}
        >
          Alles legen
        </button>
      </div>
    </div>
  );
};

export default ReportFileCacheComponent;
