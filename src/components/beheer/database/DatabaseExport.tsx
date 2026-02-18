import React, { useState } from 'react';

interface DatabaseExportProps {}

type ExportableTable = 'fietsenstallingen';

const DatabaseExport: React.FC<DatabaseExportProps> = () => {
  const [selectedTable, setSelectedTable] = useState<ExportableTable>('fietsenstallingen');
  const [includeStatistics, setIncludeStatistics] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleExport = async () => {
    setIsExporting(true);
    setError(null);

    try {
      const response = await fetch(`/api/protected/database/export?table=${selectedTable}${includeStatistics ? '&statistics=true' : ''}`);
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Export failed' }));
        throw new Error(errorData.error || `Export failed with status ${response.status}`);
      }

      // Get the CSV content from response
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${selectedTable}_export_${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred during export');
    } finally {
      setIsExporting(false);
    }
  };

  const statisticsLabel = 'Met aantallen transacties';

  return (
    <div className="p-6">
      <h1 className="text-3xl font-bold mb-4">Database Export</h1>
      
      <div className="max-w-2xl space-y-6">
        <div>
          <label htmlFor="table-select" className="block text-sm font-medium text-gray-700 mb-4">
            Selecteer tabel om te exporteren:
          </label>
          <select
            id="table-select"
            value={selectedTable}
            onChange={(e) => setSelectedTable(e.target.value as ExportableTable)}
            className="block rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
            disabled={isExporting}
          >
            <option value="fietsenstallingen">Fietsenstallingen</option>
          </select>
        </div>
        <div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={includeStatistics}
              onChange={(e) => setIncludeStatistics(e.target.checked)}
              disabled={isExporting}
              className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
            />
            <span className="text-sm font-medium text-gray-700">{statisticsLabel}</span>
          </label>
        </div>

        {error && (
          <div className="rounded-md bg-red-50 p-4">
            <div className="text-sm text-red-800">{error}</div>
          </div>
        )}

        <div>
          <button
            onClick={handleExport}
            disabled={isExporting}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isExporting ? (
              <>
                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Exporteren...
              </>
            ) : (
              'Exporteer data'
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default DatabaseExport;

