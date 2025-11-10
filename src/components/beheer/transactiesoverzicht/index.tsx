import React, { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useGemeentenInLijst } from '~/hooks/useGemeenten';
import { useExploitanten } from '~/hooks/useExploitanten';
import { useFietsenstallingtypen } from '~/hooks/useFietsenstallingtypen';
import type { ParkingDetailsType } from '~/types/parking';

// Interval durations constant - can be changed later to be user-configurable
const INTERVAL_DURATIONS = [24]; // Two 12-hour intervals per day

interface TransactionIntervalData {
  date: string;
  startTime: string;
  transactionsStarted: number;
  transactionsClosed: number;
  openTransactionsAtStart: number;
  openTransactionsByDuration?: {
    duration_leq_1h: number;
    duration_1_3h: number;
    duration_3_6h: number;
    duration_6_9h: number;
    duration_9_13h: number;
    duration_13_18h: number;
    duration_18_24h: number;
    duration_24_36h: number;
    duration_36_48h: number;
    duration_48h_1w: number;
    duration_1w_2w: number;
    duration_2w_3w: number;
    duration_gt_3w: number;
  };
}

interface Settings {
  contactID: string | null;
  locationID: string | null;
  year: number;
  intervalDurations: number[];
  section?: 'overview' | 'parkeerduur';
}

