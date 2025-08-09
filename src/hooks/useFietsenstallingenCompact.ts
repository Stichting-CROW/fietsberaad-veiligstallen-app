import { useState, useEffect, useCallback } from 'react';
// import { type ReportBikepark } from '~/components/beheer/reports/ReportsFilter';
import { type VSFietsenstallingLijst } from '~/types/fietsenstallingen';

export type FietsenstallingenCompactResponse = {
  data?: VSFietsenstallingLijst[];
  error?: string;
};

export const useFietsenstallingenCompact = (GemeenteID: string | undefined) => {
  const [fietsenstallingen, setFietsenstallingen] = useState<(VSFietsenstallingLijst)[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  const fetchFietsenstallingen = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const apiUrl = "/api/protected/fietsenstallingencompact?" + ((GemeenteID && GemeenteID!=="") ? `GemeenteID=${GemeenteID}&` : "");
      const response = await fetch(apiUrl);
      const result: FietsenstallingenCompactResponse = await response.json();

      if (result.error) {
        throw new Error(result.error);
      }

      setFietsenstallingen(result.data || []);
    } catch (err) {
      console.error("Error in fetchFietsenstallingen:", err);
      setError(err instanceof Error ? err.message : 'An error occurred while fetching fietsenstallingen');
    } finally {
      setIsLoading(false);
    }
  }, [GemeenteID]);

  useEffect(() => {
    fetchFietsenstallingen();
  }, [fetchFietsenstallingen, version]);

  return {
    fietsenstallingen,
    isLoading,
    error,
    reloadFietsenstallingen: () => setVersion(v => v + 1)
  };
}; 