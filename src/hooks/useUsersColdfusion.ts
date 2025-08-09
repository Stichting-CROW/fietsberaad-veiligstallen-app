import { useState, useEffect } from 'react';
import { type VSUserWithRoles } from '~/types/users-coldfusion';
import { type SecurityUsersColdfusionResponse } from '~/pages/api/protected/security_users/coldfusion';

/*
  This hook is used to fetch users with the data from the old security model as used in the ols Veiligstallen dashboard

  Once the new security model is fully deployed and the explore users page is no longer used, this hook can be removed.
*/

export const useUsersColdfusion = () => {
  const [users, setUsers] = useState<VSUserWithRoles[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);  
  const [version, setVersion] = useState(0);

  const fetchUsers = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await fetch('/api/protected/security_users/coldfusion/');
      if (!response.ok) {
        throw new Error('Failed to fetch users');
      }
      const data = await response.json() as SecurityUsersColdfusionResponse;
      if (data.data) {
        setUsers(data.data);
      } else {
        setUsers([]);
      }
    } catch (error) {
      console.error('Error fetching users:', error);
      setError(error instanceof Error ? error.message : 'Failed to fetch users');
      setUsers([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers().catch(err => {
      console.error("Error fetching users", err);
    });
  }, [version]);

  return {
    users,
    isLoading,
    error,
    reloadUsers: () => setVersion(v => v + 1)
  };
}; 