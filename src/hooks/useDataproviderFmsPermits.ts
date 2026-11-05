import { useCallback, useEffect, useState } from "react";
import type { DataproviderFmsPermitsResponse } from "~/pages/api/protected/dataprovider/[id]/fmsservice-permits";
import type { FmsPermitRow } from "~/server/services/fms/fms-permit-service";

export function useDataproviderFmsPermits(operatorId: string | null) {
  const [permits, setPermits] = useState<FmsPermitRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  const reload = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    if (!operatorId || operatorId === "new") {
      setPermits([]);
      setError(null);
      setIsLoading(false);
      return;
    }

    let cancelled = false;

    const load = async () => {
      try {
        setIsLoading(true);
        setError(null);
        const response = await fetch(
          `/api/protected/dataprovider/${encodeURIComponent(operatorId)}/fmsservice-permits`
        );
        const result: DataproviderFmsPermitsResponse = await response.json();
        if (!response.ok || result.error) {
          throw new Error(result.error ?? "Fout bij ophalen gekoppelde stallingen");
        }
        if (!cancelled) {
          setPermits(result.data ?? []);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Onbekende fout");
          setPermits([]);
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
  }, [operatorId, version]);

  return { permits, isLoading, error, reload };
}
