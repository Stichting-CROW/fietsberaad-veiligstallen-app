import React, { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/router';
import type {
  WachtrijBetalingen,
  WachtrijPasids,
  WachtrijTransacties,
  WachtrijSync,
  WachtrijResponse,
} from '~/types/wachtrij';

type QueueType = 'transacties' | 'pasids' | 'betalingen' | 'sync';

interface ColumnDef {
  key: string;
  label: string;
  sortable?: boolean;
  render?: (value: unknown, record: Record<string, unknown>) => React.ReactNode;
}

const PAGE_SIZE_OPTIONS = [25, 100, 1000, 10000];

const getColumns = (queueType: QueueType): ColumnDef[] => {
  const baseColumns: ColumnDef[] = [
    { key: 'ID', label: 'ID', sortable: true },
  ];
  switch (queueType) {
    case 'transacties':
      return [
        ...baseColumns,
        { key: 'bikeparkID', label: 'Bikepark ID', sortable: true },
        { key: 'sectionID', label: 'Section ID', sortable: true },
        { key: 'passID', label: 'Pass ID', sortable: true },
        { key: 'type', label: 'Type', sortable: true },
        {
          key: 'transactionDate',
          label: 'Transaction Date',
          sortable: true,
          render: (v) => v ? new Date(v as string).toLocaleString('nl-NL') : '-',
        },
        {
          key: 'processed',
          label: 'Status',
          sortable: true,
          render: (v) => (
            <span
              className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${
                v ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
              }`}
            >
              {v ? 'Processed' : 'Pending'}
            </span>
          ),
        },
        {
          key: 'dateCreated',
          label: 'Created',
          sortable: true,
          render: (v) => (v ? new Date(v as string).toLocaleString('nl-NL') : '-'),
        },
      ];
    case 'pasids':
      return [
        ...baseColumns,
        { key: 'bikeparkID', label: 'Bikepark ID', sortable: true },
        { key: 'passID', label: 'Pass ID', sortable: true },
        { key: 'barcode', label: 'Barcode', sortable: true },
        { key: 'RFID', label: 'RFID', sortable: true },
        {
          key: 'transactionDate',
          label: 'Transaction Date',
          sortable: true,
          render: (v) => (v ? new Date(v as string).toLocaleString('nl-NL') : '-'),
        },
        {
          key: 'processed',
          label: 'Status',
          sortable: true,
          render: (v) => (
            <span
              className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${
                v ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
              }`}
            >
              {v ? 'Processed' : 'Pending'}
            </span>
          ),
        },
        {
          key: 'DateCreated',
          label: 'Created',
          sortable: true,
          render: (v) => (v ? new Date(v as string).toLocaleString('nl-NL') : '-'),
        },
      ];
    case 'betalingen':
      return [
        ...baseColumns,
        { key: 'bikeparkID', label: 'Bikepark ID', sortable: true },
        { key: 'passID', label: 'Pass ID', sortable: true },
        {
          key: 'amount',
          label: 'Amount',
          sortable: true,
          render: (v) => (v != null ? `€${Number(v).toFixed(2)}` : '-'),
        },
        {
          key: 'transactionDate',
          label: 'Transaction Date',
          sortable: true,
          render: (v) => (v ? new Date(v as string).toLocaleString('nl-NL') : '-'),
        },
        {
          key: 'processed',
          label: 'Status',
          sortable: true,
          render: (v) => (
            <span
              className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${
                v ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
              }`}
            >
              {v ? 'Processed' : 'Pending'}
            </span>
          ),
        },
        {
          key: 'dateCreated',
          label: 'Created',
          sortable: true,
          render: (v) => (v ? new Date(v as string).toLocaleString('nl-NL') : '-'),
        },
      ];
    case 'sync':
      return [
        ...baseColumns,
        { key: 'bikeparkID', label: 'Bikepark ID', sortable: true },
        { key: 'sectionID', label: 'Section ID', sortable: true },
        {
          key: 'transactionDate',
          label: 'Transaction Date',
          sortable: true,
          render: (v) => (v ? new Date(v as string).toLocaleString('nl-NL') : '-'),
        },
        {
          key: 'processed',
          label: 'Status',
          sortable: true,
          render: (v) => {
            const statusMap: Record<number, { text: string; cls: string }> = {
              0: { text: 'Pending', cls: 'bg-yellow-100 text-yellow-800' },
              8: { text: 'Processing', cls: 'bg-blue-100 text-blue-800' },
              9: { text: 'Selected', cls: 'bg-indigo-100 text-indigo-800' },
              1: { text: 'Success', cls: 'bg-green-100 text-green-800' },
              2: { text: 'Error', cls: 'bg-red-100 text-red-800' },
            };
            const s = statusMap[v as number] ?? { text: `Unknown (${v})`, cls: 'bg-gray-100 text-gray-800' };
            return (
              <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${s.cls}`}>
                {s.text}
              </span>
            );
          },
        },
        {
          key: 'dateCreated',
          label: 'Created',
          sortable: true,
          render: (v) => (v ? new Date(v as string).toLocaleString('nl-NL') : '-'),
        },
      ];
    default:
      return baseColumns;
  }
};

