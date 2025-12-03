import React, { useMemo, useState } from 'react';
import type { ControleSummary } from '~/types/sync-summary';

type SortField = 'laatsteSync' | 'dataOwnerName' | 'fietsenstallingName' | 'plaats' | 'ageInDays';
type SortDirection = 'asc' | 'desc';

interface SynchronisatieTableProps {
  data: ControleSummary[];
  onRowClick: (summary: ControleSummary) => void;
  loading?: boolean;
}

const SynchronisatieTable: React.FC<SynchronisatieTableProps> = ({
  data,
  onRowClick,
  loading = false
}) => {
  const [sortField, setSortField] = useState<SortField>('dataOwnerName');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  const formatDate = (date: Date | null | undefined): string => {
    if (!date) return '-';
    return new Date(date).toLocaleString('nl-NL', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatAge = (days: number | null | undefined): string => {
    if (days === null || days === undefined) return '-';
    if (days === 0) return 'Vandaag';
    if (days === 1) return '1 dag';
    return `${days} dagen`;
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const sortedData = useMemo(() => {
    const sorted = [...data];
    sorted.sort((a, b) => {
      let comparison = 0;

      // Primary sort
      if (sortField === 'laatsteSync') {
        const dateA = a.laatsteSync ? new Date(a.laatsteSync).getTime() : 0;
        const dateB = b.laatsteSync ? new Date(b.laatsteSync).getTime() : 0;
        comparison = dateA - dateB;
      } else if (sortField === 'dataOwnerName') {
        comparison = (a.dataOwnerName || '').localeCompare(b.dataOwnerName || '');
      } else if (sortField === 'fietsenstallingName') {
        comparison = (a.fietsenstallingName || '').localeCompare(b.fietsenstallingName || '');
      } else if (sortField === 'plaats') {
        comparison = (a.plaats || '').localeCompare(b.plaats || '');
      } else if (sortField === 'ageInDays') {
        const ageA = a.ageInDays ?? Infinity;
        const ageB = b.ageInDays ?? Infinity;
        comparison = ageA - ageB;
      }

      // Secondary sort: if primary values are equal and not sorting by laatsteSync, sort by laatsteSync (descending)
      if (comparison === 0 && sortField !== 'laatsteSync') {
        const dateA = a.laatsteSync ? new Date(a.laatsteSync).getTime() : 0;
        const dateB = b.laatsteSync ? new Date(b.laatsteSync).getTime() : 0;
        comparison = dateB - dateA; // Descending for secondary sort
      }

      return sortDirection === 'asc' ? comparison : -comparison;
    });

    return sorted;
  }, [data, sortField, sortDirection]);

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) {
      return (
        <span className="ml-1 text-gray-400">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
          </svg>
        </span>
      );
    }
    return (
      <span className="ml-1 text-gray-900">
        {sortDirection === 'asc' ? (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
          </svg>
        ) : (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        )}
      </span>
    );
  };

  return (
    <div className="bg-white shadow overflow-hidden sm:rounded-md">
      <div className="overflow-x-auto max-h-[calc(100vh-300px)] overflow-y-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50 sticky top-0 z-10">
            <tr>
              <th 
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 select-none"
                onClick={() => handleSort('dataOwnerName')}
              >
                <div className="flex items-center">
                  Data-eigenaar
                  <SortIcon field="dataOwnerName" />
                </div>
              </th>
              <th 
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 select-none"
                onClick={() => handleSort('fietsenstallingName')}
              >
                <div className="flex items-center">
                  Fietsenstalling
                  <SortIcon field="fietsenstallingName" />
                </div>
              </th>
              <th 
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 select-none"
                onClick={() => handleSort('plaats')}
              >
                <div className="flex items-center">
                  Plaats
                  <SortIcon field="plaats" />
                </div>
              </th>
              <th 
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 select-none"
                onClick={() => handleSort('laatsteSync')}
              >
                <div className="flex items-center">
                  Laatste Sync
                  <SortIcon field="laatsteSync" />
                </div>
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Leeftijd
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {sortedData.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-4 text-center text-sm text-gray-500">
                  Geen gegevens gevonden
                </td>
              </tr>
            ) : (
              sortedData.map((summary, index) => (
                <tr
                  key={`${summary.aggregationId}-${index}`}
                  onClick={() => onRowClick(summary)}
                  className="hover:bg-gray-50 cursor-pointer"
                >
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {summary.dataOwnerName || '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {summary.fietsenstallingName || summary.aggregationName}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {summary.plaats || '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {summary.laatsteSync ? formatDate(summary.laatsteSync) : '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {formatAge(summary.ageInDays)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default SynchronisatieTable;


