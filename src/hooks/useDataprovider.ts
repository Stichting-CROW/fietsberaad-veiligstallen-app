import { useState, useEffect } from 'react';
import type { VSContactDataprovider } from '~/types/contacts';

type DataproviderResponse = {
  data?: VSContactDataprovider;
  error?: string;
};

export const useDataprovider = (dataproviderID: string) => {
  const [dataprovider, setDataprovider] = useState<VSContactDataprovider | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  const fetchDataprovider = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await fetch(`/api/protected/dataprovider/${dataproviderID||false}`);
      const result: DataproviderResponse = await response.json();

      if (result.error) {
        throw new Error(result.error);
      }

      setDataprovider(result.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : `An error occurred while fetching dataprovider ${dataproviderID}`);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchDataprovider();
  }, [version]);

  return {
    dataprovider,
    isLoading,
    error,
    reloadDataprovider: () => setVersion(v => v + 1)
  };
}; 