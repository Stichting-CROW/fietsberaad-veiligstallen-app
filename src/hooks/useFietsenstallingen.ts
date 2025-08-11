import { useState, useEffect, useCallback } from 'react';
import { ParkingDetailsType } from '~/types/parking';

export type FietsenstallingenResponse = {
  data?: (ParkingDetailsType)[];
  error?: string;
};

export const useFietsenstallingen = (GemeenteID: string) => {
  const [fietsenstallingen, setFietsenstallingen] = useState<(ParkingDetailsType)[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  const fetchFietsenstallingen = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      if(GemeenteID==="") {
        console.log("fetchFietsenstallingen", GemeenteID, "=> no GemeenteID");
        setFietsenstallingen([]);
        return;
      }


      const apiUrl = `/api/protected/fietsenstallingen?GemeenteID=${GemeenteID}`
      const response = await fetch(apiUrl);
      const result: FietsenstallingenResponse = await response.json();

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
  }, [GemeenteID, version]);

  useEffect(() => {
    // console.log("useEffect fetchFietsenstallingen", GemeenteID);
    fetchFietsenstallingen();
  }, [fetchFietsenstallingen, version, GemeenteID]);

  return {
    fietsenstallingen,
    isLoading,
    error,
    reloadFietsenstallingen: () => setVersion(v => v + 1)
  };
}; 