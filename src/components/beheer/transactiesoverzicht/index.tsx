import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { useGemeentenInLijst } from '~/hooks/useGemeenten';
import { useExploitanten } from '~/hooks/useExploitanten';
import type { ParkingDetailsType } from '~/types/parking';
import Chart from '~/components/beheer/reports/Chart';
import TransactionFilters from '~/components/beheer/reports/TransactionFilters';

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

  const [selectedContactID, setSelectedContactID] = useState<string | null>(null);
  const [selectedLocationID, setSelectedLocationID] = useState<string | null>(null);
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [filteredParkingLocations, setFilteredParkingLocations] = useState<ParkingDetailsType[]>([]);
  const [contacts, setContacts] = useState<Array<{ ID: string; CompanyName: string }>>([]);
  const [transactionData, setTransactionData] = useState<TransactionIntervalData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [aggregationProgress, setAggregationProgress] = useState<number | null>(null);
  
  // Cache for raw transaction data and aggregated data
  const [cachedRawData, setCachedRawData] = useState<Array<{
    locationid: string;
    checkindate: string;
    checkoutdate: string | null;
  }> | null>(null);
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
        if (parsed.cacheKey) {
          setCacheKey(parsed.cacheKey);
          // Load raw data if available
          if (parsed.cachedRawData) {
            setCachedRawData(parsed.cachedRawData);
            console.log('[transacties_voltooid] [CLIENT] Loaded cached raw data:', parsed.cachedRawData.length, 'records');
          }
          // Load aggregated data if available
          if (parsed.cachedIntervals) {
            setCachedIntervals(parsed.cachedIntervals);
            console.log('[transacties_voltooid] [CLIENT] Loaded cached aggregated data:', parsed.cachedIntervals.length, 'records');
          }
        }
      } catch (e) {
        console.warn('Failed to parse saved cache:', e);
      }
    }
  }, []); // Empty dependency array - only run once on mount

  // Calculate interval start times for a day starting at 00:00:00
  const calculateIntervalStartTimes = useMemo(() => {
    return (dayStart: Date, intervalDurations: number[]): Date[] => {
      const startTimes: Date[] = [];
      let currentTime = new Date(dayStart);
      currentTime.setHours(0, 0, 0, 0); // Always start at midnight
      
      for (const duration of intervalDurations) {
        startTimes.push(new Date(currentTime));
        currentTime = new Date(currentTime.getTime() + duration * 60 * 60 * 1000);
      }
      
      return startTimes;
    };
  }, []);

  // Aggregate raw transaction data into intervals
  const aggregateRawDataAsync = async (
    rawData: Array<{ locationid: string; checkindate: string; checkoutdate: string | null }>,
    intervalDurations: number[],
    year: number,
    onProgress?: (progress: number) => void
  ): Promise<TransactionIntervalData[]> => {
    const aggregationStart = Date.now();
    console.log('[transacties_voltooid] [CLIENT] Starting aggregation of', rawData.length, 'raw transactions');
    
    if (!rawData || rawData.length === 0) {
      console.log('[transacties_voltooid] [CLIENT] No data to aggregate');
      if (onProgress) onProgress(100);
      return [];
    }

    // Pre-process transactions: normalize dates
    const preprocessStart = Date.now();
    console.log('[transacties_voltooid] [CLIENT] Pre-processing transactions...');
    const processedTxs = rawData.map(tx => {
      const checkinDate = new Date(tx.checkindate);
      const checkoutDate = tx.checkoutdate ? new Date(tx.checkoutdate) : null;
      return {
        checkinDate,
        checkoutDate
      };
    });
    console.log('[transacties_voltooid] [CLIENT] Pre-processing completed in', Date.now() - preprocessStart, 'ms');

    // Calculate number of days in the year (handle leap years)
    const isLeapYear = (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
    const daysInYear = isLeapYear ? 366 : 365;

    // Generate all interval start/end times for the year
    const intervalList: Array<{ date: string; startTime: string; startDateTime: Date; endDateTime: Date }> = [];
    
    for (let day = 0; day < daysInYear; day++) {
      const currentDate = new Date(year, 0, 1);
      currentDate.setDate(currentDate.getDate() + day);
      
      // Always start intervals at 00:00:00 (midnight)
      const dayStart = new Date(currentDate);
      dayStart.setHours(0, 0, 0, 0);
      
      const intervalStartTimes = calculateIntervalStartTimes(dayStart, intervalDurations);
      
      for (let i = 0; i < intervalStartTimes.length; i++) {
        const intervalStart = intervalStartTimes[i];
        const intervalDuration = intervalDurations[i];
        if (!intervalStart || intervalDuration === undefined) continue;
        
        const intervalEnd = i < intervalStartTimes.length - 1 
          ? intervalStartTimes[i + 1]
          : new Date(intervalStart.getTime() + intervalDuration * 60 * 60 * 1000);
        
        if (!intervalEnd) continue;
        
        const dateStr = currentDate.toISOString().split('T')[0] || '';
        const timeStr = `${String(intervalStart.getHours()).padStart(2, '0')}:${String(intervalStart.getMinutes()).padStart(2, '0')}`;
        
        intervalList.push({
          date: dateStr,
          startTime: timeStr,
          startDateTime: intervalStart,
          endDateTime: intervalEnd
        });
      }
    }

    console.log('[transacties_voltooid] [CLIENT] Generated', intervalList.length, 'intervals');
    console.log('[transacties_voltooid] [CLIENT] Processing intervals...');

    // Generate all intervals and calculate counts
    const results: TransactionIntervalData[] = [];
    const totalIntervals = intervalList.length;
    let processedIntervals = 0;
    const logInterval = Math.max(1, Math.floor(totalIntervals / 20)); // Log every 5%

    // Process in batches to allow React to update UI
    for (let i = 0; i < intervalList.length; i++) {
      const interval = intervalList[i];
      
      let transactionsStarted = 0;
      let transactionsClosed = 0;
      let openTransactionsAtStart = 0;

      processedTxs.forEach(tx => {
        // Count transactions started in this interval
        if (tx.checkinDate >= interval.startDateTime && tx.checkinDate < interval.endDateTime) {
          transactionsStarted++;
        }

        // Count transactions closed in this interval
        if (tx.checkoutDate && 
            tx.checkoutDate >= interval.startDateTime && 
            tx.checkoutDate < interval.endDateTime) {
          transactionsClosed++;
        }

        // Count transactions open at the start of this interval
        if (tx.checkinDate < interval.startDateTime &&
            (tx.checkoutDate === null || tx.checkoutDate >= interval.startDateTime)) {
          openTransactionsAtStart++;
        }
      });

      results.push({
        date: interval.date,
        startTime: interval.startTime,
        transactionsStarted,
        transactionsClosed,
        openTransactionsAtStart
      });

      processedIntervals++;
      if (processedIntervals % logInterval === 0 || processedIntervals === totalIntervals) {
        const progress = (processedIntervals / totalIntervals) * 100;
        const progressFixed = progress.toFixed(1);
        console.log('[transacties_voltooid] [CLIENT] Aggregation progress:', progressFixed + '%', `(${processedIntervals}/${totalIntervals})`);
        if (onProgress) {
          onProgress(progress);
        }
        // Yield control to allow React to update
        await new Promise(resolve => setTimeout(resolve, 0));
      }
    }

    const aggregationTime = Date.now() - aggregationStart;
    console.log('[transacties_voltooid] [CLIENT] Aggregation completed in', aggregationTime, 'ms');
    console.log('[transacties_voltooid] [CLIENT] Generated', results.length, 'interval records');
    if (onProgress) onProgress(100);
    return results;
  };

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


  // Save filter state to localStorage whenever it changes
  useEffect(() => {
    const stateToSave = {
      selectedContactID,
      selectedLocationID,
      selectedYear
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stateToSave));
  }, [selectedContactID, selectedLocationID, selectedYear]);

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
        setCachedRawData(null);
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
    
    // Check if we have cached aggregated data in state for this combination
    if (cacheKey === currentCacheKey && cachedIntervals) {
      console.log('[transacties_voltooid] [CLIENT] Using cached aggregated data from state:', cachedIntervals.length, 'records');
      // Use cached aggregated data
      const processedData = processData(cachedIntervals);
      setTransactionData(processedData);
      return;
    }

    // Check localStorage cache
    const savedCache = localStorage.getItem(CACHE_STORAGE_KEY);
    if (savedCache) {
      try {
        const parsed = JSON.parse(savedCache);
        if (parsed.cacheKey === currentCacheKey) {
          // If we have cached aggregated data, use it
          if (parsed.cachedIntervals) {
            console.log('[transacties_voltooid] [CLIENT] Using cached aggregated data from localStorage:', parsed.cachedIntervals.length, 'records');
            setCachedIntervals(parsed.cachedIntervals);
            setCacheKey(parsed.cacheKey);
            if (parsed.cachedRawData) {
              setCachedRawData(parsed.cachedRawData);
            }
            const processedData = processData(parsed.cachedIntervals);
            setTransactionData(processedData);
            return;
          }
          // If we have raw data but no aggregated, aggregate it
          if (parsed.cachedRawData) {
            console.log('[transacties_voltooid] [CLIENT] Aggregating cached raw data (aggregated data missing)...');
            setCachedRawData(parsed.cachedRawData);
            setCacheKey(parsed.cacheKey);
            setAggregationProgress(0);
            const aggregated = await aggregateRawDataAsync(parsed.cachedRawData, INTERVAL_DURATIONS, selectedYear, (progress) => {
              setAggregationProgress(progress);
            });
            setAggregationProgress(null);
            setCachedIntervals(aggregated);
            const processedData = processData(aggregated);
            setTransactionData(processedData);
            
            // Update localStorage with aggregated data
            try {
              localStorage.setItem(CACHE_STORAGE_KEY, JSON.stringify({
                cachedRawData: parsed.cachedRawData,
                cachedIntervals: aggregated,
                cacheKey: parsed.cacheKey
              }));
            } catch (e) {
              console.warn('[transacties_voltooid] [CLIENT] Failed to update cache with aggregated data:', e);
            }
            return;
          }
        }
      } catch (e) {
        console.warn('[transacties_voltooid] [CLIENT] Failed to parse saved cache:', e);
      }
    }

    // Cache is invalid or missing, fetch new data
    console.log('[transacties_voltooid] [CLIENT] Fetching data from API...');
    const fetchStart = Date.now();
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

      const fetchTime = Date.now() - fetchStart;
      console.log('[transacties_voltooid] [CLIENT] Fetch completed in', fetchTime, 'ms');
      console.log('[transacties_voltooid] [CLIENT] Parsing JSON response...');
      
      const parseStart = Date.now();
      const rawData = await response.json();
      const parseTime = Date.now() - parseStart;
      
      // Calculate approximate size
      const dataSize = JSON.stringify(rawData).length;
      const dataSizeMB = parseFloat((dataSize / (1024 * 1024)).toFixed(2));
      console.log('[transacties_voltooid] [CLIENT] JSON parsed in', parseTime, 'ms');
      console.log('[transacties_voltooid] [CLIENT] Received', rawData.length, 'transaction records');
      console.log('[transacties_voltooid] [CLIENT] Approximate data size:', dataSizeMB, 'MB');
      
      if (dataSizeMB > 4) {
        console.warn('[transacties_voltooid] [CLIENT] ⚠️ Response size exceeds Next.js 4MB limit. Consider implementing pagination or data compression.');
      }
      
      // Cache the raw data and update cache key
      setCachedRawData(rawData);
      setCacheKey(currentCacheKey);
      
      // Aggregate raw data once (this is expensive, so we cache the result)
      console.log('[transacties_voltooid] [CLIENT] Aggregating raw data (one-time operation)...');
      setAggregationProgress(0);
      const aggregated = await aggregateRawDataAsync(rawData, INTERVAL_DURATIONS, selectedYear, (progress) => {
        setAggregationProgress(progress);
      });
      setAggregationProgress(null);
      
      // Cache the aggregated data
      setCachedIntervals(aggregated);
      
      // Process and set the data
      const processStart = Date.now();
      const processedData = processData(aggregated);
      console.log('[transacties_voltooid] [CLIENT] Data processing completed in', Date.now() - processStart, 'ms');
      console.log('[transacties_voltooid] [CLIENT] Final processed data:', processedData.length, 'records');
      setTransactionData(processedData);
      
      // Save to localStorage with both raw and aggregated data
      try {
        const saveStart = Date.now();
        localStorage.setItem(CACHE_STORAGE_KEY, JSON.stringify({
          cachedRawData: rawData,
          cachedIntervals: aggregated,
          cacheKey: currentCacheKey
        }));
        console.log('[transacties_voltooid] [CLIENT] Saved to localStorage in', Date.now() - saveStart, 'ms');
      } catch (e) {
        console.warn('[transacties_voltooid] [CLIENT] Failed to save cache to localStorage:', e);
      }
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

      <TransactionFilters
        selectedYear={selectedYear}
        selectedContactID={selectedContactID}
        selectedLocationID={selectedLocationID}
        years={years}
        contacts={contacts}
        filteredParkingLocations={filteredParkingLocations}
        onYearChange={(year) => {
          setSelectedYear(year);
        }}
        onContactChange={(contactID) => {
          setSelectedContactID(contactID);
          setSelectedLocationID(null);
        }}
        onLocationChange={setSelectedLocationID}
        showContactFilter={isFietsberaad}
        yearFirst={true}
        locationDisabled={filteredParkingLocations.length === 0}
      />

      {/* Data Section */}
      <div className="mt-6">
        <h2 className="text-xl font-semibold mb-4">Transactie Overzicht</h2>
        <div className="mb-4 flex gap-2">
          <button
            onClick={handleFetchData}
            disabled={loading || aggregationProgress !== null || !selectedLocationID}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            {aggregationProgress !== null 
              ? `Aggregeren (${Math.round(aggregationProgress)}%)` 
              : loading 
                ? 'Laden...' 
                : 'Go'}
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

