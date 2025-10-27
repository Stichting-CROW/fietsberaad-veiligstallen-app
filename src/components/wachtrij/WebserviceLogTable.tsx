import React, { useState } from 'react';
import type { WebserviceLog } from '~/types/wachtrij';

interface WebserviceLogTableProps {
  data: WebserviceLog[];
}

const JsonDisplay: React.FC<{ json: string | null }> = ({ json }) => {
  if (!json) return <span className="text-gray-400">No data</span>;
  
  try {
    const parsed = JSON.parse(json);
    return (
      <pre className="text-xs bg-gray-50 p-2 rounded overflow-x-auto max-h-96 whitespace-pre-wrap">
        {JSON.stringify(parsed, null, 2)}
      </pre>
    );
  } catch (e) {
    return <span className="text-red-500">Invalid JSON</span>;
  }
};

const WebserviceLogTable: React.FC<WebserviceLogTableProps> = ({ data }) => {
  const [expandedRowId, setExpandedRowId] = useState<number | null>(null);

  const toggleRow = (id: number) => {
    setExpandedRowId(expandedRowId === id ? null : id);
  };

  const formatTimestamp = (date: Date) => {
    return new Date(date).toLocaleString('nl-NL', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  const formatMs = (ms: number | null) => {
    if (ms === null) return '-';
    return `${ms}ms`;
  };

  return (
    <div className="bg-white shadow overflow-hidden sm:rounded-md">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                ID
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Timestamp
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Method
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Bikepark ID
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Log Text
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Duration
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Data
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {data.map((record) => (
              <React.Fragment key={record.ID}>
                <tr className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {record.ID}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {formatTimestamp(record.tijdstip)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {record.method || '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {record.bikeparkID || '-'}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-900 max-w-xs truncate">
                    {record.logtekst}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {formatMs(record.ms)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {record.logtekst2 && (
                      <button
                        onClick={() => toggleRow(record.ID)}
                        className="text-blue-600 hover:text-blue-900"
                      >
                        {expandedRowId === record.ID ? 'Hide Data ▲' : 'View Data ▼'}
                      </button>
                    )}
                    {!record.logtekst2 && (
                      <span className="text-gray-400">No data</span>
                    )}
                  </td>
                </tr>
                {expandedRowId === record.ID && record.logtekst2 && (
                  <tr>
                    <td colSpan={7} className="px-6 py-4 bg-gray-50">
                      <div className="text-sm">
                        <strong>JSON Data:</strong>
                        <div className="mt-2">
                          <JsonDisplay json={record.logtekst2} />
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
      {data.length === 0 && (
        <div className="text-center py-8 text-gray-500">
          No records found
        </div>
      )}
    </div>
  );
};

export default WebserviceLogTable;

