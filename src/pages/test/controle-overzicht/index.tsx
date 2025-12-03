import React, { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/router';
import type { ControleSummary } from '~/types/sync-summary';
import SynchronisatieTable from '~/components/sync-summary/SynchronisatieTable';
import SyncEventsModal from '~/components/sync-summary/SyncEventsModal';

const SyncSummaryPage: React.FC = () => {
  const { data: session } = useSession();
  const router = useRouter();
  const [syncData, setSyncData] = useState<ControleSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedSummary, setSelectedSummary] = useState<ControleSummary | null>(null);
  const [onlyActive, setOnlyActive] = useState(true);

  // Fetch sync summary data
  const fetchSyncData = useCallback(async () => {
    // Don't fetch if no session
    if (!session) {
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const url = `/api/protected/sync-summary/controle-summary?onlyActive=${onlyActive}`;
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      const data = await response.json();
      console.log('[sync-summary] Sync API response:', data);
      console.log('[sync-summary] Sync data count:', data.data?.length || 0);
      setSyncData(data.data || []);
    } catch (err) {
      console.error('Error fetching sync summary:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [onlyActive, session]);

  // Handle summary row click - open modal
  const handleSummaryRowClick = (summary: ControleSummary) => {
    if (summary.stallingId) {
      setSelectedSummary(summary);
    }
  };

  // Fetch sync data on mount and when filter changes (only if session exists)
  useEffect(() => {
    if (session) {
      fetchSyncData();
    }
  }, [fetchSyncData, session]);

  if (!session) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="bg-yellow-50 border border-yellow-300 rounded-lg shadow-sm p-6 max-w-2xl mx-auto">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-6 w-6 text-yellow-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <div className="ml-3 flex-1">
              <h3 className="text-lg font-medium text-yellow-800 mb-2">
                Inloggen vereist
              </h3>
              <p className="text-sm text-yellow-700 mb-4">
                U moet ingelogd zijn om deze pagina te bekijken. Log in om toegang te krijgen tot het synchronisatie overzicht.
              </p>
              <div className="mt-4">
                <a
                  href="/"
                  onClick={(e) => {
                    e.preventDefault();
                    router.push('/');
                  }}
                  className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-yellow-800 bg-yellow-100 hover:bg-yellow-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-yellow-500 transition-colors"
                >
                  <svg className="mr-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                  </svg>
                  Ga naar hoofdpagina
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          Synchronisatie overzicht
        </h1>
        <div className="mt-4 flex items-center">
          <input
            type="checkbox"
            id="onlyActive"
            checked={onlyActive}
            onChange={(e) => setOnlyActive(e.target.checked)}
            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
          />
          <label htmlFor="onlyActive" className="ml-2 text-sm text-gray-700">
            Alleen actieve fietsenstallingen
          </label>
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="mb-6 bg-red-50 border border-red-200 rounded-md p-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <span className="text-red-400">⚠️</span>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-red-800">Fout bij laden</h3>
              <div className="mt-2 text-sm text-red-700">{error}</div>
            </div>
          </div>
        </div>
      )}

      <div>
        <p className="text-gray-600 mb-4">
          Overzicht van laatste synchronisatie per fietsenstalling
        </p>
        <SynchronisatieTable
          data={syncData}
          onRowClick={handleSummaryRowClick}
          loading={loading}
        />
      </div>

      {selectedSummary && selectedSummary.stallingId && (
        <SyncEventsModal
          isOpen={true}
          onClose={() => setSelectedSummary(null)}
          stallingId={selectedSummary.stallingId}
          dataOwnerName={selectedSummary.dataOwnerName}
          stallingName={selectedSummary.fietsenstallingName}
        />
      )}
    </div>
  );
};

export default SyncSummaryPage;