const TransactiesOverzichtComponent: React.FC = () => {
  const { data: session } = useSession();
  const { gemeenten } = useGemeentenInLijst();
  const { exploitanten } = useExploitanten();
  const { fietsenstallingtypen } = useFietsenstallingtypen();

  const [selectedContactID, setSelectedContactID] = useState<string | null>(null);
  const [selectedParkingType, setSelectedParkingType] = useState<string>('all');
  const [selectedLocationID, setSelectedLocationID] = useState<string | null>(null);
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [selectedSection, setSelectedSection] = useState<'overview' | 'parkeerduur'>('overview');
  const [parkingLocations, setParkingLocations] = useState<ParkingDetailsType[]>([]);
  const [filteredParkingLocations, setFilteredParkingLocations] = useState<ParkingDetailsType[]>([]);
  const [transactionData, setTransactionData] = useState<TransactionIntervalData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  const isFietsberaad = session?.user?.mainContactId === "1";

  // Storage key for filter settings
  const STORAGE_KEY = 'VS_transactiesoverzicht_filterState';

  // Load initial state from localStorage (only once on mount)
  useEffect(() => {
    const savedState = localStorage.getItem(STORAGE_KEY);
    if (savedState) {
      try {
        const parsed = JSON.parse(savedState);
        if (parsed.selectedContactID) setSelectedContactID(parsed.selectedContactID);
        if (parsed.selectedParkingType) setSelectedParkingType(parsed.selectedParkingType);
        if (parsed.selectedLocationID) setSelectedLocationID(parsed.selectedLocationID);
        if (parsed.selectedYear) setSelectedYear(parsed.selectedYear);
      } catch (e) {
        console.warn('Failed to parse saved filter state:', e);
      }
    } else {
      // Only set default contact ID if no saved state exists
      if (session?.user?.mainContactId && !isFietsberaad) {
        setSelectedContactID(session.user.mainContactId);
      }
    }
  }, []); // Empty dependency array - only run once on mount

  // Generate years from 2000 to current year (descending)
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: currentYear - 1999 }, (_, i) => currentYear - i);

  // Combine contacts for selection and sort ascending
  const contacts = [
    { ID: "1", CompanyName: "Fietsberaad" },
    ...(gemeenten || []).map(gemeente => ({ ID: gemeente.ID, CompanyName: gemeente.CompanyName || "Gemeente " + gemeente.ID })),
    ...(exploitanten || []).map(exploitant => ({ ID: exploitant.ID, CompanyName: exploitant.CompanyName || "Exploitant " + exploitant.ID }))
  ].sort((a, b) => a.CompanyName.localeCompare(b.CompanyName));

  // Save filter state to localStorage whenever it changes
  useEffect(() => {
    const stateToSave = {
      selectedContactID,
      selectedParkingType,
      selectedLocationID,
      selectedYear
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stateToSave));
  }, [selectedContactID, selectedParkingType, selectedLocationID, selectedYear]);

  // Fetch parking locations when contact or parking type changes
  useEffect(() => {
    const fetchParkingLocations = async () => {
      if (!selectedContactID) {
        setParkingLocations([]);
        setFilteredParkingLocations([]);
        return;
      }

      try {
        const response = await fetch(`/api/protected/fietsenstallingen?GemeenteID=${selectedContactID}`);
        const json = await response.json();
        if (json.data) {
          setParkingLocations(json.data);
        }
      } catch (err) {
        console.error('Error fetching parking locations:', err);
        setParkingLocations([]);
      }
    };

    fetchParkingLocations();
  }, [selectedContactID]);

  // Filter parking locations by type and sort ascending
  useEffect(() => {
    let filtered = selectedParkingType === 'all' 
      ? parkingLocations 
      : parkingLocations.filter(p => p.Type === selectedParkingType);
    
    // Sort by Title ascending
    filtered = filtered.sort((a, b) => (a.Title || '').localeCompare(b.Title || ''));
    setFilteredParkingLocations(filtered);
  }, [parkingLocations, selectedParkingType]);

  // Fetch transaction data
  const handleFetchData = async () => {
    if (!selectedLocationID) {
      setError('Selecteer een stalling');
      return;
    }

    setLoading(true);
    setError(null);

    const settings: Settings = {
      contactID: selectedContactID,
      locationID: selectedLocationID,
      year: selectedYear,
      intervalDurations: INTERVAL_DURATIONS,
      section: selectedSection
    };

    try {
      const response = await fetch('/api/reports/transacties_voltooid', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(settings)
      });

      if (!response.ok) {
        throw new Error(`Error: ${response.statusText}`);
      }

      const data = await response.json();
      
      // Handle different response formats
      let intervals: TransactionIntervalData[];
      let durations: Array<{ date: string; startTime: string; durationHours: number }> = [];
      
      if (selectedSection === 'parkeerduur' && data.intervals && data.durations) {
        intervals = data.intervals;
        durations = data.durations;
      } else {
        intervals = data;
      }
      
      // Filter out future dates
      const today = new Date();
      today.setHours(23, 59, 59, 999); // End of today
      let filteredData = intervals.filter((row: TransactionIntervalData) => {
        const rowDate = new Date(row.date);
        return rowDate <= today;
      });
      
      // Calculate duration buckets on client side for parkeerduur section
      if (selectedSection === 'parkeerduur' && durations.length > 0) {
        // Helper function to get duration bucket key
        const getDurationBucket = (hours: number): keyof TransactionIntervalData['openTransactionsByDuration'] => {
          if (hours <= 1) return 'duration_leq_1h';
          if (hours <= 3) return 'duration_1_3h';
          if (hours <= 6) return 'duration_3_6h';
          if (hours <= 9) return 'duration_6_9h';
          if (hours <= 13) return 'duration_9_13h';
          if (hours <= 18) return 'duration_13_18h';
          if (hours <= 24) return 'duration_18_24h';
          if (hours <= 36) return 'duration_24_36h';
          if (hours <= 48) return 'duration_36_48h';
          if (hours <= 168) return 'duration_48h_1w';
          if (hours <= 336) return 'duration_1w_2w';
          if (hours <= 504) return 'duration_2w_3w';
          return 'duration_gt_3w';
        };
        
        // Group durations by interval and calculate buckets
        const durationMap = new Map<string, Record<string, number>>();
        
        durations.forEach(d => {
          const key = `${d.date}-${d.startTime}`;
          if (!durationMap.has(key)) {
            durationMap.set(key, {
              duration_leq_1h: 0,
              duration_1_3h: 0,
              duration_3_6h: 0,
              duration_6_9h: 0,
              duration_9_13h: 0,
              duration_13_18h: 0,
              duration_18_24h: 0,
              duration_24_36h: 0,
              duration_36_48h: 0,
              duration_48h_1w: 0,
              duration_1w_2w: 0,
              duration_2w_3w: 0,
              duration_gt_3w: 0
            });
          }
          const bucket = getDurationBucket(d.durationHours);
          const counts = durationMap.get(key)!;
          counts[bucket] = (counts[bucket] || 0) + 1;
        });
        
        // Add duration buckets to filtered data
        filteredData = filteredData.map(row => {
          const key = `${row.date}-${row.startTime}`;
          const buckets = durationMap.get(key);
          return {
            ...row,
            openTransactionsByDuration: buckets || {
              duration_leq_1h: 0,
              duration_1_3h: 0,
              duration_3_6h: 0,
              duration_6_9h: 0,
              duration_9_13h: 0,
              duration_13_18h: 0,
              duration_18_24h: 0,
              duration_24_36h: 0,
              duration_36_48h: 0,
              duration_48h_1w: 0,
              duration_1w_2w: 0,
              duration_2w_3w: 0,
              duration_gt_3w: 0
            }
          };
        });
      }
      
      setTransactionData(filteredData);
    } catch (err) {
      console.error('Error fetching transaction data:', err);
      setError(err instanceof Error ? err.message : 'Fout bij ophalen van data');
    } finally {
      setLoading(false);
    }
  };

  // Handle column sorting
  const handleSort = (column: string) => {
    if (sortColumn === column) {
      // Toggle direction if clicking same column
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      // Set new column and default to ascending
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  // Get sorted data
  const getSortedData = (): TransactionIntervalData[] => {
    if (!sortColumn) return transactionData;

    return [...transactionData].sort((a, b) => {
      let aValue: number | string;
      let bValue: number | string;

      if (sortColumn === 'date' || sortColumn === 'startTime') {
        // Sort by date and time
        const aDateTime = new Date(`${a.date}T${a.startTime}:00`);
        const bDateTime = new Date(`${b.date}T${b.startTime}:00`);
        aValue = aDateTime.getTime();
        bValue = bDateTime.getTime();
      } else if (sortColumn === 'transactionsStarted') {
        aValue = a.transactionsStarted;
        bValue = b.transactionsStarted;
      } else if (sortColumn === 'transactionsClosed') {
        aValue = a.transactionsClosed;
        bValue = b.transactionsClosed;
      } else if (sortColumn === 'openTransactionsAtStart') {
        aValue = a.openTransactionsAtStart;
        bValue = b.openTransactionsAtStart;
      } else if (a.openTransactionsByDuration && b.openTransactionsByDuration) {
        // Duration bucket columns
        const bucketKey = sortColumn as keyof typeof a.openTransactionsByDuration;
        aValue = a.openTransactionsByDuration[bucketKey] || 0;
        bValue = b.openTransactionsByDuration[bucketKey] || 0;
      } else {
        aValue = 0;
        bValue = 0;
      }

      if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  };

  // Generate CSV
  const handleDownloadCSV = () => {
    const sortedData = getSortedData();
    if (sortedData.length === 0) return;

    let headers: string[];
    let rows: string[][];

    if (selectedSection === 'overview') {
      headers = [
        'Datum + Starttijd',
        'Transacties gestart',
        'Transacties gesloten',
        'Open transacties bij start'
      ];

      rows = sortedData.map(row => [
        `${row.date} ${row.startTime}`,
        row.transactionsStarted.toString(),
        row.transactionsClosed.toString(),
        row.openTransactionsAtStart.toString()
      ]);
    } else {
      // Parkeerduur section
      headers = [
        'Datum + Starttijd',
        'Open transacties bij start',
        '≤1u',
        '1-3u',
        '3-6u',
        '6-9u',
        '9-13u',
        '13-18u',
        '18-24u',
        '24-36u',
        '36-48u',
        '48u-1w',
        '1w-2w',
        '2w-3w',
        '>3w'
      ];

      rows = sortedData.map(row => [
        `${row.date} ${row.startTime}`,
        row.openTransactionsAtStart.toString(),
        (row.openTransactionsByDuration?.duration_leq_1h || 0).toString(),
        (row.openTransactionsByDuration?.duration_1_3h || 0).toString(),
        (row.openTransactionsByDuration?.duration_3_6h || 0).toString(),
        (row.openTransactionsByDuration?.duration_6_9h || 0).toString(),
        (row.openTransactionsByDuration?.duration_9_13h || 0).toString(),
        (row.openTransactionsByDuration?.duration_13_18h || 0).toString(),
        (row.openTransactionsByDuration?.duration_18_24h || 0).toString(),
        (row.openTransactionsByDuration?.duration_24_36h || 0).toString(),
        (row.openTransactionsByDuration?.duration_36_48h || 0).toString(),
        (row.openTransactionsByDuration?.duration_48h_1w || 0).toString(),
        (row.openTransactionsByDuration?.duration_1w_2w || 0).toString(),
        (row.openTransactionsByDuration?.duration_2w_3w || 0).toString(),
        (row.openTransactionsByDuration?.duration_gt_3w || 0).toString()
      ]);
    }

    const csvContent = [
      headers.map(h => `"${h.replace(/"/g, '""')}"`).join(','),
      ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `transacties_overzicht_${selectedYear}_${selectedLocationID}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-4">Transacties Overzicht</h1>

      <div className="mb-6 space-y-4">
        {/* Contact Selection (only for Fietsberaad) */}
        {isFietsberaad && (
          <div className="flex flex-col">
            <label htmlFor="contact" className="text-sm font-medium text-gray-700 mb-1">
              Contact
            </label>
            <select
              id="contact"
              className="min-w-56 h-10 p-2 border-2 border-gray-300 rounded-md"
              value={selectedContactID || ''}
              onChange={(e) => {
                setSelectedContactID(e.target.value || null);
                setSelectedLocationID(null);
              }}
            >
              <option value="">Geen</option>
              {contacts.map(contact => (
                <option key={contact.ID} value={contact.ID}>
                  {contact.CompanyName}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Parking Type Selection */}
        <div className="flex flex-col">
          <label htmlFor="parkingType" className="text-sm font-medium text-gray-700 mb-1">
            Type Stalling
          </label>
          <select
            id="parkingType"
            className="min-w-56 h-10 p-2 border-2 border-gray-300 rounded-md"
            value={selectedParkingType}
            onChange={(e) => {
              setSelectedParkingType(e.target.value);
              setSelectedLocationID(null);
            }}
          >
            <option value="all">Alle types</option>
            {fietsenstallingtypen
              ?.slice()
              .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
              .map(type => (
                <option key={type.id} value={type.id}>
                  {type.name}
                </option>
              ))}
          </select>
        </div>

        {/* Parking Location Selection */}
        <div className="flex flex-col">
          <label htmlFor="location" className="text-sm font-medium text-gray-700 mb-1">
            Stalling
          </label>
          <select
            id="location"
            className="min-w-56 h-10 p-2 border-2 border-gray-300 rounded-md"
            value={selectedLocationID || ''}
            onChange={(e) => setSelectedLocationID(e.target.value || null)}
            disabled={!selectedContactID || filteredParkingLocations.length === 0}
          >
            <option value="">Selecteer een stalling</option>
            {filteredParkingLocations.map(location => (
              <option key={location.ID} value={location.StallingsID || ''}>
                {location.Title}
              </option>
            ))}
          </select>
        </div>

        {/* Year Selection */}
        <div className="flex flex-col">
          <label htmlFor="year" className="text-sm font-medium text-gray-700 mb-1">
            Jaar
          </label>
          <select
            id="year"
            className="min-w-56 h-10 p-2 border-2 border-gray-300 rounded-md"
            value={selectedYear}
            onChange={(e) => setSelectedYear(Number(e.target.value))}
          >
            {years.map(year => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </select>
        </div>

        {/* Section Selection */}
        <div className="flex flex-col">
          <label htmlFor="section" className="text-sm font-medium text-gray-700 mb-1">
            Sectie
          </label>
          <select
            id="section"
            className="min-w-56 h-10 p-2 border-2 border-gray-300 rounded-md"
            value={selectedSection}
            onChange={(e) => {
              setSelectedSection(e.target.value as 'overview' | 'parkeerduur');
              setTransactionData([]); // Clear data when switching sections
            }}
          >
            <option value="overview">Transactie Overzicht</option>
            <option value="parkeerduur">Parkeerduur</option>
          </select>
        </div>
      </div>

      {/* Data Section */}
      <div className="mt-6">
        <h2 className="text-xl font-semibold mb-4">
          {selectedSection === 'overview' ? 'Transactie Overzicht' : 'Parkeerduur'}
        </h2>
        <div className="mb-4 flex gap-2">
          <button
            onClick={handleFetchData}
            disabled={loading || !selectedLocationID}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            {loading ? 'Laden...' : 'Go'}
          </button>
          {transactionData.length > 0 && (
            <button
              onClick={handleDownloadCSV}
              className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
            >
              Download CSV
            </button>
          )}
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
            {error}
          </div>
        )}

        {transactionData.length > 0 && selectedSection === 'overview' && (
          <div className="overflow-x-auto">
            <div className="max-h-[600px] overflow-y-auto border border-gray-300">
              <table className="min-w-full border-collapse">
                <thead className="sticky top-0 bg-gray-100 z-10">
                  <tr>
                    <th 
                      className="border border-gray-300 px-4 py-2 text-left cursor-pointer hover:bg-gray-200 select-none bg-gray-100"
                      onClick={() => handleSort('date')}
                    >
                      Datum + Starttijd {sortColumn === 'date' && (sortDirection === 'asc' ? '↑' : '↓')}
                    </th>
                    <th 
                      className="border border-gray-300 px-4 py-2 text-right cursor-pointer hover:bg-gray-200 select-none bg-gray-100"
                      onClick={() => handleSort('transactionsStarted')}
                    >
                      Transacties gestart {sortColumn === 'transactionsStarted' && (sortDirection === 'asc' ? '↑' : '↓')}
                    </th>
                    <th 
                      className="border border-gray-300 px-4 py-2 text-right cursor-pointer hover:bg-gray-200 select-none bg-gray-100"
                      onClick={() => handleSort('transactionsClosed')}
                    >
                      Transacties gesloten {sortColumn === 'transactionsClosed' && (sortDirection === 'asc' ? '↑' : '↓')}
                    </th>
                    <th 
                      className="border border-gray-300 px-4 py-2 text-right cursor-pointer hover:bg-gray-200 select-none bg-gray-100"
                      onClick={() => handleSort('openTransactionsAtStart')}
                    >
                      Open transacties bij start {sortColumn === 'openTransactionsAtStart' && (sortDirection === 'asc' ? '↑' : '↓')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {getSortedData().map((row, index) => (
                    <tr key={index} className="hover:bg-gray-50">
                      <td className="border border-gray-300 px-4 py-2">{row.date} {row.startTime}</td>
                      <td className="border border-gray-300 px-4 py-2 text-right">{row.transactionsStarted}</td>
                      <td className="border border-gray-300 px-4 py-2 text-right">{row.transactionsClosed}</td>
                      <td className="border border-gray-300 px-4 py-2 text-right">{row.openTransactionsAtStart}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {transactionData.length > 0 && selectedSection === 'parkeerduur' && (
          <div className="overflow-x-auto">
            <div className="max-h-[600px] overflow-y-auto border border-gray-300">
              <table className="min-w-full border-collapse">
                <thead className="sticky top-0 bg-gray-100 z-10">
                  <tr>
                    <th 
                      className="border border-gray-300 px-4 py-2 text-left cursor-pointer hover:bg-gray-200 select-none bg-gray-100"
                      onClick={() => handleSort('date')}
                    >
                      Datum + Starttijd {sortColumn === 'date' && (sortDirection === 'asc' ? '↑' : '↓')}
                    </th>
                    <th 
                      className="border border-gray-300 px-4 py-2 text-right cursor-pointer hover:bg-gray-200 select-none bg-gray-100"
                      onClick={() => handleSort('openTransactionsAtStart')}
                    >
                      Open transacties bij start {sortColumn === 'openTransactionsAtStart' && (sortDirection === 'asc' ? '↑' : '↓')}
                    </th>
                    <th 
                      className="border border-gray-300 px-4 py-2 text-right cursor-pointer hover:bg-gray-200 select-none bg-gray-100"
                      onClick={() => handleSort('duration_leq_1h')}
                    >
                      ≤1u {sortColumn === 'duration_leq_1h' && (sortDirection === 'asc' ? '↑' : '↓')}
                    </th>
                    <th 
                      className="border border-gray-300 px-4 py-2 text-right cursor-pointer hover:bg-gray-200 select-none bg-gray-100"
                      onClick={() => handleSort('duration_1_3h')}
                    >
                      1-3u {sortColumn === 'duration_1_3h' && (sortDirection === 'asc' ? '↑' : '↓')}
                    </th>
                    <th 
                      className="border border-gray-300 px-4 py-2 text-right cursor-pointer hover:bg-gray-200 select-none bg-gray-100"
                      onClick={() => handleSort('duration_3_6h')}
                    >
                      3-6u {sortColumn === 'duration_3_6h' && (sortDirection === 'asc' ? '↑' : '↓')}
                    </th>
                    <th 
                      className="border border-gray-300 px-4 py-2 text-right cursor-pointer hover:bg-gray-200 select-none bg-gray-100"
                      onClick={() => handleSort('duration_6_9h')}
                    >
                      6-9u {sortColumn === 'duration_6_9h' && (sortDirection === 'asc' ? '↑' : '↓')}
                    </th>
                    <th 
                      className="border border-gray-300 px-4 py-2 text-right cursor-pointer hover:bg-gray-200 select-none bg-gray-100"
                      onClick={() => handleSort('duration_9_13h')}
                    >
                      9-13u {sortColumn === 'duration_9_13h' && (sortDirection === 'asc' ? '↑' : '↓')}
                    </th>
                    <th 
                      className="border border-gray-300 px-4 py-2 text-right cursor-pointer hover:bg-gray-200 select-none bg-gray-100"
                      onClick={() => handleSort('duration_13_18h')}
                    >
                      13-18u {sortColumn === 'duration_13_18h' && (sortDirection === 'asc' ? '↑' : '↓')}
                    </th>
                    <th 
                      className="border border-gray-300 px-4 py-2 text-right cursor-pointer hover:bg-gray-200 select-none bg-gray-100"
                      onClick={() => handleSort('duration_18_24h')}
                    >
                      18-24u {sortColumn === 'duration_18_24h' && (sortDirection === 'asc' ? '↑' : '↓')}
                    </th>
                    <th 
                      className="border border-gray-300 px-4 py-2 text-right cursor-pointer hover:bg-gray-200 select-none bg-gray-100"
                      onClick={() => handleSort('duration_24_36h')}
                    >
                      24-36u {sortColumn === 'duration_24_36h' && (sortDirection === 'asc' ? '↑' : '↓')}
                    </th>
                    <th 
                      className="border border-gray-300 px-4 py-2 text-right cursor-pointer hover:bg-gray-200 select-none bg-gray-100"
                      onClick={() => handleSort('duration_36_48h')}
                    >
                      36-48u {sortColumn === 'duration_36_48h' && (sortDirection === 'asc' ? '↑' : '↓')}
                    </th>
                    <th 
                      className="border border-gray-300 px-4 py-2 text-right cursor-pointer hover:bg-gray-200 select-none bg-gray-100"
                      onClick={() => handleSort('duration_48h_1w')}
                    >
                      48u-1w {sortColumn === 'duration_48h_1w' && (sortDirection === 'asc' ? '↑' : '↓')}
                    </th>
                    <th 
                      className="border border-gray-300 px-4 py-2 text-right cursor-pointer hover:bg-gray-200 select-none bg-gray-100"
                      onClick={() => handleSort('duration_1w_2w')}
                    >
                      1w-2w {sortColumn === 'duration_1w_2w' && (sortDirection === 'asc' ? '↑' : '↓')}
                    </th>
                    <th 
                      className="border border-gray-300 px-4 py-2 text-right cursor-pointer hover:bg-gray-200 select-none bg-gray-100"
                      onClick={() => handleSort('duration_2w_3w')}
                    >
                      2w-3w {sortColumn === 'duration_2w_3w' && (sortDirection === 'asc' ? '↑' : '↓')}
                    </th>
                    <th 
                      className="border border-gray-300 px-4 py-2 text-right cursor-pointer hover:bg-gray-200 select-none bg-gray-100"
                      onClick={() => handleSort('duration_gt_3w')}
                    >
                      >3w {sortColumn === 'duration_gt_3w' && (sortDirection === 'asc' ? '↑' : '↓')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {getSortedData().map((row, index) => (
                    <tr key={index} className="hover:bg-gray-50">
                      <td className="border border-gray-300 px-4 py-2">{row.date} {row.startTime}</td>
                      <td className="border border-gray-300 px-4 py-2 text-right">{row.openTransactionsAtStart}</td>
                      <td className="border border-gray-300 px-4 py-2 text-right">{row.openTransactionsByDuration?.duration_leq_1h || 0}</td>
                      <td className="border border-gray-300 px-4 py-2 text-right">{row.openTransactionsByDuration?.duration_1_3h || 0}</td>
                      <td className="border border-gray-300 px-4 py-2 text-right">{row.openTransactionsByDuration?.duration_3_6h || 0}</td>
                      <td className="border border-gray-300 px-4 py-2 text-right">{row.openTransactionsByDuration?.duration_6_9h || 0}</td>
                      <td className="border border-gray-300 px-4 py-2 text-right">{row.openTransactionsByDuration?.duration_9_13h || 0}</td>
                      <td className="border border-gray-300 px-4 py-2 text-right">{row.openTransactionsByDuration?.duration_13_18h || 0}</td>
                      <td className="border border-gray-300 px-4 py-2 text-right">{row.openTransactionsByDuration?.duration_18_24h || 0}</td>
                      <td className="border border-gray-300 px-4 py-2 text-right">{row.openTransactionsByDuration?.duration_24_36h || 0}</td>
                      <td className="border border-gray-300 px-4 py-2 text-right">{row.openTransactionsByDuration?.duration_36_48h || 0}</td>
                      <td className="border border-gray-300 px-4 py-2 text-right">{row.openTransactionsByDuration?.duration_48h_1w || 0}</td>
                      <td className="border border-gray-300 px-4 py-2 text-right">{row.openTransactionsByDuration?.duration_1w_2w || 0}</td>
                      <td className="border border-gray-300 px-4 py-2 text-right">{row.openTransactionsByDuration?.duration_2w_3w || 0}</td>
                      <td className="border border-gray-300 px-4 py-2 text-right">{row.openTransactionsByDuration?.duration_gt_3w || 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default TransactiesOverzichtComponent;

