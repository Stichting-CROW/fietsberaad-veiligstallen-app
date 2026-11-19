import { useState, useEffect } from 'react';
import { ParkingDetailsType } from '~/types/parking';

export type FietsenstallingenResponse = {
  data?: (ParkingDetailsType)[];
  error?: string;
};

const isAbortError = (err: unknown): boolean =>
  err instanceof DOMException && err.name === 'AbortError';

export const useFietsenstallingen = (GemeenteID: string) => {
  const [fietsenstallingen, setFietsenstallingen] = useState<(ParkingDetailsType)[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (GemeenteID === "") {
      setFietsenstallingen([]);
      setError(null);
      setIsLoading(false);
      return;
    }

    const controller = new AbortController();
    let cancelled = false;

    (async () => {
      try {
        setIsLoading(true);
        setError(null);
        setFietsenstallingen([]);

        const response = await fetch(
          `/api/protected/fietsenstallingen?GemeenteID=${encodeURIComponent(GemeenteID)}`,
          { signal: controller.signal },
        );
        const result: FietsenstallingenResponse = await response.json();
        if (cancelled) return;

        if (result.error) {
          throw new Error(result.error);
        }

        setFietsenstallingen(result.data || []);
      } catch (err) {
        if (cancelled || isAbortError(err)) return;
        console.error("Error in fetchFietsenstallingen:", err);
        setError(err instanceof Error ? err.message : 'An error occurred while fetching fietsenstallingen');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [GemeenteID, version]);

  return {
    fietsenstallingen,
    isLoading,
    error,
    reloadFietsenstallingen: () => setVersion(v => v + 1)
  };
};
