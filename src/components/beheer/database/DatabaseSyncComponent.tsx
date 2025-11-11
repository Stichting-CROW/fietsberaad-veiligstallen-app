import React, { useState, useEffect } from 'react';
import type { TableSyncStatus, SyncLogEntry } from '~/backend/services/database-sync-service';

interface SyncState {
  available?: boolean;
  ptTableSyncInstalled?: boolean;
  message?: string;
  isRunning: boolean;
  isStopping: boolean;
  startTime?: string;
  currentTable?: string;
  totalTables: number;
  completedTables: number;
  tables: TableSyncStatus[];
  logs: SyncLogEntry[];
}

// Large tables (>1GB) - from backup script
const TABLES_LARGE = [
  'transacties_archief', 'bezettingsdata', 'transacties', 'webservice_log',
  'accounts_pasids', 'wachtrij_transacties', 'wachtrij_pasids', 'gemeenteaccounts',
  'accounts', 'bezettingsdata_day_hour_cache', 'financialtransactions', 'emails'
];

// Tables related to security_users and access to contacts and fietsenstallingen
// Order: security_roles (no deps) -> security_users (depends on security_roles) -> 
//        contacts (no deps) -> user_contact_role (depends on security_users, contacts) ->
//        security_users_sites (depends on security_users) -> contact_contact (depends on contacts) ->
//        modules_contacts (depends on contacts)
const TABLES_CONTACTS_RAW = [
  'security_roles',           // User roles/permissions (no dependencies)
  'contacts',                 // Organizations/contacts table (no dependencies)
  'security_users',           // Main user accounts (depends on security_roles)
  'user_contact_role',        // Modern role system (depends on security_users, contacts)
  'security_users_sites',     // Links users to sites (depends on security_users)
  'contact_contact',          // Links contacts to other contacts (depends on contacts)
  'modules_contacts'           // Links modules to contacts (depends on contacts)
];

// Import the ordering function (we'll need to create a shared utility or duplicate the logic)
// For now, we'll manually order based on known dependencies
const TABLES_CONTACTS = TABLES_CONTACTS_RAW; // Will be ordered by sync service

