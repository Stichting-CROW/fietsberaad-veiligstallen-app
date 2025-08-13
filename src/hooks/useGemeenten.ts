import { useState, useEffect, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import type { VSContactGemeenteInLijst, VSContactGemeente } from '~/types/contacts';
import { incrementGemeentenVersion } from '~/store/appSlice';
import type { RootState } from '~/store/rootReducer';

type GemeentenResponse<T extends VSContactGemeenteInLijst | VSContactGemeente> = {
  data?: T[];
  error?: string;
};

const useGemeentenBasis = <T extends VSContactGemeenteInLijst | VSContactGemeente>(compact: boolean) => {
  const [gemeenten, setGemeenten] = useState<T[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(false);
  
  const dispatch = useDispatch();
  const gemeentenVersion = useSelector((state: RootState) => state.app.gemeentenVersion);

  const fetchGemeenten = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await fetch(`/api/protected/gemeenten?compact=${compact}`);
      const result: GemeentenResponse<T> = await response.json();
      
      if (result.error) {
        throw new Error(result.error);
      }

      setGemeenten(result.data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred while fetching gemeenten');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
    }
    fetchGemeenten();
  }, [gemeentenVersion]);

  return {
    gemeenten,
    isLoading,
    error: error || undefined,
    reloadGemeenten: () => dispatch(incrementGemeentenVersion())
  };
}; 

export const useGemeentenInLijst = () => useGemeentenBasis<VSContactGemeenteInLijst>(true);
export const useGemeenten = () => useGemeentenBasis<VSContactGemeente>(false);

