import { useCallback, useEffect, useState } from "react";
import type { FmsPermitRow, FmsStallingOption } from "~/server/services/fms/fms-permit-service";

type FmsPermitsResponse = {
  data?: {
    permits: FmsPermitRow[];
    fmsStallings: FmsStallingOption[];
  };
  error?: string;
};

export function useGemeenteFmsPermits(gemeenteId: string | undefined) {
  const [permits, setPermits] = useState<FmsPermitRow[]>([]);
  const [fmsStallings, setFmsStallings] = useState<FmsStallingOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  const reload = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    if (!gemeenteId) {
      setPermits([]);
      setFmsStallings([]);
      setIsLoading(false);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        setIsLoading(true);
        setError(null);
        const res = await fetch(`/api/protected/gemeenten/${gemeenteId}/fmsservice-permits`);
        const json = (await res.json()) as FmsPermitsResponse;
        if (!res.ok) {
          throw new Error(json.error ?? `HTTP ${res.status}`);
        }
        if (!cancelled) {
          setPermits(json.data?.permits ?? []);
          setFmsStallings(json.data?.fmsStallings ?? []);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Kon FMS-rechten niet laden");
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [gemeenteId, version]);

  return { permits, fmsStallings, isLoading, error, reload };
}
