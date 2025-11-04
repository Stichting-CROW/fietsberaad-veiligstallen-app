import React, { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { userHasRight } from '~/types/utils';
import { VSSecurityTopic } from '~/types/securityprofile';

interface OrphanedTarievenCleanupProps {
  title?: string;
}

const OrphanedTarievenCleanup: React.FC<OrphanedTarievenCleanupProps> = ({ 
  title = 'Incorrecte Tarieven Opruimen' 
}) => {
  const { data: session } = useSession();
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isLoadingStats, setIsLoadingStats] = useState<boolean>(true);
  const [resultMessage, setResultMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [stats, setStats] = useState<{
    orphanedSectieFietstypeCount: number;
    sectieFietstypeWithoutSectionCount: number;
    sectieFietstypeWithInvalidBikeTypeCount: number;
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
        const response = await fetch(`/api/protected/database/orphaned-sections/check-tarieven?t=${Date.now()}`, {
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
          orphanedSectieFietstypeCount: json.data?.orphanedSectieFietstypeCount || 0,
          sectieFietstypeWithoutSectionCount: json.data?.sectieFietstypeWithoutSectionCount || 0,
          sectieFietstypeWithInvalidBikeTypeCount: json.data?.sectieFietstypeWithInvalidBikeTypeCount || 0,
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
      const response = await fetch(`/api/protected/database/orphaned-sections/check-tarieven?t=${Date.now()}`, {
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
        orphanedSectieFietstypeCount: json.data?.orphanedSectieFietstypeCount || 0,
        sectieFietstypeWithoutSectionCount: json.data?.sectieFietstypeWithoutSectionCount || 0,
        sectieFietstypeWithInvalidBikeTypeCount: json.data?.sectieFietstypeWithInvalidBikeTypeCount || 0,
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
      'Weet u zeker dat u incorrecte tarieven wilt verwijderen? Deze actie kan niet ongedaan worden gemaakt.'
    );

    if (!confirmed) {
      return;
    }

    setIsLoading(true);
    setResultMessage(null);
    setErrorMessage(null);

    try {
      const response = await fetch(`/api/protected/database/orphaned-sections/cleanup-tarieven?t=${Date.now()}`, {
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

      const message = `Opruiming tarieven voltooid:\n\n` +
        `- Verwijderde sectie_fietstype records: ${json.data?.deletedSectieFietstypeCount || 0}`;
      
      alert(message);
      
      setResultMessage('✅ Opruiming tarieven voltooid.');
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
        <h3 className="text-lg font-semibold mb-2">Tarieven (sectie_fietstype)</h3>
        
        <div className="mb-4">
          {isLoadingStats ? (
            <div className="text-gray-600">Laden...</div>
          ) : stats ? (
            <div className="text-sm text-gray-700 space-y-1">
              <div>- {stats.orphanedSectieFietstypeCount} sectie_fietstype zonder bestaande fietsenstalling</div>
              <div>- {stats.sectieFietstypeWithoutSectionCount} sectie_fietstype records met bestaande fietsenstalling maar zonder gekoppelde sectie</div>
              <div>- {stats.sectieFietstypeWithInvalidBikeTypeCount} sectie_fietstype records met niet bestaand Fietstype</div>
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
            Opruimen tarieven
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

export default OrphanedTarievenCleanup;

