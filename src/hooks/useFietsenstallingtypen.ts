import { useState, useEffect } from 'react';
import { type VSFietsenstallingType } from '~/types/parking';

type FietsenstallingtypenResponse = {
  data?: VSFietsenstallingType[];
  error?: string;
};

export const useFietsenstallingtypen = () => {
  const [fietsenstallingtypen, setFietsenstallingtypen] = useState<VSFietsenstallingType[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  const fetchFietsenstallingtypen = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await fetch('/api/protected/fietsenstallingtypen');
      const result: FietsenstallingtypenResponse = await response.json();

      if (result.error) {
        throw new Error(result.error);
      }

      setFietsenstallingtypen(result.data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred while fetching fietsenstallingtypen');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchFietsenstallingtypen();
  }, [version]);

  return {
    fietsenstallingtypen,
    isLoading,
    error,
    reloadFietsenstallingtypen: () => setVersion(v => v + 1)
  };
}; 