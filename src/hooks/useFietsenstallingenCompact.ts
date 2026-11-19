import { useState, useEffect } from 'react';
import { type VSFietsenstallingLijst } from '~/types/fietsenstallingen';

export type FietsenstallingenCompactResponse = {
  data?: VSFietsenstallingLijst[];
  error?: string;
};

const isAbortError = (err: unknown): boolean =>
  err instanceof DOMException && err.name === 'AbortError';

export const useFietsenstallingenCompact = (GemeenteID: string | undefined) => {
  const [fietsenstallingen, setFietsenstallingen] = useState<(VSFietsenstallingLijst)[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    // An empty id is "not known yet" (session still hydrating), not "every site".
    // /fietsenstallingencompact without GemeenteID returns every site the user
    // can access. For a Fietsberaad admin that is every data owner, and that
    // slower response can arrive after the scoped one and replace it.
    if (!GemeenteID) {
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
          `/api/protected/fietsenstallingencompact?GemeenteID=${encodeURIComponent(GemeenteID)}`,
          { signal: controller.signal },
        );
        const result: FietsenstallingenCompactResponse = await response.json();
        if (cancelled) return;

        if (result.error) {
          throw new Error(result.error);
        }

        setFietsenstallingen(result.data || []);
      } catch (err) {
        if (cancelled || isAbortError(err)) return;
        console.error("Error in fetchFietsenstallingenCompact:", err);
        setError(err instanceof Error ? err.message : 'An error occurred while fetching fietsenstallingenCompact');
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
