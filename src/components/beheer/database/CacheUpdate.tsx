import React, { useState } from 'react';
import moment from 'moment';

interface CacheUpdateComponentProps {
  title?: string;
}

const CacheUpdateComponent: React.FC<CacheUpdateComponentProps> = ({ title = 'Rapport caches bijwerken' }) => {
  const [startDate, setStartDate] = useState<Date>(() => moment().subtract(2, 'months').toDate());
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [resultMessage, setResultMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const handleUpdate = async () => {
    setIsLoading(true);
    setResultMessage(null);
    setErrorMessage(null);
    setStatusMessage(null);

    try {
      const fromIso = moment(startDate).toISOString();
      const response = await fetch(`/api/protected/database/update-cache?from=${encodeURIComponent(fromIso)}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });

      const json = await response.json();
      const summary = (json?.logEntry && json.logEntry.summaryText) ? json.logEntry.summaryText : (json?.summaryText ?? null);
      if (summary) setStatusMessage(summary);

      if (!response.ok || !json?.success) {
        const msg = json?.error || response.statusText || 'Onbekende fout';
        setErrorMessage(`❌ Fout: ${msg}`);
        return;
      }

      setResultMessage('✅ Rapport caches zijn bijgewerkt.');
    } catch (error) {
      setErrorMessage(`❌ Netwerkfout: ${error instanceof Error ? error.message : 'Onbekende fout'}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="bg-gray-200 border-2 border-gray-400 p-4 rounded mb-4">
      <h2 className="text-xl font-semibold mb-3">{title}</h2>

      <div className="flex flex-col sm:flex-row sm:items-end gap-4">
        <div className="flex flex-col">
          <label className="font-medium mb-1">Vanaf</label>
          <div className="flex flex-row gap-2 align-baseline">
            <input
              type="date"
              value={moment(startDate).format('YYYY-MM-DD')}
              onChange={(e) => setStartDate(moment(e.target.value).toDate())}
              className="p-2 border-2 border-gray-400 rounded-md w-56"
            />
            <button
              onClick={handleUpdate}
              disabled={isLoading}
              className={`h-10 px-4 rounded-md text-white ${isLoading ? 'bg-blue-300' : 'bg-blue-500 hover:bg-blue-700'}`}
            >
              {isLoading ? 'Bezig met bijwerken…' : 'Bijwerken'}
            </button>
          </div>
        </div>
      </div>

      <div className="mt-4 min-h-[1.25rem]">
        {isLoading && (
          <div className="spinner">
            <div className="loader" />
          </div>
        )}
        {!isLoading && resultMessage && (
          <div className="text-green-700 font-semibold">{resultMessage}</div>
        )}
        {!isLoading && errorMessage && (
          <div className="text-red-700 font-semibold">{errorMessage}</div>
        )}
        {!isLoading && statusMessage && (
          <pre className="mt-2 whitespace-pre-wrap text-sm bg-white border border-gray-300 rounded p-2">{statusMessage}</pre>
        )}
      </div>
    </div>
  );
};

export default CacheUpdateComponent;
