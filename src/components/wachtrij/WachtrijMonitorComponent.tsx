import React, { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import type { 
  WachtrijBetalingen, 
  WachtrijPasids, 
  WachtrijTransacties, 
  WachtrijSync, 
  WachtrijResponse,
  WebserviceLogResponse
} from '~/types/wachtrij';
import WachtrijTable from './WachtrijTable';
import WebserviceLogTable from './WebserviceLogTable';
import Pagination from './Pagination';

type QueueType = 'betalingen' | 'pasids' | 'transacties' | 'sync' | 'webservice_log';

interface QueueData {
  betalingen: WachtrijResponse<WachtrijBetalingen> | null;
  pasids: WachtrijResponse<WachtrijPasids> | null;
  transacties: WachtrijResponse<WachtrijTransacties> | null;
  sync: WachtrijResponse<WachtrijSync> | null;
}

const WachtrijMonitorComponent: React.FC = () => {
  const { data: session } = useSession();
  const [activeTab, setActiveTab] = useState<QueueType>('transacties');
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [queueData, setQueueData] = useState<QueueData>({
    betalingen: null,
    pasids: null,
    transacties: null,
    sync: null
  });
  const [errors, setErrors] = useState<Record<QueueType, string | null>>({
    betalingen: null,
    pasids: null,
    transacties: null,
    sync: null,
    webservice_log: null
  });

  // Pagination state for each queue type
  const [pagination, setPagination] = useState<Record<QueueType, { page: number; pageSize: number }>>({
    betalingen: { page: 1, pageSize: 20 },
    pasids: { page: 1, pageSize: 20 },
    transacties: { page: 1, pageSize: 20 },
    sync: { page: 1, pageSize: 20 },
    webservice_log: { page: 1, pageSize: 20 }
  });

  // Webservice log specific state
  const [webserviceLogData, setWebserviceLogData] = useState<WebserviceLogResponse | null>(null);
  const [logMethod, setLogMethod] = useState('all');

  const fetchWebserviceLog = async () => {
    setLoading(true);
    try {
      const { page, pageSize } = pagination.webservice_log;
      const params = new URLSearchParams({
        page: page.toString(),
        pageSize: pageSize.toString(),
        ...(logMethod !== 'all' && { method: logMethod })
      });
      
      const response = await fetch(`/api/protected/wachtrij/webservice_log?${params}`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      const data = await response.json();
      setWebserviceLogData(data);
      setErrors(prev => ({ ...prev, webservice_log: null }));
    } catch (error) {
      console.error('Error fetching webservice_log:', error);
      setErrors(prev => ({ 
        ...prev, 
        webservice_log: error instanceof Error ? error.message : 'Unknown error' 
      }));
    } finally {
      setLoading(false);
    }
  };

  const fetchQueueData = async (queueType: QueueType) => {
    try {
      const { page, pageSize } = pagination[queueType];
      const params = new URLSearchParams({
        page: page.toString(),
        pageSize: pageSize.toString()
      });
      
      const response = await fetch(`/api/protected/wachtrij/wachtrij_${queueType}?${params}`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      const data = await response.json();
      return data;
    } catch (error) {
      console.error(`Error fetching ${queueType}:`, error);
      throw error;
    }
  };

  const fetchAllData = async () => {
    if (!session?.user) return;
    
    setLoading(true);
    const newQueueData: QueueData = { ...queueData };
    const newErrors: Record<QueueType, string | null> = { ...errors };

    const queueTypes: QueueType[] = ['betalingen', 'pasids', 'transacties', 'sync'];
    
    await Promise.allSettled(
      queueTypes.map(async (queueType) => {
        try {
          const data = await fetchQueueData(queueType);
          (newQueueData as any)[queueType] = data;
          newErrors[queueType] = null;
        } catch (error) {
          newErrors[queueType] = error instanceof Error ? error.message : 'Unknown error';
        }
      })
    );

    // Fetch webservice log if it's the active tab
    if (activeTab === 'webservice_log') {
      await fetchWebserviceLog();
    }

    setQueueData(newQueueData);
    setErrors(newErrors);
    setLastUpdated(new Date());
    setLoading(false);
  };

  const handleManualRefresh = async () => {
    if (loading) return;
    await fetchAllData();
  };

  const handleTabChange = (tab: QueueType) => {
    setActiveTab(tab);
    if (tab === 'webservice_log') {
      fetchWebserviceLog();
    }
  };

  const handlePageChange = (page: number, queueType: QueueType) => {
    setPagination(prev => ({
      ...prev,
      [queueType]: { ...prev[queueType], page }
    }));
  };

  const handlePageSizeChange = (pageSize: number, queueType: QueueType) => {
    setPagination(prev => ({
      ...prev,
      [queueType]: { page: 1, pageSize }
    }));
  };

  const handleLogMethodChange = (method: string) => {
    setLogMethod(method);
    setPagination(prev => ({
      ...prev,
      webservice_log: { ...prev.webservice_log, page: 1 }
    }));
  };

  useEffect(() => {
    fetchAllData();
  }, [session]);

  useEffect(() => {
    if (autoRefresh) {
      const interval = setInterval(() => {
        fetchAllData();
      }, 15000);
      return () => clearInterval(interval);
    }
  }, [autoRefresh]);

  // Fetch webservice log when pagination or filters change
  useEffect(() => {
    if (activeTab === 'webservice_log') {
      fetchWebserviceLog();
    }
  }, [pagination.webservice_log, logMethod]);

  // Fetch data when pagination changes for regular queue types
  useEffect(() => {
    if (activeTab !== 'webservice_log' && activeTab !== undefined && queueData[activeTab]) {
      const fetchCurrentQueueData = async () => {
        try {
          setLoading(true);
          const data = await fetchQueueData(activeTab);
          setQueueData(prev => ({
            ...prev,
            [activeTab]: data
          }));
          setErrors(prev => ({
            ...prev,
            [activeTab]: null
          }));
        } catch (error) {
          setErrors(prev => ({
            ...prev,
            [activeTab]: error instanceof Error ? error.message : 'Unknown error'
          }));
        } finally {
          setLoading(false);
        }
      };

      fetchCurrentQueueData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pagination[activeTab]?.page, pagination[activeTab]?.pageSize, activeTab]);

  const tabs = [
    { key: 'transacties' as QueueType, label: 'Transacties', description: 'Check-in/check-out transactions queue' },
    { key: 'betalingen' as QueueType, label: 'Betalingen', description: 'Balance additions queue' },
    { key: 'pasids' as QueueType, label: 'PasIDs', description: 'Bike-pass associations queue' },
    { key: 'sync' as QueueType, label: 'Sync', description: 'Sector synchronization queue' },
    { key: 'webservice_log' as QueueType, label: 'Webservice Log', description: 'API call logging with detailed request/response data' }
  ];

  const getColumns = (queueType: QueueType) => {
    switch (queueType) {
      case 'betalingen':
        return [
          { key: 'ID', label: 'ID' },
          { key: 'bikeparkID', label: 'Bikepark ID' },
          { key: 'passID', label: 'Pass ID' },
          { 
            key: 'amount', 
            label: 'Amount',
            render: (value: any) => `€${Number(value).toFixed(2)}`
          },
          { 
            key: 'transactionDate', 
            label: 'Transaction Date',
            render: (value: Date) => new Date(value).toLocaleString('nl-NL')
          },
          { 
            key: 'processed', 
            label: 'Status',
            render: (value: boolean) => {
              const statusInfo = value === true 
                ? { text: 'Processed', color: 'bg-green-100 text-green-800' }
                : { text: 'Pending', color: 'bg-yellow-100 text-yellow-800' };
              return (
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusInfo.color}`}>
                  {statusInfo.text}
                </span>
              );
            }
          },
          { 
            key: 'dateCreated', 
            label: 'Created',
            render: (value: Date) => new Date(value).toLocaleString('nl-NL')
          }
        ];
      case 'pasids':
        return [
          { key: 'ID', label: 'ID' },
          { key: 'bikeparkID', label: 'Bikepark ID' },
          { key: 'passID', label: 'Pass ID' },
          { key: 'barcode', label: 'Barcode' },
          { key: 'RFID', label: 'RFID' },
          { 
            key: 'processed', 
            label: 'Status',
            render: (value: boolean) => {
              const statusInfo = value === true 
                ? { text: 'Processed', color: 'bg-green-100 text-green-800' }
                : { text: 'Pending', color: 'bg-yellow-100 text-yellow-800' };
              return (
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusInfo.color}`}>
                  {statusInfo.text}
                </span>
              );
            }
          },
          { 
            key: 'DateCreated', 
            label: 'Created',
            render: (value: Date) => new Date(value).toLocaleString('nl-NL')
          }
        ];
      case 'transacties':
        return [
          { key: 'ID', label: 'ID' },
          { key: 'bikeparkID', label: 'Bikepark ID' },
          { key: 'sectionID', label: 'Section ID' },
          { key: 'passID', label: 'Pass ID' },
          { key: 'type', label: 'Type' },
          { 
            key: 'processed', 
            label: 'Status',
            render: (value: boolean) => {
              const statusInfo = value === true 
                ? { text: 'Processed', color: 'bg-green-100 text-green-800' }
                : { text: 'Pending', color: 'bg-yellow-100 text-yellow-800' };
              return (
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusInfo.color}`}>
                  {statusInfo.text}
                </span>
              );
            }
          },
          { 
            key: 'dateCreated', 
            label: 'Created',
            render: (value: Date) => new Date(value).toLocaleString('nl-NL')
          }
        ];
      case 'sync':
        return [
          { key: 'ID', label: 'ID' },
          { key: 'bikeparkID', label: 'Bikepark ID' },
          { key: 'sectionID', label: 'Section ID' },
          { 
            key: 'processed', 
            label: 'Status',
            render: (value: number) => {
              const getStatusInfo = (status: number) => {
                switch (status) {
                  case 0: return { text: 'Pending', color: 'bg-yellow-100 text-yellow-800' };
                  case 8: return { text: 'Processing', color: 'bg-blue-100 text-blue-800' };
                  case 9: return { text: 'Selected', color: 'bg-indigo-100 text-indigo-800' };
                  case 1: return { text: 'Success', color: 'bg-green-100 text-green-800' };
                  case 2: return { text: 'Error', color: 'bg-red-100 text-red-800' };
                  default: return { text: `Unknown (${status})`, color: 'bg-gray-100 text-gray-800' };
                }
              };
              const statusInfo = getStatusInfo(value);
              return (
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusInfo.color}`}>
                  {statusInfo.text}
                </span>
              );
            }
          },
          { 
            key: 'dateCreated', 
            label: 'Created',
            render: (value: Date) => new Date(value).toLocaleString('nl-NL')
          }
        ];
      default:
        return [];
    }
  };

  const currentData = activeTab !== 'webservice_log' ? queueData[activeTab] : null;
  const currentError = errors[activeTab];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Controls */}
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <button
            onClick={handleManualRefresh}
            disabled={loading}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Refreshing...' : 'Refresh Now'}
          </button>
          
          <label className="flex items-center">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="rounded border-gray-300 text-blue-600 shadow-sm focus:border-blue-300 focus:ring focus:ring-blue-200 focus:ring-opacity-50"
            />
            <span className="ml-2 text-sm text-gray-700">Auto-refresh (15s)</span>
          </label>
          
          {loading && (
            <div className="flex items-center text-sm text-gray-500">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600 mr-2"></div>
              Loading...
            </div>
          )}
        </div>
        
        {/* Webservice Log Method Filter */}
        {activeTab === 'webservice_log' && webserviceLogData && (
          <div className="flex items-center space-x-4">
            <select
              value={logMethod}
              onChange={(e) => handleLogMethodChange(e.target.value)}
              disabled={loading}
              className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
            >
              <option value="all">All Methods</option>
              {webserviceLogData.availableMethods.map(method => (
                <option key={method} value={method}>{method}</option>
              ))}
            </select>
          </div>
        )}
        
        {lastUpdated && (
          <div className="text-sm text-gray-500">
            Last updated: {lastUpdated.toLocaleString('nl-NL')}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="mb-6">
        <div className="border-b border-gray-200">
          <nav className="-mb-px flex space-x-8">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => handleTabChange(tab.key)}
                className={`py-2 px-1 border-b-2 font-medium text-sm ${
                  activeTab === tab.key
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                {tab.label}
                {errors[tab.key] && (
                  <span className="ml-2 text-red-500">⚠️</span>
                )}
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* Error Display */}
      {currentError && (
        <div className="mb-6 bg-red-50 border border-red-200 rounded-md p-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <span className="text-red-400">⚠️</span>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-red-800">Error loading {activeTab}</h3>
              <div className="mt-2 text-sm text-red-700">{currentError}</div>
            </div>
          </div>
        </div>
      )}

      {/* Table - regular queue tables */}
      {currentData && activeTab !== 'webservice_log' && (
        <>
          <WachtrijTable 
            data={currentData.data} 
            columns={getColumns(activeTab)}
          />
          <Pagination
            currentPage={currentData.pagination.page}
            totalPages={currentData.pagination.totalPages}
            pageSize={currentData.pagination.pageSize}
            total={currentData.pagination.total}
            onPageChange={(page) => handlePageChange(page, activeTab)}
            onPageSizeChange={(pageSize) => handlePageSizeChange(pageSize, activeTab)}
            loading={loading}
          />
        </>
      )}

      {/* Webservice Log Table */}
      {activeTab === 'webservice_log' && webserviceLogData && (
        <div>
          <WebserviceLogTable data={webserviceLogData.data} />
          <Pagination
            currentPage={webserviceLogData.pagination.page}
            totalPages={webserviceLogData.pagination.totalPages}
            pageSize={webserviceLogData.pagination.pageSize}
            total={webserviceLogData.pagination.total}
            onPageChange={(page) => handlePageChange(page, 'webservice_log')}
            onPageSizeChange={(pageSize) => handlePageSizeChange(pageSize, 'webservice_log')}
            loading={loading}
            pageSizeOptions={[20, 50, 100, 200, 500]}
          />
        </div>
      )}
    </div>
  );
};

export default WachtrijMonitorComponent;
