import { useSession } from 'next-auth/react';
import { useState, useEffect } from 'react';
import { type VSUserWithRolesNew } from '~/types/users';

type UsersResponse = {
  data?: VSUserWithRolesNew[];
  error?: string;
};

export const useAllUsers = () => {
  const session = useSession();
  const [users, setUsers] = useState<VSUserWithRolesNew[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchUsers = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await fetch(`/api/protected/security_users/allusers`);
      const result: UsersResponse = await response.json();
      if (result.error) {
        throw new Error(result.error);
      }

      setUsers(result.data || []);
    } catch (error) {
      console.error('Error fetching users:', error);
      setError(error instanceof Error ? error.message : 'Failed to fetch users');
      setUsers([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    // Only fetch if session is loaded and not in loading state
    if (session.status !== 'loading') {
      fetchUsers();
    }
  }, [session.status]);

  return {
    users,
    isLoading,
    error,
    reloadUsers: () => { fetchUsers(); }
  };
}; 