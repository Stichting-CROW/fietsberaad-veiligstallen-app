import { useState, useEffect, useCallback } from 'react';
import { ParkingDetailsType } from '~/types/parking';
import { FietsenstallingenResponse } from '~/hooks/useFietsenstallingen';

export const useAllFietsenstallingen = () => {
  const [fietsenstallingen, setFietsenstallingen] = useState<(ParkingDetailsType)[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  const fetchAllFietsenstallingen = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const apiUrl = "/api/protected/fietsenstallingen"
      const response = await fetch(apiUrl);
      const result: FietsenstallingenResponse = await response.json();

      if (result.error) {
        throw new Error(result.error);
      }

      let filteredData: ParkingDetailsType[] | undefined = result.data?.filter(item => item.Status === "1");

      setFietsenstallingen(filteredData || []);
    } catch (err) {
      console.error("Error in fetchAllFietsenstallingen:", err);
      setError(err instanceof Error ? err.message : 'An error occurred while fetching all fietsenstallingen');
    } finally {
      setIsLoading(false);
    }
  }, [version]);

  useEffect(() => {
    fetchAllFietsenstallingen();
  }, [fetchAllFietsenstallingen, version]);

  return {
    fietsenstallingen,
    isLoading,
    error,
    reloadAllFietsenstallingen: () => setVersion(v => v + 1)
  };
}; 