const WachtrijViewerPage: React.FC = () => {
  const { data: session } = useSession();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<QueueType>('transacties');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<
    | WachtrijResponse<WachtrijTransacties | WachtrijPasids | WachtrijBetalingen | WachtrijSync>
    | null
  >(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [sortBy, setSortBy] = useState<string>('');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  const getDefaultSort = () => {
    switch (activeTab) {
      case 'pasids':
        return 'DateCreated';
      default:
        return 'dateCreated';
    }
  };

  const fetchData = useCallback(async () => {
    if (!session?.user) return;
    setLoading(true);
    setError(null);
    try {
      const orderBy = sortBy || getDefaultSort();
      const params = new URLSearchParams({
        page: page.toString(),
        pageSize: pageSize.toString(),
        sortBy: orderBy,
        sortOrder,
      });
      const res = await fetch(`/api/protected/wachtrij/wachtrij_${activeTab}?${params}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      const json = await res.json();
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [session, activeTab, page, pageSize, sortBy, sortOrder]);

  useEffect(() => {
    if (session) {
      setSortBy('');
      setPage(1);
      fetchData();
    }
  }, [session, activeTab]);

  useEffect(() => {
    if (session) fetchData();
  }, [session, page, pageSize, sortBy, sortOrder, fetchData]);

  const handleSort = (key: string) => {
    setSortBy(key);
    setSortOrder((prev) => (prev === 'asc' && sortBy === key ? 'desc' : 'asc'));
    setPage(1);
  };

  const handlePageSizeChange = (size: number) => {
    setPageSize(size);
    setPage(1);
  };

  const handleTabChange = (tab: QueueType) => {
    setActiveTab(tab);
  };

  if (!session) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="bg-yellow-50 border border-yellow-300 rounded-lg shadow-sm p-6 max-w-2xl mx-auto">
          <h3 className="text-lg font-medium text-yellow-800 mb-2">Inloggen vereist</h3>
          <p className="text-sm text-yellow-700 mb-4">
            U moet ingelogd zijn om deze pagina te bekijken.
          </p>
          <button
            onClick={() => router.push('/')}
            className="inline-flex px-4 py-2 border border-transparent text-sm font-medium rounded-md text-yellow-800 bg-yellow-100 hover:bg-yellow-200"
          >
            Ga naar hoofdpagina
          </button>
        </div>
      </div>
    );
  }

  const columns = getColumns(activeTab);
  const pagination = data?.pagination;
  const records = data?.data ?? [];

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-3xl font-bold text-gray-900">Wachtrij transacties</h1>
        <button
          onClick={() => router.push('/test')}
          className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
        >
          ← Terug naar test
        </button>
      </div>

      {/* Tabs */}
      <div className="mb-4 border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          {(['transacties', 'pasids', 'betalingen', 'sync'] as QueueType[]).map((tab) => (
            <button
              key={tab}
              onClick={() => handleTabChange(tab)}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === tab
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              wachtrij_{tab}
            </button>
          ))}
        </nav>
      </div>

      {error && (
        <div className="mb-6 bg-red-50 border border-red-200 rounded-md p-4 text-red-700">
          {error}
        </div>
      )}

      {/* Page size selector */}
      <div className="mb-4 flex items-center gap-4">
        <label className="text-sm text-gray-700">Records per pagina:</label>
        <select
          value={pageSize}
          onChange={(e) => handlePageSizeChange(Number(e.target.value))}
          disabled={loading}
          className="border border-gray-300 rounded-md px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {PAGE_SIZE_OPTIONS.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </div>

      {/* Table with sticky header */}
      <div className="bg-white shadow overflow-hidden sm:rounded-lg border border-gray-200">
        <div className="overflow-x-auto max-h-[calc(100vh-320px)] overflow-y-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50 sticky top-0 z-10 shadow-sm">
              <tr>
                {columns.map((col) => (
                  <th
                    key={col.key}
                    className={`px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider ${
                      col.sortable ? 'cursor-pointer hover:bg-gray-100 select-none' : ''
                    }`}
                    onClick={() => col.sortable && handleSort(col.key)}
                  >
                    <span className="flex items-center gap-1">
                      {col.label}
                      {col.sortable && sortBy === col.key && (
                        <span className="text-blue-600">
                          {sortOrder === 'asc' ? '↑' : '↓'}
                        </span>
                      )}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {loading ? (
                <tr>
                  <td colSpan={columns.length} className="px-4 py-8 text-center text-gray-500">
                    Laden...
                  </td>
                </tr>
              ) : records.length === 0 ? (
                <tr>
                  <td colSpan={columns.length} className="px-4 py-8 text-center text-gray-500">
                    Geen records gevonden
                  </td>
                </tr>
              ) : (
                records.map((record: Record<string, unknown>) => (
                  <tr key={String(record.ID)} className="hover:bg-gray-50">
                    {columns.map((col) => (
                      <td
                        key={col.key}
                        className="px-4 py-3 whitespace-nowrap text-sm text-gray-900"
                      >
                        {col.render
                          ? col.render(record[col.key], record)
                          : String(record[col.key] ?? '')}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {pagination && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 bg-gray-50">
            <div className="text-sm text-gray-700">
              {(pagination.page - 1) * pagination.pageSize + 1}–
              {Math.min(pagination.page * pagination.pageSize, pagination.total)} van{' '}
              {pagination.total}
              {pagination.totalPages > 1 && (
                <> · Pagina {pagination.page} van {pagination.totalPages}</>
              )}
            </div>
            {pagination.totalPages > 1 && (
            <div className="flex gap-2">
              <button
                onClick={() => setPage(1)}
                disabled={pagination.page <= 1 || loading}
                className="px-3 py-1 text-sm border border-gray-300 rounded-md hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Eerste
              </button>
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={pagination.page <= 1 || loading}
                className="px-3 py-1 text-sm border border-gray-300 rounded-md hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Vorige
              </button>
              <button
                onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
                disabled={pagination.page >= pagination.totalPages || loading}
                className="px-3 py-1 text-sm border border-gray-300 rounded-md hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Volgende
              </button>
              <button
                onClick={() => setPage(pagination.totalPages)}
                disabled={pagination.page >= pagination.totalPages || loading}
                className="px-3 py-1 text-sm border border-gray-300 rounded-md hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Laatste
              </button>
            </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default WachtrijViewerPage;