const DatabaseSyncComponent: React.FC = () => {
  const [syncState, setSyncState] = useState<SyncState | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [selectedTables, setSelectedTables] = useState<Set<string>>(new Set());
  const [dryRun, setDryRun] = useState(true);

  const fetchStatus = async () => {
    try {
      const response = await fetch('/api/protected/database-sync/status');
      if (!response.ok) {
        throw new Error('Failed to fetch sync status');
      }
      const data = await response.json();
      setSyncState(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    }
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  // Initialize selected tables when syncState is loaded (default: all selected)
  useEffect(() => {
    if (syncState?.tables && selectedTables.size === 0) {
      const allTableNames = new Set(syncState.tables.map(t => t.table));
      setSelectedTables(allTableNames);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncState]);

  useEffect(() => {
    if (autoRefresh && syncState?.isRunning) {
      const interval = setInterval(fetchStatus, 2000); // Refresh every 2 seconds
      return () => clearInterval(interval);
    }
  }, [autoRefresh, syncState?.isRunning]);

  const handleStart = async () => {
    if (selectedTables.size === 0) {
      setError('Please select at least one table to sync');
      return;
    }

    // If not in dry run mode, ask for confirmation
    if (!dryRun) {
      const confirmed = window.confirm(
        `Je gaat ${selectedTables.size} tabel(len) synchroniseren. De data in de testdatabase wordt overschreven met data uit de productiedatabase. Weet je zeker dat je wilt doorgaan?`
      );
      if (!confirmed) {
        return; // User cancelled
      }
    }

    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/protected/database-sync/start', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          tables: Array.from(selectedTables),
          dryRun: dryRun,
        }),
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to start sync');
      }
      setAutoRefresh(true);
      setTimeout(fetchStatus, 1000); // Fetch status after 1 second
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleTableToggle = (tableName: string) => {
    setSelectedTables(prev => {
      const newSet = new Set(prev);
      if (newSet.has(tableName)) {
        newSet.delete(tableName);
      } else {
        newSet.add(tableName);
      }
      return newSet;
    });
  };

  const handleSelectFilter = (filter: 'small' | 'large' | 'all' | 'none' | 'contacts') => {
    if (!syncState?.tables) return;

    const allTableNames = syncState.tables.map(t => t.table);
    const newSelection = new Set<string>();

    switch (filter) {
      case 'all':
        allTableNames.forEach(name => newSelection.add(name));
        break;
      case 'none':
        // newSelection stays empty
        break;
      case 'large':
        allTableNames.forEach(name => {
          if (TABLES_LARGE.includes(name)) {
            newSelection.add(name);
          }
        });
        break;
      case 'small':
        allTableNames.forEach(name => {
          if (!TABLES_LARGE.includes(name)) {
            newSelection.add(name);
          }
        });
        break;
      case 'contacts':
        allTableNames.forEach(name => {
          if (TABLES_CONTACTS.includes(name)) {
            newSelection.add(name);
          }
        });
        break;
    }

    setSelectedTables(newSelection);
  };

  const handleStop = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/protected/database-sync/stop', {
        method: 'POST',
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to stop sync');
      }
      setTimeout(fetchStatus, 500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'done':
        return 'bg-green-100 text-green-800';
      case 'busy':
        return 'bg-blue-100 text-blue-800';
      case 'error':
        return 'bg-red-100 text-red-800';
      case 'todo':
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getLogColor = (level: string) => {
    switch (level) {
      case 'error':
        return 'text-red-600';
      case 'warning':
        return 'text-yellow-600';
      case 'info':
      default:
        return 'text-gray-700';
    }
  };

  const formatDuration = (startTime?: string) => {
    if (!startTime) return '';
    const start = new Date(startTime);
    const now = new Date();
    const diff = Math.floor((now.getTime() - start.getTime()) / 1000);
    const hours = Math.floor(diff / 3600);
    const minutes = Math.floor((diff % 3600) / 60);
    const seconds = diff % 60;
    return `${hours}h ${minutes}m ${seconds}s`;
  };

  if (!syncState) {
    return <div>Loading...</div>;
  }

  // Hide component if database URLs are not configured
  if (syncState.available === false && syncState.ptTableSyncInstalled !== false) {
    return null;
  }

  // Show installation instructions if pt-table-sync is not installed but DB URLs are set
  if (syncState.available === false && syncState.ptTableSyncInstalled === false) {
    return (
      <div className="p-6 bg-white rounded-lg shadow">
        <div className="mb-6">
          <h2 className="text-2xl font-bold mb-4">Database Sync</h2>
          <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
            <h3 className="text-lg font-semibold text-yellow-800 mb-2">
              pt-table-sync Not Installed
            </h3>
            <p className="text-yellow-700 mb-4">
              Database sync is configured, but <code className="bg-yellow-100 px-2 py-1 rounded">pt-table-sync</code> from Percona Toolkit is not installed on this server.
            </p>
            
            <h4 className="font-semibold text-yellow-800 mb-2">Installation Instructions:</h4>
            <div className="bg-white p-4 rounded border border-yellow-300">
              <h5 className="font-semibold mb-2">Ubuntu/Debian:</h5>
              <pre className="bg-gray-100 p-3 rounded text-sm overflow-x-auto">
{`sudo apt-get update
sudo apt-get install percona-toolkit`}
              </pre>

              <h5 className="font-semibold mt-4 mb-2">CentOS/RHEL:</h5>
              <pre className="bg-gray-100 p-3 rounded text-sm overflow-x-auto">
{`sudo yum install percona-toolkit`}
              </pre>

              <h5 className="font-semibold mt-4 mb-2">macOS (Homebrew):</h5>
              <pre className="bg-gray-100 p-3 rounded text-sm overflow-x-auto">
{`brew install percona-toolkit`}
              </pre>

              <h5 className="font-semibold mt-4 mb-2">Verify Installation:</h5>
              <pre className="bg-gray-100 p-3 rounded text-sm overflow-x-auto">
{`pt-table-sync --version`}
              </pre>

              <p className="mt-4 text-sm text-gray-600">
                <strong>Note:</strong> If <code className="bg-gray-100 px-1 py-0.5 rounded">pt-table-sync</code> is installed in a non-standard location, 
                you can set the <code className="bg-gray-100 px-1 py-0.5 rounded">PT_TABLE_SYNC_PATH</code> environment variable to the full path.
              </p>
            </div>

            <div className="mt-4 text-sm text-yellow-700">
              <p>
                <strong>Documentation:</strong>{' '}
                <a 
                  href="https://www.percona.com/software/database-tools/percona-toolkit" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-yellow-800 underline hover:text-yellow-900"
                >
                  Percona Toolkit Installation Guide
                </a>
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 bg-white rounded-lg shadow">
      <div className="mb-6">
        <h2 className="text-2xl font-bold mb-4">Database Sync</h2>
        <p className="text-gray-600 mb-4">
          Sync data from master database to slave database
        </p>

        {error && (
          <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
            {error}
          </div>
        )}

        <div className="flex gap-4 mb-4 flex-wrap items-center">
          <button
            onClick={handleStart}
            disabled={isLoading || syncState.isRunning || selectedTables.size === 0}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            {isLoading ? 'Starting...' : `Start Sync${dryRun ? ' (Dry Run)' : ''} (${selectedTables.size} selected)`}
          </button>
          <button
            onClick={handleStop}
            disabled={isLoading || !syncState.isRunning}
            className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            {isLoading ? 'Stopping...' : 'Stop Sync'}
          </button>
          <button
            onClick={fetchStatus}
            className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700"
          >
            Refresh Status
          </button>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="rounded"
            />
            <span className="text-sm">Auto-refresh</span>
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={dryRun}
              onChange={(e) => {
                if (!e.target.checked) {
                  // User is unchecking dry run - show confirmation
                  const confirmed = window.confirm(
                    'De data uit de geselecteerde tabellen in de huidige testdatabase wordt gewist bij synchronisatie. Doorgaan?'
                  );
                  if (confirmed) {
                    setDryRun(false);
                  }
                  // If not confirmed, checkbox stays checked (dryRun remains true)
                } else {
                  // User is checking dry run - no confirmation needed
                  setDryRun(true);
                }
              }}
              disabled={syncState.isRunning}
              className="rounded"
            />
            <span className="text-sm">Dry run</span>
          </label>
        </div>

        {/* Table Selection Filters */}
        <div className="mb-4 flex gap-2 flex-wrap">
          <span className="text-sm font-medium text-gray-700 self-center">Select tables:</span>
          <button
            onClick={() => handleSelectFilter('large')}
            disabled={syncState.isRunning}
            className="px-3 py-1 text-sm bg-gray-200 text-gray-700 rounded hover:bg-gray-300 disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed"
          >
            Large
          </button>
          <button
            onClick={() => handleSelectFilter('small')}
            disabled={syncState.isRunning}
            className="px-3 py-1 text-sm bg-gray-200 text-gray-700 rounded hover:bg-gray-300 disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed"
          >
            Small
          </button>
          <button
            onClick={() => handleSelectFilter('contacts')}
            disabled={syncState.isRunning}
            className="px-3 py-1 text-sm bg-gray-200 text-gray-700 rounded hover:bg-gray-300 disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed"
          >
            Contacts
          </button>
        </div>

        {syncState.isRunning && (
          <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
              <span className="font-semibold">Sync in progress...</span>
            </div>
            {syncState.startTime && (
              <div className="text-sm text-gray-600">
                Started: {new Date(syncState.startTime).toLocaleString()} 
                ({formatDuration(syncState.startTime)} ago)
              </div>
            )}
            <div className="text-sm text-gray-600 mt-1">
              Progress: {syncState.completedTables} / {syncState.totalTables} tables
              {syncState.currentTable && ` (Current: ${syncState.currentTable})`}
            </div>
            <div className="mt-2 w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-blue-600 h-2 rounded-full transition-all"
                style={{ width: `${(syncState.completedTables / syncState.totalTables) * 100}%` }}
              ></div>
            </div>
          </div>
        )}

        {syncState.isStopping && (
          <div className="mb-4 p-4 bg-yellow-50 border border-yellow-200 rounded">
            <span className="font-semibold text-yellow-800">Stopping sync...</span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Tables Status */}
        <div>
          <h3 className="text-xl font-semibold mb-4">Table Status</h3>
          <div className="max-h-96 overflow-y-auto border rounded">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase w-12">
                    <input
                      type="checkbox"
                      checked={syncState.tables.length > 0 && syncState.tables.every(t => selectedTables.has(t.table))}
                      onChange={(e) => {
                        if (e.target.checked) {
                          handleSelectFilter('all');
                        } else {
                          handleSelectFilter('none');
                        }
                      }}
                      disabled={syncState.isRunning}
                      className="rounded"
                    />
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Table</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Size</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Rows</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Progress</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {syncState.tables.map((table) => (
                  <tr key={table.table} className={`hover:bg-gray-50 ${!selectedTables.has(table.table) ? 'opacity-50' : ''}`}>
                    <td className="px-4 py-2">
                      <input
                        type="checkbox"
                        checked={selectedTables.has(table.table)}
                        onChange={() => handleTableToggle(table.table)}
                        disabled={syncState.isRunning}
                        className="rounded"
                      />
                    </td>
                    <td className="px-4 py-2 text-sm font-medium">{table.table}</td>
                    <td className="px-4 py-2 text-sm">
                      <span className={`px-2 py-1 rounded text-xs font-semibold ${getStatusColor(table.status)}`}>
                        {table.status}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-sm text-gray-600">
                      {table.tableSizeMB !== undefined && typeof table.tableSizeMB === 'number'
                        ? `${table.tableSizeMB.toFixed(2)} MB`
                        : '-'}
                    </td>
                    <td className="px-4 py-2 text-sm text-gray-600">
                      {table.rowCount !== undefined
                        ? table.rowCount.toLocaleString()
                        : '-'}
                    </td>
                    <td className="px-4 py-2 text-sm text-gray-600">
                      {table.rowsProcessed !== undefined && table.rowsTotal !== undefined
                        ? `${table.rowsProcessed.toLocaleString()} / ${table.rowsTotal.toLocaleString()}`
                        : table.rowsProcessed !== undefined
                        ? table.rowsProcessed.toLocaleString()
                        : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Logs */}
        <div>
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-xl font-semibold">Logs</h3>
            <button
              onClick={async () => {
                try {
                  const response = await fetch('/api/protected/database-sync/clear-logs', {
                    method: 'POST',
                  });
                  if (!response.ok) {
                    const data = await response.json();
                    throw new Error(data.error || 'Failed to clear logs');
                  }
                  await fetchStatus(); // Refresh to show updated logs
                } catch (error) {
                  setError(error instanceof Error ? error.message : 'Failed to clear logs');
                }
              }}
              className="px-3 py-1 text-sm bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
            >
              Clear Logs
            </button>
          </div>
          <div className="max-h-96 overflow-y-auto border rounded p-4 bg-gray-50">
            <div className="space-y-2">
              {syncState.logs.length === 0 ? (
                <div className="text-gray-500 text-sm">No logs yet</div>
              ) : (
                syncState.logs.map((log, index) => (
                  <div key={index} className={`text-sm ${getLogColor(log.level)}`}>
                    <span className="text-gray-500">
                      {new Date(log.timestamp).toLocaleTimeString()}
                    </span>
                    {log.table && (
                      <span className="ml-2 text-gray-600 font-mono text-xs">
                        [{log.table}]
                      </span>
                    )}
                    <span className="ml-2">{log.message}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DatabaseSyncComponent;

