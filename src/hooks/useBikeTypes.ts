import { useState, useEffect, useCallback } from "react";
import type { VSFietstype } from "~/types/fietstypen";

type BikeTypesResponse = {
  data?: VSFietstype[];
  error?: string;
};

export const useBikeTypes = () => {
  const [bikeTypes, setBikeTypes] = useState<VSFietstype[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  const fetchBikeTypes = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await fetch("/api/protected/fietstypen");
      if (!response.ok) {
        throw new Error("Fout bij het ophalen van fietstypen");
      }

      const json: BikeTypesResponse = await response.json();
      if (json.error) {
        throw new Error(json.error);
      }

      setBikeTypes(json.data ?? []);
    } catch (err) {
      console.error("Error fetching bike types:", err);
      setError(
        err instanceof Error
          ? err.message
          : "Er trad een fout op bij het ophalen van fietstypen",
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBikeTypes();
  }, [fetchBikeTypes, version]);

  return {
    data: bikeTypes,
    isLoading,
    error,
    reloadBikeTypes: () => setVersion((v) => v + 1),
  };
};

