import React, { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import type { ControleSummary } from '~/types/sync-summary';
import SynchronisatieTable from '~/components/sync-summary/SynchronisatieTable';
import SyncEventsModal from '~/components/sync-summary/SyncEventsModal';

const SyncSummaryPage: React.FC = () => {
  const { data: session } = useSession();
  const [syncData, setSyncData] = useState<ControleSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedSummary, setSelectedSummary] = useState<ControleSummary | null>(null);
  const [onlyActive, setOnlyActive] = useState(true);

  // Fetch sync summary data
  const fetchSyncData = useCallback(async () => {
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
  }, [onlyActive]);

  // Handle summary row click - open modal
  const handleSummaryRowClick = (summary: ControleSummary) => {
    if (summary.stallingId) {
      setSelectedSummary(summary);
    }
  };

  // Fetch sync data on mount and when filter changes
  useEffect(() => {
    fetchSyncData();
  }, [fetchSyncData]);

  if (!session) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4">
          <p className="text-yellow-800">U moet ingelogd zijn om deze pagina te bekijken.</p>
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
