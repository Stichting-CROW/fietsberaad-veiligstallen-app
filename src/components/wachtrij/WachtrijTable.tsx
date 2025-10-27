import React, { useState } from 'react';
import type { WachtrijRecord } from '~/types/wachtrij';

interface WachtrijTableProps {
  data: WachtrijRecord[];
  columns: Array<{
    key: string;
    label: string;
    render?: (value: any, record: WachtrijRecord) => React.ReactNode;
  }>;
}

const WachtrijTable: React.FC<WachtrijTableProps> = ({ data, columns }) => {
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());

  const toggleRow = (id: number) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedRows(newExpanded);
  };

  return (
    <div className="bg-white shadow overflow-hidden sm:rounded-md">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              {columns.map((column) => (
                <th
                  key={column.key}
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                >
                  {column.label}
                </th>
              ))}
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {data.map((record) => (
              <React.Fragment key={record.ID}>
                <tr className="hover:bg-gray-50">
                  {columns.map((column) => (
                    <td key={column.key} className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {column.render ? column.render(record[column.key as keyof WachtrijRecord], record) : String(record[column.key as keyof WachtrijRecord] || '')}
                    </td>
                  ))}
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {record.error && (
                      <button
                        onClick={() => toggleRow(record.ID)}
                        className="text-red-600 hover:text-red-900"
                      >
                        {expandedRows.has(record.ID) ? 'Hide Error' : 'Show Error'}
                      </button>
                    )}
                  </td>
                </tr>
                {expandedRows.has(record.ID) && record.error && (
                  <tr>
                    <td colSpan={columns.length + 1} className="px-6 py-4 bg-red-50">
                      <div className="text-sm text-red-800">
                        <strong>Error:</strong> {record.error}
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

export default WachtrijTable;
