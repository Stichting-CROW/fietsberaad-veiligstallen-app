import { useState, useEffect, useCallback } from 'react';
import { type VSFietsenstallingLijst } from '~/types/fietsenstallingen';
import { type FietsenstallingenCompactResponse } from '~/hooks/useFietsenstallingenCompact';

export const useAllFietsenstallingenCompact = () => {
  const [fietsenstallingen, setFietsenstallingen] = useState<VSFietsenstallingLijst[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  const fetchAllFietsenstallingenCompact = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const apiUrl = "/api/protected/fietsenstallingencompact";
      const response = await fetch(apiUrl);
      const result: FietsenstallingenCompactResponse = await response.json();

      if (result.error) {
        throw new Error(result.error);
      }

      // do not include hidden, systeemstallingen or aanmeldingen
      const filteredData = result.data?.filter(item => item.Status === "1");

      setFietsenstallingen(filteredData || []);
    } catch (err) {
      console.error("Error in fetchAllFietsenstallingenCompact:", err);
      setError(err instanceof Error ? err.message : 'An error occurred while fetching all fietsenstallingen compact');
    } finally {
      setIsLoading(false);
    }
  }, [version]);

  useEffect(() => {
    fetchAllFietsenstallingenCompact();
  }, [fetchAllFietsenstallingenCompact, version]);

  return {
    fietsenstallingen,
    isLoading,
    error,
    reloadAllFietsenstallingen: () => setVersion(v => v + 1)
  };
};
