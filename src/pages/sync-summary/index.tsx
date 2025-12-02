import React, { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import type { ControleSummary } from '~/types/sync-summary';
import SynchronisatieTable from '~/components/sync-summary/SynchronisatieTable';
import ControleTable from '~/components/sync-summary/ControleTable';

const SyncSummaryPage: React.FC = () => {
  const { data: session } = useSession();
  const [activeTab, setActiveTab] = useState<'synchronisatie' | 'controle'>('synchronisatie');
  const [syncData, setSyncData] = useState<ControleSummary[]>([]);
  const [controleData, setControleData] = useState<ControleSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Pagination state
  const [syncPagination, setSyncPagination] = useState({
    page: 1,
    pageSize: 20
  });
  const [controlePagination, setControlePagination] = useState({
    page: 1,
    pageSize: 20
  });

  // Fetch sync summary data
  const fetchSyncData = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/protected/sync-summary/controle-summary`);
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
  };

  // Fetch controle overview data
  const fetchControleData = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/protected/sync-summary/controle-overview`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      const data = await response.json();
      console.log('[sync-summary] Controle API response:', data);
      console.log('[sync-summary] Controle data count:', data.data?.length || 0);
      setControleData(data.data || []);
    } catch (err) {
      console.error('Error fetching controle overview:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  // Handle summary row click (no-op for now)
  const handleSummaryRowClick = (summary: ControleSummary) => {
    // Can be implemented later for drill-down
  };

  // Calculate paginated sync data
  const syncTotal = syncData.length;
  const syncTotalPages = Math.ceil(syncTotal / syncPagination.pageSize);
  const syncStartIndex = (syncPagination.page - 1) * syncPagination.pageSize;
  const syncEndIndex = syncStartIndex + syncPagination.pageSize;
  const paginatedSyncData = syncData.slice(syncStartIndex, syncEndIndex);

  // Calculate paginated controle data
  const controleTotal = controleData.length;
  const controleTotalPages = Math.ceil(controleTotal / controlePagination.pageSize);
  const controleStartIndex = (controlePagination.page - 1) * controlePagination.pageSize;
  const controleEndIndex = controleStartIndex + controlePagination.pageSize;
  const paginatedControleData = controleData.slice(controleStartIndex, controleEndIndex);

  // Fetch sync data on mount
  useEffect(() => {
    fetchSyncData();
  }, []);

  // Fetch controle data when controle tab is activated
  useEffect(() => {
    if (activeTab === 'controle' && controleData.length === 0) {
      fetchControleData();
    }
  }, [activeTab]);

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
          Synchronisatie en Controle overzicht
        </h1>
      </div>

      {/* Tabs */}
      <div className="mb-6">
        <div className="border-b border-gray-200">
          <nav className="-mb-px flex space-x-8">
            <button
              onClick={() => setActiveTab('synchronisatie')}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'synchronisatie'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Synchronisatie
            </button>
            <button
              onClick={() => setActiveTab('controle')}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'controle'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Controle
            </button>
          </nav>
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

      {/* Tab Content */}
      {activeTab === 'synchronisatie' && (
        <div>
          <p className="text-gray-600 mb-4">
            Overzicht van laatste synchronisatie per fietsenstalling
          </p>
          <SynchronisatieTable
            data={paginatedSyncData}
            pagination={{
              page: syncPagination.page,
              pageSize: syncPagination.pageSize,
              total: syncTotal,
              totalPages: syncTotalPages
            }}
            onRowClick={handleSummaryRowClick}
            onPageChange={(page) => setSyncPagination({ ...syncPagination, page })}
            onPageSizeChange={(pageSize) => setSyncPagination({ ...syncPagination, pageSize, page: 1 })}
            loading={loading}
          />
        </div>
      )}

      {activeTab === 'controle' && (
        <div>
          <p className="text-gray-600 mb-4">
            Overzicht van laatste synchronisatie en controle per fietsenstalling
          </p>
          <ControleTable
            data={paginatedControleData}
            pagination={{
              page: controlePagination.page,
              pageSize: controlePagination.pageSize,
              total: controleTotal,
              totalPages: controleTotalPages
            }}
            onRowClick={handleSummaryRowClick}
            onPageChange={(page) => setControlePagination({ ...controlePagination, page })}
            onPageSizeChange={(pageSize) => setControlePagination({ ...controlePagination, pageSize, page: 1 })}
            loading={loading}
          />
        </div>
      )}
    </div>
  );
};

export default SyncSummaryPage;

