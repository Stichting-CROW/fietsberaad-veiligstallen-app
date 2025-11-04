import React, { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { userHasRight } from '~/types/utils';
import { VSSecurityTopic } from '~/types/securityprofile';

interface OrphanedSectionsCleanupProps {
  title?: string;
}

const OrphanedSectionsCleanup: React.FC<OrphanedSectionsCleanupProps> = ({ 
  title = 'Incorrecte Secties Opruimen' 
}) => {
  const { data: session } = useSession();
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isLoadingStats, setIsLoadingStats] = useState<boolean>(true);
  const [resultMessage, setResultMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [stats, setStats] = useState<{
    orphanedSectionsCount: number;
  } | null>(null);

  const hasFietsberaadSuperadmin = userHasRight(
    session?.user?.securityProfile, 
    VSSecurityTopic.fietsberaad_superadmin
  );

  useEffect(() => {
    const fetchStats = async () => {
      setIsLoadingStats(true);
      setErrorMessage(null);

      try {
        const response = await fetch(`/api/protected/database/orphaned-sections/check-sections?t=${Date.now()}`, {
          method: 'GET',
          headers: { 
            'Content-Type': 'application/json',
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache'
          },
        });

        const json = await response.json();

        if (!response.ok || !json?.success) {
          const msg = json?.error || response.statusText || 'Onbekende fout';
          setErrorMessage(`❌ Fout: ${msg}`);
          return;
        }

        setStats({
          orphanedSectionsCount: json.data?.orphanedSectionsCount || 0,
        });
      } catch (error) {
        setErrorMessage(`❌ Netwerkfout: ${error instanceof Error ? error.message : 'Onbekende fout'}`);
      } finally {
        setIsLoadingStats(false);
      }
    };

    fetchStats();
  }, []);

  const refreshStats = async () => {
    setIsLoadingStats(true);
    setErrorMessage(null);

    try {
      const response = await fetch(`/api/protected/database/orphaned-sections/check-sections?t=${Date.now()}`, {
        method: 'GET',
        headers: { 
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        },
      });

      const json = await response.json();

      if (!response.ok || !json?.success) {
        const msg = json?.error || response.statusText || 'Onbekende fout';
        setErrorMessage(`❌ Fout: ${msg}`);
        return;
      }

      setStats({
        orphanedSectionsCount: json.data?.orphanedSectionsCount || 0,
      });
    } catch (error) {
      setErrorMessage(`❌ Netwerkfout: ${error instanceof Error ? error.message : 'Onbekende fout'}`);
    } finally {
      setIsLoadingStats(false);
    }
  };

  const handleCleanup = async () => {
    if (!hasFietsberaadSuperadmin) {
      alert('Alleen fietsberaad superadmins mogen deze actie uitvoeren.');
      return;
    }

    const confirmed = confirm(
      'Weet u zeker dat u incorrecte secties wilt verwijderen? Deze actie kan niet ongedaan worden gemaakt.'
    );

    if (!confirmed) {
      return;
    }

    setIsLoading(true);
    setResultMessage(null);
    setErrorMessage(null);

    try {
      const response = await fetch(`/api/protected/database/orphaned-sections/cleanup-sections?t=${Date.now()}`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        },
      });

      const json = await response.json();

      if (!response.ok || !json?.success) {
        const msg = json?.error || response.statusText || 'Onbekende fout';
        setErrorMessage(`❌ Fout: ${msg}`);
        return;
      }

      const message = `Opruiming secties voltooid:\n\n` +
        `- Verwijderde fietsenstalling_sectie records: ${json.data?.deletedSectionsCount || 0}`;
      
      alert(message);
      
      setResultMessage('✅ Opruiming secties voltooid.');
      await refreshStats();
    } catch (error) {
      setErrorMessage(`❌ Netwerkfout: ${error instanceof Error ? error.message : 'Onbekende fout'}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="bg-gray-200 border-2 border-gray-400 p-4 rounded mb-4">
      <h2 className="text-xl font-semibold mb-3">{title}</h2>

      {errorMessage && (
        <div className="text-red-700 font-semibold mb-4">{errorMessage}</div>
      )}

      <div className="bg-white border border-gray-300 p-4 rounded">
        <h3 className="text-lg font-semibold mb-2">Secties</h3>
        
        <div className="mb-4">
          {isLoadingStats ? (
            <div className="text-gray-600">Laden...</div>
          ) : stats ? (
            <div className="text-sm text-gray-700 space-y-1">
              <div>- {stats.orphanedSectionsCount} secties zonder bestaande fietsenstalling</div>
            </div>
          ) : null}
        </div>

        <div className="flex flex-col sm:flex-row">
          <button
            onClick={handleCleanup}
            disabled={isLoading || !hasFietsberaadSuperadmin}
            className={`px-4 py-2 rounded-md text-white ${
              isLoading || !hasFietsberaadSuperadmin
                ? 'bg-gray-400 cursor-not-allowed' 
                : 'bg-red-500 hover:bg-red-700'
            }`}
            title={!hasFietsberaadSuperadmin ? 'Alleen beschikbaar voor fietsberaad superadmins' : ''}
          >
            Opruimen secties
          </button>
        </div>

        <div className="mt-4 min-h-[1.25rem]">
          {isLoading && (
            <div className="spinner">
              <div className="loader" />
            </div>
          )}
          {!isLoading && resultMessage && (
            <div className="text-green-700 font-semibold m-0 p-0">{resultMessage}</div>
          )}
        </div>
      </div>
    </div>
  );
};

export default OrphanedSectionsCleanup;

