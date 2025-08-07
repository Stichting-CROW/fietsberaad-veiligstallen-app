import { useState, useEffect } from 'react';
import type { VSmodules_contacts, VSmodules_contactsCreateInput } from '~/types/modules-contacts';

export const useModulesContacts = (contactId?: string) => {
  const [modulesContacts, setModulesContacts] = useState<VSmodules_contacts[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchModulesContacts = async () => {
    try {
      setLoading(true);
      setError(null);
      
      let url = '/api/protected/modules_contacts';
      if (contactId) {
        url += `?contactId=${contactId}`;
      }
      
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      setModulesContacts(data);
    } catch (err) {
      console.error('Error fetching modules contacts:', err);
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const createModulesContacts = async (data: VSmodules_contactsCreateInput[]) => {
    try {
      setError(null);
      
      const response = await fetch('/api/protected/modules_contacts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      // Refresh the list after creating
      await fetchModulesContacts();
      
      return await response.json();
    } catch (err) {
      console.error('Error creating modules contacts:', err);
      setError(err instanceof Error ? err.message : 'An error occurred');
      throw err;
    }
  };

  const updateModulesContact = async (id: string, data: VSmodules_contactsCreateInput) => {
    try {
      setError(null);
      
      const response = await fetch(`/api/protected/modules_contacts?contactId=${contactId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ id, ...data }),
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      // Refresh the list after updating
      await fetchModulesContacts();
      
      return await response.json();
    } catch (err) {
      console.error('Error updating modules contact:', err);
      setError(err instanceof Error ? err.message : 'An error occurred');
      throw err;
    }
  };

  const deleteModulesContactsForContact = async (contactId: string) => {
    try {
      setError(null);
      
      const response = await fetch(`/api/protected/modules_contacts?contactId=${contactId}`, {
        method: 'DELETE',
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      // Refresh the list after deleting
      await fetchModulesContacts();
      
      return await response.json();
    } catch (err) {
      console.error('Error deleting modules contacts:', err);
      setError(err instanceof Error ? err.message : 'An error occurred');
      throw err;
    }
  };

  useEffect(() => {
    fetchModulesContacts();
  }, [contactId]);

  return {
    modulesContacts,
    loading,
    error,
    fetchModulesContacts,
    createModulesContacts,
    updateModulesContact,
    deleteModulesContactsForContact,
  };
}; 