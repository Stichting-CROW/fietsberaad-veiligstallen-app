import { useState, useEffect } from 'react';
import { type VSUserWithRolesNew } from '~/types/users';
import { type SecurityUserResponse } from '~/pages/api/protected/security_users/[id]';

export const useUser = (id: string, scopeID?: string) => {
  const [user, setUser] = useState<VSUserWithRolesNew | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  const fetchUser = async () => {
    try {
      setIsLoading(true);
      setError(null);


      let url: string = '/api/protected/security_users/' + id;
      if(scopeID) {
        url += '/withscope/' + scopeID;
      }

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      if (!response.ok) {
        throw new Error('Failed to fetch user');
      }
      const data: SecurityUserResponse = await response.json();
      if (data.data) {
        setUser(data.data);
      } else {
        setUser(null);
      }
    } catch (error) {
      console.error('Error fetching user:', error);
      setError(error instanceof Error ? error.message : 'Failed to fetch user');
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchUser();
  }, [version, id]);

  return {
    user,
    isLoading,
    error,
    reloadUser: () => setVersion(v => v + 1)
  };
}; 