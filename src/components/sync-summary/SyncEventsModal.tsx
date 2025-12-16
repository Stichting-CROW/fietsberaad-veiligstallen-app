import React, { useState, useEffect, useCallback, useMemo } from 'react';
import type { SyncEvent } from '~/pages/api/protected/sync-summary/sync-events';

interface SyncEventsModalProps {
  isOpen: boolean;
  onClose: () => void;
  stallingId: string;
  dataOwnerName: string | null;
  stallingName: string;
}

type SortField = 'sectionName' | 'transactionDate' | 'ageInDays';
type SortDirection = 'asc' | 'desc';

const SyncEventsModal: React.FC<SyncEventsModalProps> = ({
  isOpen,
  onClose,
  stallingId,
  dataOwnerName,
  stallingName
}) => {
  const [events, setEvents] = useState<SyncEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sortField, setSortField] = useState<SortField>('transactionDate');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  const fetchSyncEvents = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/protected/sync-summary/sync-events?stallingId=${stallingId}`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      const data = await response.json();
      setEvents(data.data || []);
    } catch (err) {
      console.error('Error fetching sync events:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [stallingId]);

  useEffect(() => {
    if (isOpen && stallingId) {
      fetchSyncEvents();
    }
  }, [isOpen, stallingId, fetchSyncEvents]);

  const formatDate = (date: Date | null): string => {
    if (!date) return '-';
    return new Date(date).toLocaleString('nl-NL', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'UTC'
    });
  };

  const formatAge = (days: number | null): string => {
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

  interface GroupedEvent {
    transactionDate: Date | null;
    sectionNames: string[];
    ageInDays: number | null;
  }

  const groupedEvents = useMemo(() => {
    const grouped = new Map<string, GroupedEvent>();

    events.forEach(event => {
      let dateKey = 'null';
      if (event.transactionDate) {
        const date = new Date(event.transactionDate);
        // Group by year, month, day, hour, minute (ignore seconds)
        dateKey = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}_${String(date.getUTCHours()).padStart(2, '0')}-${String(date.getUTCMinutes()).padStart(2, '0')}`;
      }
      
      if (!grouped.has(dateKey)) {
        grouped.set(dateKey, {
          transactionDate: event.transactionDate,
          sectionNames: [],
          ageInDays: event.ageInDays
        });
      }

      const groupedEvent = grouped.get(dateKey)!;
      if (event.sectionName && !groupedEvent.sectionNames.includes(event.sectionName)) {
        groupedEvent.sectionNames.push(event.sectionName);
      }
    });

    return Array.from(grouped.values());
  }, [events]);

  const uniqueSections = useMemo(() => {
    const sections = new Set(events.map(e => e.sectionName).filter(Boolean));
    return sections;
  }, [events]);

  const hasMultipleSections = uniqueSections.size > 1;

  const sortedGroupedEvents = useMemo(() => {
    const sorted = [...groupedEvents];
    sorted.sort((a, b) => {
      let comparison = 0;

      // Primary sort
      if (sortField === 'transactionDate') {
        const dateA = a.transactionDate ? new Date(a.transactionDate).getTime() : 0;
        const dateB = b.transactionDate ? new Date(b.transactionDate).getTime() : 0;
        comparison = dateA - dateB;
      } else if (sortField === 'ageInDays') {
        const ageA = a.ageInDays ?? Infinity;
        const ageB = b.ageInDays ?? Infinity;
        comparison = ageA - ageB;
      }

      // Secondary sort: if primary values are equal, sort by sectionName (ascending)
      if (comparison === 0) {
        const sectionsA = a.sectionNames.sort().join(', ');
        const sectionsB = b.sectionNames.sort().join(', ');
        comparison = sectionsA.localeCompare(sectionsB);
      }

      return sortDirection === 'asc' ? comparison : -comparison;
    });

    return sorted;
  }, [groupedEvents, sortField, sortDirection]);

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

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto" aria-labelledby="modal-title" role="dialog" aria-modal="true">
      <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
        <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" onClick={onClose}></div>
        <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>
        <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-4xl sm:w-full" style={{ maxHeight: '80vh' }}>
          <div className="bg-white flex flex-col h-full max-h-[80vh]">
            <div className="px-4 pt-5 pb-4 sm:p-6 sm:pb-4 flex-shrink-0">
              <div className="flex items-start justify-between mb-4">
                <h3 className="text-lg leading-6 font-medium text-gray-900" id="modal-title">
                  {dataOwnerName && `${dataOwnerName} / `}{stallingName}
                </h3>
                <button
                  type="button"
                  className="ml-4 -mt-1 -mr-1 text-gray-400 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 rounded-md p-1"
                  onClick={onClose}
                  aria-label="Sluiten"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              {error && (
                <div className="mb-4 bg-red-50 border border-red-200 rounded-md p-4">
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
            </div>
            <div className="flex-1 overflow-y-auto px-4 pb-4 sm:px-6 sm:pb-6 min-h-0">
              {loading ? (
                <div className="text-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto"></div>
                  <p className="mt-2 text-gray-600">Laden...</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th 
                            className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 select-none"
                            onClick={() => handleSort('transactionDate')}
                          >
                            <div className="flex items-center">
                              Transactiedatum
                              <SortIcon field="transactionDate" />
                            </div>
                          </th>
                          {hasMultipleSections && (
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              Sectienaam
                            </th>
                          )}
                          <th 
                            className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 select-none"
                            onClick={() => handleSort('ageInDays')}
                          >
                            <div className="flex items-center">
                              Leeftijd
                              <SortIcon field="ageInDays" />
                            </div>
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {sortedGroupedEvents.length === 0 ? (
                          <tr>
                            <td colSpan={hasMultipleSections ? 3 : 2} className="px-6 py-4 text-center text-sm text-gray-500">
                              Geen synchronisatie events gevonden
                            </td>
                          </tr>
                        ) : (
                          sortedGroupedEvents.map((groupedEvent, index) => (
                            <tr key={index}>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                {formatDate(groupedEvent.transactionDate)}
                              </td>
                              {hasMultipleSections && (
                                <td className="px-6 py-4 text-sm text-gray-900">
                                  {groupedEvent.sectionNames.sort().join(', ')}
                                </td>
                              )}
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                {formatAge(groupedEvent.ageInDays)}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SyncEventsModal;

