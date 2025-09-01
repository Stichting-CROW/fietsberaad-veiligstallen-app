import { useState, useEffect } from 'react';
import { type AbonnementsvormenType } from '~/types/parking';

export const useSubscriptionTypesForParking = (parkingId: string) => {
  const [subscriptionTypes, setSubscriptionTypes] = useState<AbonnementsvormenType[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  const fetchSubscriptionTypes = async () => {
    try {
      setIsLoading(true);
      setError(null);

      if (!parkingId) {
        setSubscriptionTypes([]);
        setIsLoading(false);
        return;
      }

      const response = await fetch(`/api/subscription_types_for_parking?parkingId=${parkingId}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch subscription types for parking');
      }

      const data: AbonnementsvormenType[] = await response.json();
      setSubscriptionTypes(data);
    } catch (error) {
      console.error('Error fetching subscription types for parking:', error);
      setError(error instanceof Error ? error.message : 'Failed to fetch subscription types for parking');
      setSubscriptionTypes([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchSubscriptionTypes();
  }, [version, parkingId]);

  return {
    subscriptionTypes,
    isLoading,
    error,
    reloadSubscriptionTypes: () => setVersion(v => v + 1)
  };
};
