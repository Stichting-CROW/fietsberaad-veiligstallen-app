import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { useGemeentenInLijst } from '~/hooks/useGemeenten';
import { useExploitanten } from '~/hooks/useExploitanten';
import { useFietsenstallingtypen } from '~/hooks/useFietsenstallingtypen';
import type { ParkingDetailsType } from '~/types/parking';
import Chart from '~/components/beheer/reports/Chart';

// Interval durations constant - can be changed later to be user-configurable
const INTERVAL_DURATIONS = [24]; // Two 12-hour intervals per day

interface TransactionIntervalData {
  date: string;
  startTime: string;
  transactionsStarted: number;
  transactionsClosed: number;
  openTransactionsAtStart: number;
}

interface Settings {
  contactID: string | null;
  locationID: string | null;
  year: number;
  intervalDurations: number[];
}

const TransactiesOverzichtComponent: React.FC = () => {
  const { data: session } = useSession();
  const { gemeenten } = useGemeentenInLijst();
  const { exploitanten } = useExploitanten(undefined);
  const { fietsenstallingtypen } = useFietsenstallingtypen();

  const [selectedContactID, setSelectedContactID] = useState<string | null>(null);
  const [selectedParkingType, setSelectedParkingType] = useState<string>('all');
  const [selectedLocationID, setSelectedLocationID] = useState<string | null>(null);
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [parkingLocations, setParkingLocations] = useState<ParkingDetailsType[]>([]);
  const [filteredParkingLocations, setFilteredParkingLocations] = useState<ParkingDetailsType[]>([]);
  const [transactionData, setTransactionData] = useState<TransactionIntervalData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  
  // Cache for interval data
  const [cachedIntervals, setCachedIntervals] = useState<TransactionIntervalData[] | null>(null);
  const [cacheKey, setCacheKey] = useState<string | null>(null);
  
  // Track if we're in the initial load phase to prevent clearing cache on page reload
  const isInitialLoad = useRef(true);
  const previousFilters = useRef<{ contactID: string | null; locationID: string | null; year: number } | null>(null);

  const isFietsberaad = session?.user?.mainContactId === "1";

  // Storage keys
  const STORAGE_KEY = 'VS_transactiesoverzicht_filterState';
  const CACHE_STORAGE_KEY = 'VS_transactiesoverzicht_cache';

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

    // Load cached data from localStorage (will be checked against filters after they load)
    const savedCache = localStorage.getItem(CACHE_STORAGE_KEY);
    if (savedCache) {
      try {
        const parsed = JSON.parse(savedCache);
        if (parsed.cachedIntervals && parsed.cacheKey) {
          setCachedIntervals(parsed.cachedIntervals);
          setCacheKey(parsed.cacheKey);
        }
      } catch (e) {
        console.warn('Failed to parse saved cache:', e);
      }
    }
  }, []); // Empty dependency array - only run once on mount

  // Restore transaction data from cache when filters and cache are both loaded
  useEffect(() => {
    if (cachedIntervals && cacheKey && selectedLocationID && selectedYear) {
      const currentCacheKey = `${selectedContactID}-${selectedLocationID}-${selectedYear}`;
      if (cacheKey === currentCacheKey) {
        const processedData = processData(cachedIntervals);
        setTransactionData(processedData);
      }
    }
  }, [cachedIntervals, cacheKey, selectedContactID, selectedLocationID, selectedYear]);

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

  // Clear cache when filters that affect the query change (but not on initial load)
  useEffect(() => {
    // Skip clearing cache during initial load
    if (isInitialLoad.current) {
      // Mark initial load as complete after filters are set
      const currentFilters = { contactID: selectedContactID, locationID: selectedLocationID, year: selectedYear };
      previousFilters.current = currentFilters;
      // Set a small timeout to mark initial load as complete after all state updates
      setTimeout(() => {
        isInitialLoad.current = false;
      }, 100);
      return;
    }

    // Only clear cache if filters actually changed (not just restored from localStorage)
    const currentFilters = { contactID: selectedContactID, locationID: selectedLocationID, year: selectedYear };
    if (previousFilters.current) {
      const filtersChanged = 
        previousFilters.current.contactID !== currentFilters.contactID ||
        previousFilters.current.locationID !== currentFilters.locationID ||
        previousFilters.current.year !== currentFilters.year;
      
      if (filtersChanged) {
        setCachedIntervals(null);
        setCacheKey(null);
        setTransactionData([]);
        // Also clear from localStorage
        localStorage.removeItem(CACHE_STORAGE_KEY);
        previousFilters.current = currentFilters;
      }
    } else {
      previousFilters.current = currentFilters;
    }
  }, [selectedContactID, selectedLocationID, selectedYear]);

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

  // Helper function to process data (filter future dates)
  const processData = (intervals: TransactionIntervalData[]): TransactionIntervalData[] => {
    // Filter out future dates
    const today = new Date();
    today.setHours(23, 59, 59, 999); // End of today
    return intervals.filter((row: TransactionIntervalData) => {
      const rowDate = new Date(row.date);
      return rowDate <= today;
    });
  };

  // Fetch transaction data
  const handleFetchData = async () => {
    if (!selectedLocationID) {
      setError('Selecteer een stalling');
      return;
    }

    // Generate cache key based on filters that affect the query
    const currentCacheKey = `${selectedContactID}-${selectedLocationID}-${selectedYear}`;
    
    // Check if we have cached data in state for this combination
    if (cacheKey === currentCacheKey && cachedIntervals) {
      // Use cached data
      const processedData = processData(cachedIntervals);
      setTransactionData(processedData);
      return;
    }

    // Check localStorage cache
    const savedCache = localStorage.getItem(CACHE_STORAGE_KEY);
    if (savedCache) {
      try {
        const parsed = JSON.parse(savedCache);
        if (parsed.cachedIntervals && parsed.cacheKey === currentCacheKey) {
          // Use cached data from localStorage
          setCachedIntervals(parsed.cachedIntervals);
          setCacheKey(parsed.cacheKey);
          const processedData = processData(parsed.cachedIntervals);
          setTransactionData(processedData);
          return;
        }
      } catch (e) {
        console.warn('Failed to parse saved cache:', e);
      }
    }

    // Cache is invalid or missing, fetch new data
    setLoading(true);
    setError(null);

    const settings: Settings = {
      contactID: selectedContactID,
      locationID: selectedLocationID,
      year: selectedYear,
      intervalDurations: INTERVAL_DURATIONS
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
      
      // Cache the intervals and update cache key
      setCachedIntervals(data);
      setCacheKey(currentCacheKey);
      
      // Save to localStorage
      try {
        localStorage.setItem(CACHE_STORAGE_KEY, JSON.stringify({
          cachedIntervals: data,
          cacheKey: currentCacheKey
        }));
      } catch (e) {
        console.warn('Failed to save cache to localStorage:', e);
      }
      
      // Process and set the data
      const processedData = processData(data);
      setTransactionData(processedData);
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
      } else {
        // Default: no sorting
        return 0;
      }

      if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  };

  // Prepare chart data
  const chartData = useMemo(() => {
    if (transactionData.length === 0) {
      return null;
    }

    // Sort data by date and time for charts
    const sortedForChart = [...transactionData].sort((a, b) => {
      const aDateTime = new Date(`${a.date}T${a.startTime}:00`);
      const bDateTime = new Date(`${b.date}T${b.startTime}:00`);
      return aDateTime.getTime() - bDateTime.getTime();
    });

    const categories = sortedForChart.map(row => `${row.date} ${row.startTime}`);
    const netTransactionChange = sortedForChart.map(row => row.transactionsStarted - row.transactionsClosed);
    const transactionsStarted = sortedForChart.map(row => row.transactionsStarted);
    const negativeTransactionsClosed = sortedForChart.map(row => -1 * row.transactionsClosed);
    const openTransactionsAtStart = sortedForChart.map(row => row.openTransactionsAtStart);

    // Calculate max absolute delta for symmetric y-axis scale
    const maxDelta = Math.max(...netTransactionChange.map(Math.abs));
    const symmetricMax = maxDelta > 0 ? Math.ceil(maxDelta * 1.1) : 1; // Add 10% padding

    return {
      categories,
      netTransactionChange,
      transactionsStarted,
      negativeTransactionsClosed,
      openTransactionsAtStart,
      maxDelta: symmetricMax
    };
  }, [transactionData]);

  // Generate CSV
  const handleDownloadCSV = () => {
    const sortedData = getSortedData();
    if (sortedData.length === 0) return;

    const headers = [
      'Datum + Starttijd',
      'Transacties gestart',
      'Transacties gesloten',
      'Open transacties bij start'
    ];

    const rows = sortedData.map(row => [
      `${row.date} ${row.startTime}`,
      row.transactionsStarted.toString(),
      row.transactionsClosed.toString(),
      row.openTransactionsAtStart.toString()
    ]);

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

      </div>

      {/* Data Section */}
      <div className="mt-6">
        <h2 className="text-xl font-semibold mb-4">Transactie Overzicht</h2>
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

        {/* Charts for overview section */}
        {transactionData.length > 0 && chartData && (
          <div className="mb-6 space-y-6">
            {/* Net Transaction Change Chart */}
            <div className="bg-white p-4 border border-gray-300 rounded">
              <Chart
                type="line"
                options={{
                  chart: {
                    id: `net-transaction-change-${Math.random()}`,
                    zoom: {
                      enabled: false
                    },
                    toolbar: {
                      show: true,
                      tools: {
                        download: true,
                        selection: true,
                        zoom: true,
                        zoomin: true,
                        zoomout: true,
                        pan: true,
                        reset: true
                      },
                      autoSelected: 'zoom'
                    },
                    animations: {
                      enabled: false
                    }
                  },
                  dataLabels: {
                    enabled: false
                  },
                  stroke: {
                    curve: 'straight',
                    width: 3
                  },
                  title: {
                    text: '(Aantal nieuwe transacties - Aantal transacties afgesloten) vs Datum + Starttijd',
                    align: 'left'
                  },
                  grid: {
                    borderColor: '#e7e7e7',
                    row: {
                      colors: ['#f3f3f3', 'transparent'],
                      opacity: 0.5
                    }
                  },
                  xaxis: {
                    type: 'categories',
                    categories: chartData.categories,
                    title: {
                      text: 'Datum + Starttijd',
                      align: 'left'
                    },
                    labels: {
                      rotate: -45,
                      rotateAlways: false,
                      maxHeight: 100
                    },
                    tickAmount: chartData.categories.length > 25 ? 25 : chartData.categories.length
                  },
                  yaxis: [
                    {
                      // Left y-axis for delta (symmetric scale)
                      title: {
                        text: 'Delta transacties'
                      },
                      min: -chartData.maxDelta,
                      max: chartData.maxDelta,
                      opposite: false
                    },
                    {
                      // Right y-axis for started/closed transactions
                      title: {
                        text: 'Aantal transacties'
                      },
                      opposite: true
                    }
                  ],
                  tooltip: {
                    enabled: true,
                    shared: true,
                    intersect: false,
                    followCursor: true
                  },
                  colors: ['#000000', '#22c55e', '#ef4444'], // black for delta, green for started, red for closed
                  legend: {
                    show: true,
                    position: 'top'
                  }
                }}
                series={[
                  {
                    name: 'Delta transacties',
                    data: chartData.netTransactionChange,
                    yAxisIndex: 0 // Use first y-axis (left, symmetric)
                  },
                  {
                    name: 'Aantal transactions gestart',
                    data: chartData.transactionsStarted,
                    yAxisIndex: 1 // Use second y-axis (right)
                  },
                  {
                    name: '-1 × Aantal transactions gesloten',
                    data: chartData.negativeTransactionsClosed,
                    yAxisIndex: 1 // Use second y-axis (right)
                  }
                ]}
                style={{ height: '50vh' }}
              />
            </div>

            {/* Open Transactions at Start Chart */}
            <div className="bg-white p-4 border border-gray-300 rounded">
              <Chart
                type="line"
                options={{
                  chart: {
                    id: `open-transactions-${Math.random()}`,
                    zoom: {
                      enabled: false
                    },
                    toolbar: {
                      show: true,
                      tools: {
                        download: true,
                        selection: true,
                        zoom: true,
                        zoomin: true,
                        zoomout: true,
                        pan: true,
                        reset: true
                      },
                      autoSelected: 'zoom'
                    },
                    animations: {
                      enabled: false
                    }
                  },
                  dataLabels: {
                    enabled: false
                  },
                  stroke: {
                    curve: 'straight',
                    width: 3
                  },
                  title: {
                    text: 'Open transacties bij start vs Datum + Starttijd',
                    align: 'left'
                  },
                  grid: {
                    borderColor: '#e7e7e7',
                    row: {
                      colors: ['#f3f3f3', 'transparent'],
                      opacity: 0.5
                    }
                  },
                  xaxis: {
                    type: 'categories',
                    categories: chartData.categories,
                    title: {
                      text: 'Datum + Starttijd',
                      align: 'left'
                    },
                    labels: {
                      rotate: -45,
                      rotateAlways: false,
                      maxHeight: 100
                    },
                    tickAmount: chartData.categories.length > 25 ? 25 : chartData.categories.length
                  },
                  yaxis: [
                    {
                      // Left y-axis for open transactions
                      title: {
                        text: 'Open transacties bij start'
                      },
                      opposite: false
                    },
                    {
                      // Right y-axis for delta (symmetric scale)
                      title: {
                        text: 'Delta transacties'
                      },
                      min: -chartData.maxDelta,
                      max: chartData.maxDelta,
                      opposite: true
                    }
                  ],
                  tooltip: {
                    enabled: true,
                    shared: true,
                    intersect: false,
                    followCursor: true
                  },
                  colors: ['#3b82f6', '#000000'], // blue for open transactions, black for delta
                  legend: {
                    show: true,
                    position: 'top'
                  }
                }}
                series={[
                  {
                    name: 'Open transacties bij start',
                    data: chartData.openTransactionsAtStart,
                    yAxisIndex: 0 // Use first y-axis (left)
                  },
                  {
                    name: 'Delta transacties',
                    data: chartData.netTransactionChange,
                    yAxisIndex: 1 // Use second y-axis (right, symmetric)
                  }
                ]}
                style={{ height: '50vh' }}
              />
            </div>
          </div>
        )}

        {transactionData.length > 0 && (
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

      </div>
    </div>
  );
};

export default TransactiesOverzichtComponent;

