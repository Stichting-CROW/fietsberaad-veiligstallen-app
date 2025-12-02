import React, { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';

const LOCALSTORAGE_KEY = 'tablesDiff_tableNames';

type Warning = {
  message: string;
  rowCount: number;
  limit: number;
};

type CheckpointData = {
  legacy?: Record<string, any[]>;
  new?: Record<string, any[]>;
  warnings?: {
    legacy?: Record<string, Warning>;
    new?: Record<string, Warning>;
  };
};

type DiffData = {
  legacy?: {
    [tableName: string]: Array<{
      id: string | number;
      status: 'inserted' | 'modified' | 'deleted';
      data: Record<string, any>;
    }>;
  };
  new?: {
    [tableName: string]: Array<{
      id: string | number;
      status: 'inserted' | 'modified' | 'deleted';
      data: Record<string, any>;
    }>;
  };
  warnings?: {
    legacy?: Record<string, Warning>;
    new?: Record<string, Warning>;
  };
};

const TablesDiff: React.FC = () => {
  const { data: session } = useSession();
  const [tableNames, setTableNames] = useState<string>('');
  const [checkpointData, setCheckpointData] = useState<CheckpointData | null>(null);
  const [diffData, setDiffData] = useState<DiffData | null>(null);
  const [isLoadingCheckpoint, setIsLoadingCheckpoint] = useState(false);
  const [isLoadingDiff, setIsLoadingDiff] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load table names from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem(LOCALSTORAGE_KEY);
    if (saved) {
      setTableNames(saved);
    }
  }, []);

  // Save table names to localStorage when changed
  const handleTableNamesChange = (value: string) => {
    setTableNames(value);
    localStorage.setItem(LOCALSTORAGE_KEY, value);
  };

  const handleStartCheckpoint = async () => {
    if (!tableNames.trim()) {
      setError('Please enter at least one table name');
      return;
    }

    const tables = tableNames
      .split(',')
      .map((t) => t.trim())
      .filter((t) => t.length > 0);

    if (tables.length === 0 || tables.length > 5) {
      setError('Please enter 1-5 table names (comma-separated)');
      return;
    }

    setIsLoadingCheckpoint(true);
    setError(null);

    try {
      const response = await fetch('/api/protected/test/checkpoint', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ tables }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to create checkpoint');
      }

      setCheckpointData(data);
      setDiffData(null); // Clear previous diff
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create checkpoint');
      console.error('Error creating checkpoint:', err);
    } finally {
      setIsLoadingCheckpoint(false);
    }
  };

  const handleGetDiff = async () => {
    const tables = tableNames
      .split(',')
      .map((t) => t.trim())
      .filter((t) => t.length > 0);

    if (tables.length === 0 || tables.length > 5) {
      setError('Please enter 1-5 table names (comma-separated)');
      return;
    }

    setIsLoadingDiff(true);
    setError(null);

    try {
      const response = await fetch('/api/protected/test/diff', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ tables }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to get diff');
      }

      setDiffData(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to get diff');
      console.error('Error getting diff:', err);
    } finally {
      setIsLoadingDiff(false);
    }
  };

  const handleReset = async () => {
    setIsResetting(true);
    setError(null);

    try {
      const response = await fetch('/api/protected/test/reset', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to reset checkpoint');
      }

      setCheckpointData(null);
      setDiffData(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reset checkpoint');
      console.error('Error resetting checkpoint:', err);
    } finally {
      setIsResetting(false);
    }
  };

  const formatJson = (obj: any): string => {
    return JSON.stringify(obj, null, 2);
  };

  const getAllTableNames = (): string[] => {
    const tables = tableNames
      .split(',')
      .map((t) => t.trim())
      .filter((t) => t.length > 0);

    if (diffData) {
      const legacyTables = diffData.legacy ? Object.keys(diffData.legacy) : [];
      const newTables = diffData.new ? Object.keys(diffData.new) : [];
      return Array.from(new Set([...tables, ...legacyTables, ...newTables]));
    }

    return tables;
  };

  const getWarnings = (): Array<{ type: 'legacy' | 'new'; tableName: string; warning: Warning }> => {
    const warnings: Array<{ type: 'legacy' | 'new'; tableName: string; warning: Warning }> = [];

    if (checkpointData?.warnings) {
      if (checkpointData.warnings.legacy) {
        for (const [tableName, warning] of Object.entries(checkpointData.warnings.legacy)) {
          warnings.push({ type: 'legacy', tableName, warning });
        }
      }
      if (checkpointData.warnings.new) {
        for (const [tableName, warning] of Object.entries(checkpointData.warnings.new)) {
          warnings.push({ type: 'new', tableName, warning });
        }
      }
    }

    if (diffData?.warnings) {
      if (diffData.warnings.legacy) {
        for (const [tableName, warning] of Object.entries(diffData.warnings.legacy)) {
          warnings.push({ type: 'legacy', tableName, warning });
        }
      }
      if (diffData.warnings.new) {
        for (const [tableName, warning] of Object.entries(diffData.warnings.new)) {
          warnings.push({ type: 'new', tableName, warning });
        }
      }
    }

    return warnings;
  };

  if (!session) {
    return (
      <div className="p-4">
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
          Please log in to access the tables diff page.
        </div>
      </div>
    );
  }

  const warnings = getWarnings();
  const allTables = getAllTableNames();

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-4">Database Tables Diff</h1>

      {/* Table names input */}
      <div className="mb-4">
        <label htmlFor="tableNames" className="block text-sm font-medium text-gray-700 mb-2">
          Table Names (comma-separated, 1-5 tables)
        </label>
        <input
          id="tableNames"
          type="text"
          value={tableNames}
          onChange={(e) => handleTableNamesChange(e.target.value)}
          placeholder="table1, table2, table3"
          className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        />
      </div>

      {/* Action buttons */}
      <div className="mb-4 flex gap-2">
        <button
          onClick={handleStartCheckpoint}
          disabled={isLoadingCheckpoint}
          className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoadingCheckpoint ? 'Creating Checkpoint...' : 'Start Checkpoint'}
        </button>
        <button
          onClick={handleGetDiff}
          disabled={isLoadingDiff}
          className="bg-green-500 hover:bg-green-700 text-white font-bold py-2 px-4 rounded disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoadingDiff ? 'Getting Diff...' : 'Get Current Diff'}
        </button>
        <button
          onClick={handleReset}
          disabled={isResetting}
          className="bg-red-500 hover:bg-red-700 text-white font-bold py-2 px-4 rounded disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isResetting ? 'Resetting...' : 'Reset State'}
        </button>
      </div>

      {/* Error message */}
      {error && (
        <div className="mb-4 bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
          {error}
        </div>
      )}

      {/* Warnings */}
      {warnings.length > 0 && (
        <div className="mb-4 bg-yellow-100 border border-yellow-400 text-yellow-700 px-4 py-3 rounded">
          <h3 className="font-bold mb-2">Warnings:</h3>
          <ul className="list-disc list-inside">
            {warnings.map((w, idx) => (
              <li key={idx}>
                Table '{w.tableName}' ({w.type} database) has {w.warning.rowCount} rows, but only{' '}
                {w.warning.limit} rows are cached. Some changes may not be detected.
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Diff table */}
      {allTables.length > 0 && (
        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse border border-gray-300">
            <thead>
              <tr className="bg-gray-100">
                <th className="border border-gray-300 px-4 py-2 text-left font-semibold">Table Name</th>
                <th className="border border-gray-300 px-4 py-2 text-left font-semibold">New System Changes</th>
                <th className="border border-gray-300 px-4 py-2 text-left font-semibold">Legacy Changes</th>
              </tr>
            </thead>
            <tbody>
              {allTables.map((tableName) => {
                const legacyDiff = diffData?.legacy?.[tableName] || [];
                const newDiff = diffData?.new?.[tableName] || [];

                return (
                  <tr key={tableName}>
                    <td className="border border-gray-300 px-4 py-2 font-medium">{tableName}</td>
                    <td className="border border-gray-300 px-4 py-2">
                      {newDiff.length > 0 ? (
                        <pre className="text-xs bg-gray-50 p-2 rounded overflow-auto max-h-96">
                          {formatJson(newDiff)}
                        </pre>
                      ) : (
                        <span className="text-gray-400">No changes</span>
                      )}
                    </td>
                    <td className="border border-gray-300 px-4 py-2">
                      {legacyDiff.length > 0 ? (
                        <pre className="text-xs bg-gray-50 p-2 rounded overflow-auto max-h-96">
                          {formatJson(legacyDiff)}
                        </pre>
                      ) : (
                        <span className="text-gray-400">No changes</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {allTables.length === 0 && !isLoadingCheckpoint && !isLoadingDiff && (
        <div className="text-gray-500 mt-4">Enter table names and create a checkpoint to see diffs.</div>
      )}
    </div>
  );
};

export default TablesDiff;

