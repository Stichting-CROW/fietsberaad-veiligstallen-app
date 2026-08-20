import { useCallback, useEffect, useState } from "react";
import type {
  VSFmsMissingCoupling,
  VSFmsPermitEditorData,
  VSFmsServicePermitRow,
} from "~/types/fms-permits";

type FmsPermitsEditorResponse = {
  data?: VSFmsPermitEditorData;
  error?: string;
};

type FmsPermitsOverviewResponse = {
  data?:
    | VSFmsServicePermitRow[]
    | { permits: VSFmsServicePermitRow[]; missingCouplings: VSFmsMissingCoupling[] };
  error?: string;
};

type MutationResponse = {
  data?: VSFmsServicePermitRow | VSFmsServicePermitRow[];
  error?: string;
  legacyRefreshed?: boolean;
};

export function useFmsPermitsEditor(siteID: string) {
  const [editorData, setEditorData] = useState<VSFmsPermitEditorData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  const reload = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    if (!siteID || siteID === "1") {
      setEditorData(null);
      setIsLoading(false);
      return;
    }

    let cancelled = false;

    const load = async () => {
      try {
        setIsLoading(true);
        setError(null);
        const response = await fetch(
          `/api/protected/fms-permits?siteID=${encodeURIComponent(siteID)}`
        );
        const result: FmsPermitsEditorResponse = await response.json();
        if (!response.ok || result.error) {
          throw new Error(result.error ?? "Fout bij ophalen FMS-rechten");
        }
        if (!cancelled) {
          setEditorData(result.data ?? null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Onbekende fout");
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [siteID, version]);

  const createPermit = async (body: {
    operatorID: string;
    siteID: string;
    bikeparkID: string | null;
    permitTypes: string[];
  }): Promise<{ legacyRefreshed: boolean }> => {
    const response = await fetch("/api/protected/fms-permits", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const result: MutationResponse = await response.json();
    if (!response.ok || result.error) {
      throw new Error(result.error ?? "Fout bij aanmaken");
    }
    reload();
    return { legacyRefreshed: result.legacyRefreshed ?? false };
  };

  const updatePermit = async (
    id: number,
    permitTypes: string[]
  ): Promise<{ legacyRefreshed: boolean }> => {
    const response = await fetch(`/api/protected/fms-permits/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ permitTypes }),
    });
    const result: MutationResponse = await response.json();
    if (!response.ok || result.error) {
      throw new Error(result.error ?? "Fout bij opslaan");
    }
    reload();
    return { legacyRefreshed: result.legacyRefreshed ?? false };
  };

  const deletePermit = async (
    id: number
  ): Promise<{ legacyRefreshed: boolean }> => {
    const response = await fetch(`/api/protected/fms-permits/${id}`, {
      method: "DELETE",
    });
    const result: MutationResponse = await response.json();
    if (!response.ok || result.error) {
      throw new Error(result.error ?? "Fout bij verwijderen");
    }
    reload();
    return { legacyRefreshed: result.legacyRefreshed ?? false };
  };

  return {
    editorData,
    isLoading,
    error,
    reload,
    createPermit,
    updatePermit,
    deletePermit,
  };
}

export function useFmsPermitsOverview() {
  const [permits, setPermits] = useState<VSFmsServicePermitRow[]>([]);
  const [missingCouplings, setMissingCouplings] = useState<VSFmsMissingCoupling[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  const reload = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        setIsLoading(true);
        setError(null);
        const response = await fetch(
          "/api/protected/fms-permits?all=true&missing=true"
        );
        const result: FmsPermitsOverviewResponse = await response.json();
        if (!response.ok || result.error) {
          throw new Error(result.error ?? "Fout bij ophalen overzicht");
        }
        if (!cancelled && result.data && !Array.isArray(result.data)) {
          setPermits(result.data.permits);
          setMissingCouplings(result.data.missingCouplings);
        } else if (!cancelled && Array.isArray(result.data)) {
          setPermits(result.data);
          setMissingCouplings([]);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Onbekende fout");
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [version]);

  return {
    permits,
    missingCouplings,
    isLoading,
    error,
    reload,
  };
}
