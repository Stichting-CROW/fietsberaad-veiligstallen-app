import { useState, useEffect, useCallback } from "react";
import { type SectieDetailsType, type SectiesResponse } from "~/types/secties";

export const useSectiesByFietsenstalling = (fietsenstallingId: string | null) => {
  const [secties, setSecties] = useState<SectieDetailsType[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  const fetchSecties = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      if (!fietsenstallingId) {
        setSecties([]);
        setIsLoading(false);
        return;
      }

      const apiUrl = `/api/protected/fietsenstallingen/secties/all?fietsenstallingId=${fietsenstallingId}`;
      const response = await fetch(apiUrl);
      const result: SectiesResponse = await response.json();

      if (result.error) {
        throw new Error(result.error);
      }

      setSecties(Array.isArray(result.data) ? result.data : []);
    } catch (err) {
      console.error("Error in fetchSecties:", err);
      setError(err instanceof Error ? err.message : "An error occurred while fetching sections");
    } finally {
      setIsLoading(false);
    }
  }, [fietsenstallingId]);

  useEffect(() => {
    fetchSecties();
  }, [fetchSecties, version]);

  const mutate = useCallback((newData?: SectieDetailsType[] | ((data: SectieDetailsType[]) => SectieDetailsType[])) => {
    if (typeof newData === "function") {
      setSecties(newData);
    } else if (newData !== undefined) {
      setSecties(newData);
    } else {
      // Reload
      setVersion((v) => v + 1);
    }
  }, []);

  return {
    data: secties,
    isLoading,
    error,
    mutate,
    reloadSecties: () => setVersion((v) => v + 1),
  };
};



