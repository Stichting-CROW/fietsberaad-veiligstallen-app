import { useSession } from 'next-auth/react';
import { useState, useEffect, useRef } from 'react';
import { VSUserWithRolesNew } from '~/types/users';

type UsersResponse = {
  data?: VSUserWithRolesNew[];
  error?: string;
};

export const useUsers = (id: string | undefined = undefined) => {
  const session = useSession();
  const [users, setUsers] = useState<VSUserWithRolesNew[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(false);

  const fetchUsers = async () => {
    try {
      setIsLoading(true);
      setError(null);
      // Type-level check for compact flag
      let url: string | undefined = undefined; //  
      if(id!==undefined) {
        url = `/api/protected/security_users?contactId=${id}`;
      } else {
        // use active contact ID from session
        const activeContactId = session.data?.user?.activeContactId;
        if(!activeContactId) {
          console.error("No active contact ID found");
          return [];
        }
        url = `/api/protected/security_users?contactId=${activeContactId}`;
      }
      const response = await fetch(url);
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
    if (!mounted.current) {
      mounted.current = true;
      fetchUsers();
    }
  });

  return {
    users,
    isLoading,
    error,
    reloadUsers: () => { fetchUsers(); }
  };
}; 