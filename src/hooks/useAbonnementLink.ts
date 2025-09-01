import { useState, useEffect } from 'react';

export interface AbonnementLinkResponse {
  status: boolean;
  url: string;
}

export const useAbonnementLink = (parkingId: string) => {
  const [abonnementLink, setAbonnementLink] = useState<AbonnementLinkResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  const fetchAbonnementLink = async () => {
    try {
      setIsLoading(true);
      setError(null);

      if (!parkingId) {
        setAbonnementLink(null);
        setIsLoading(false);
        return;
      }

      const response = await fetch(`/api/protected/fietsenstallingen/abonnementlink/${parkingId}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch abonnement link');
      }

      const data: AbonnementLinkResponse = await response.json();
      setAbonnementLink(data);
    } catch (error) {
      console.error('Error fetching abonnement link:', error);
      setError(error instanceof Error ? error.message : 'Failed to fetch abonnement link');
      setAbonnementLink(null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAbonnementLink();
  }, [version, parkingId]);

  return {
    abonnementLink,
    isLoading,
    error,
    reloadAbonnementLink: () => setVersion(v => v + 1)
  };
};
