import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { useGemeentenInLijst } from '~/hooks/useGemeenten';
import { useExploitanten } from '~/hooks/useExploitanten';
import Chart from '~/components/beheer/reports/Chart';
import TransactionFilters from '~/components/beheer/reports/TransactionFilters';

interface RawTransactionData {
  locationid: string;
  checkintype: string;
  checkouttype: string | null;
  checkindate: string;
  checkoutdate: string | null;
}

interface AggregatedTransactionData {
  date: string;
  locationid: string;
  checkintype: string;
  checkouttype: string | null;
  openTransactionsForDay: number;
  totalOpenTransactions: number;
}

// OpenTransactionData is used for chart aggregation (by date only)
interface OpenTransactionData {
  date: string;
  openTransactionsForDay: number;
  totalOpenTransactions: number;
  checkintypes: Set<string>;
  checkouttypes: Set<string | null>;
}

interface Settings {
  contactID: string | null;
  locationID: string | null;
  year: number;
}

type CheckType = 'user' | 'controle' | 'system' | 'sync' | 'reservation' | 'unknown';

const OpenTransactiesOverzichtComponent: React.FC = () => {
  const { data: session } = useSession();
  const { gemeenten } = useGemeentenInLijst();
  const { exploitanten } = useExploitanten(undefined);

  const [selectedContactID, setSelectedContactID] = useState<string | null>(null);
  const [selectedLocationID, setSelectedLocationID] = useState<string | null>(null);
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [transactionData, setTransactionData] = useState<AggregatedTransactionData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [aggregationProgress, setAggregationProgress] = useState<number | null>(null);
  const [hideRecentCheckins, setHideRecentCheckins] = useState<boolean>(true);
  const [showControles, setShowControles] = useState<boolean>(true);
  const [controleRecords, setControleRecords] = useState<Array<{ checkindate: Date | string }>>([]);
  
  // Checkintype and checkouttype filters
  const allCheckTypes: CheckType[] = ['user', 'controle', 'system', 'sync', 'reservation', 'unknown'];
  const [selectedCheckinTypes, setSelectedCheckinTypes] = useState<Set<CheckType>>(new Set(allCheckTypes));
  const [selectedCheckoutTypes, setSelectedCheckoutTypes] = useState<Set<CheckType>>(new Set(allCheckTypes));
  
  // Cache for raw transaction data and aggregated data
  const [cachedRawData, setCachedRawData] = useState<RawTransactionData[] | null>(null);
  const [cachedAggregatedData, setCachedAggregatedData] = useState<AggregatedTransactionData[] | null>(null);
  const [cacheKey, setCacheKey] = useState<string | null>(null);
  
  // Track if we're in the initial load phase to prevent clearing cache on page reload
  const isInitialLoad = useRef(true);
  const previousFilters = useRef<{ contactID: string | null; locationID: string | null; year: number } | null>(null);

  const isFietsberaad = session?.user?.mainContactId === "1";

  // Storage keys
  const STORAGE_KEY = 'VS_openTransactiesoverzicht_filterState';
  const CACHE_STORAGE_KEY = 'VS_openTransactiesoverzicht_cache';

  // Load initial state from localStorage (only once on mount)
  useEffect(() => {
    const savedState = localStorage.getItem(STORAGE_KEY);
    if (savedState) {
      try {
        const parsed = JSON.parse(savedState);
        if (parsed.selectedContactID) setSelectedContactID(parsed.selectedContactID);
        if (parsed.selectedLocationID) setSelectedLocationID(parsed.selectedLocationID);
        if (parsed.selectedYear) setSelectedYear(parsed.selectedYear);
        if (parsed.selectedCheckinTypes) setSelectedCheckinTypes(new Set(parsed.selectedCheckinTypes));
        if (parsed.selectedCheckoutTypes) setSelectedCheckoutTypes(new Set(parsed.selectedCheckoutTypes));
        if (parsed.showControles !== undefined) setShowControles(parsed.showControles);
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
        if (parsed.cachedRawData && parsed.cacheKey) {
          setCachedRawData(parsed.cachedRawData);
          setCacheKey(parsed.cacheKey);
          // Also load aggregated data if available
          if (parsed.cachedAggregatedData) {
            setCachedAggregatedData(parsed.cachedAggregatedData);
          }
        }
      } catch (e) {
        console.warn('Failed to parse saved cache:', e);
      }
    }
  }, []); // Empty dependency array - only run once on mount

  // Aggregate raw transaction data into grouped data (date, checkintype, checkouttype)
  // Made async to allow React to update UI during aggregation
  const aggregateRawDataAsync = async (rawData: RawTransactionData[], onProgress?: (progress: number) => void): Promise<AggregatedTransactionData[]> => {
      const aggregationStart = Date.now();
      
      if (!rawData || rawData.length === 0) {
        if (onProgress) onProgress(100);
        return [];
      }

      // Get locationid from first transaction
      const locationid = rawData[0]?.locationid || '';

      // Pre-process transactions: normalize dates and group by type
      const preprocessStart = Date.now();
      const processedTxs = rawData.map(tx => {
        const checkinDate = new Date(tx.checkindate);
        checkinDate.setHours(0, 0, 0, 0);
        const checkoutDate = tx.checkoutdate ? new Date(tx.checkoutdate) : null;
        if (checkoutDate) {
          checkoutDate.setHours(0, 0, 0, 0);
        }
        return {
          checkinDate,
          checkoutDate,
          checkintype: tx.checkintype || null,
          checkouttype: tx.checkouttype || null,
          checkinDateStr: checkinDate.toISOString().split('T')[0] || ''
        };
      });

      // Get all unique groups (checkintype, checkouttype combinations)
      const groups = new Map<string, { checkintype: string | null; checkouttype: string | null }>();
      processedTxs.forEach(tx => {
        const groupKey = `${tx.checkintype || 'onbekend'}-${tx.checkouttype || 'onbekend'}`;
        if (!groups.has(groupKey)) {
          groups.set(groupKey, {
            checkintype: tx.checkintype,
            checkouttype: tx.checkouttype
          });
        }
      });
      console.log('[open_transacties] [CLIENT] Found', groups.size, 'unique groups');

      // Generate all dates for the year
      const isLeapYear = (selectedYear % 4 === 0 && selectedYear % 100 !== 0) || (selectedYear % 400 === 0);
      const daysInYear = isLeapYear ? 366 : 365;
      const dates: string[] = [];
      const dateObjs: Date[] = [];
      for (let day = 0; day < daysInYear; day++) {
        const currentDate = new Date(selectedYear, 0, 1);
        currentDate.setDate(currentDate.getDate() + day);
        currentDate.setHours(0, 0, 0, 0);
        const dateStr = currentDate.toISOString().split('T')[0] || '';
        dates.push(dateStr);
        dateObjs.push(currentDate);
      }
      console.log('[open_transacties] [CLIENT] Generated', daysInYear, 'dates for year', selectedYear);
      console.log('[open_transacties] [CLIENT] Processing', dates.length * groups.size, 'date/group combinations...');

      // Generate all date/group combinations and calculate counts
      const results: AggregatedTransactionData[] = [];
      const totalCombinations = dates.length * groups.size;
      let processedCombinations = 0;
      const logInterval = Math.max(1, Math.floor(totalCombinations / 20)); // Log every 5% for better updates

      // Process in batches to allow React to update UI
      for (let dateIdx = 0; dateIdx < dates.length; dateIdx++) {
        const date = dates[dateIdx];
        const dateObj = dateObjs[dateIdx];
        if (!date || !dateObj) continue; // Skip if undefined (shouldn't happen, but TypeScript safety)
        const dateEnd = new Date(dateObj);
        dateEnd.setHours(23, 59, 59, 999);

        for (const [groupKey, group] of groups.entries()) {
          const { checkintype, checkouttype } = group;

          // Count transactions checked in on this day (openTransactionsForDay)
          let openTransactionsForDay = 0;
          // Count all open transactions up to and including this date (totalOpenTransactions)
          let totalOpenTransactions = 0;

          processedTxs.forEach(tx => {
            // Check if transaction matches this group
            // Note: groupKey uses 'onbekend' but we compare against actual null values
            const matchesGroup = 
              tx.checkintype === checkintype &&
              ((tx.checkouttype === null && checkouttype === null) || 
               (tx.checkouttype !== null && checkouttype !== null && tx.checkouttype === checkouttype));

            if (!matchesGroup) return;

            // Check if transaction is open on this date
            const isOpenOnDate = 
              tx.checkinDate <= dateEnd &&
              (tx.checkoutDate === null || tx.checkoutDate > dateEnd);

            if (isOpenOnDate) {
              totalOpenTransactions++;
              
              // Check if checked in on this specific day
              if (tx.checkinDate.getTime() === dateObj.getTime()) {
                openTransactionsForDay++;
              }
            }
          });

          // Only add if there are transactions
          if (openTransactionsForDay > 0 || totalOpenTransactions > 0) {
            results.push({
              date: date || '',
              locationid: locationid || '',
              checkintype: checkintype || '',
              checkouttype: checkouttype || null,
              openTransactionsForDay,
              totalOpenTransactions
            });
          }

          processedCombinations++;
          if (processedCombinations % logInterval === 0 || processedCombinations === totalCombinations) {
            const progress = (processedCombinations / totalCombinations) * 100;
            const progressFixed = progress.toFixed(1);
            console.log('[open_transacties] [CLIENT] Aggregation progress:', progressFixed + '%', `(${processedCombinations}/${totalCombinations})`);
            if (onProgress) {
              onProgress(progress);
            }
            // Yield control to allow React to update
            await new Promise(resolve => setTimeout(resolve, 0));
          }
        }
      }

      const aggregationTime = Date.now() - aggregationStart;
      console.log('[open_transacties] [CLIENT] Aggregation completed in', aggregationTime, 'ms');
      console.log('[open_transacties] [CLIENT] Generated', results.length, 'aggregated records');
      if (onProgress) onProgress(100);
      return results;
  };

  // Convert aggregated data (grouped by date, checkintype, checkouttype) into daily totals for chart
  const aggregateByDate = useMemo(() => {
    return (aggregatedData: AggregatedTransactionData[]): OpenTransactionData[] => {
      // Group by date and sum up counts
      const dateMap = new Map<string, { 
        openTransactionsForDay: number;
        totalOpenTransactions: number;
        checkintypes: Set<string>;
        checkouttypes: Set<string | null>;
      }>();

      aggregatedData.forEach(record => {
        const date = record.date;
        
        if (!dateMap.has(date)) {
          dateMap.set(date, {
            openTransactionsForDay: 0,
            totalOpenTransactions: 0,
            checkintypes: new Set(),
            checkouttypes: new Set()
          });
        }

        const dayData = dateMap.get(date)!;
        
        // Sum up the counts
        dayData.openTransactionsForDay += record.openTransactionsForDay;
        dayData.totalOpenTransactions += record.totalOpenTransactions;
        dayData.checkintypes.add(record.checkintype || 'onbekend');
        dayData.checkouttypes.add(record.checkouttype);
      });

      // Convert to array and sort by date
      const sortedDates = Array.from(dateMap.keys()).sort();
      return sortedDates.map(date => {
        const dayData = dateMap.get(date)!;
        return {
          date,
          openTransactionsForDay: dayData.openTransactionsForDay,
          totalOpenTransactions: dayData.totalOpenTransactions,
          checkintypes: dayData.checkintypes,
          checkouttypes: dayData.checkouttypes
        };
      });
    };
  }, []);

  // Update transaction data when aggregated data or filters change
  // Filter cached aggregated data based on checkintype/checkouttype filters (same as chart)
  useEffect(() => {
    if (cachedAggregatedData && cacheKey && selectedLocationID && selectedYear) {
      const currentCacheKey = `${selectedContactID}-${selectedLocationID}-${selectedYear}`;
      if (cacheKey === currentCacheKey) {
        console.log('[open_transacties] [CLIENT] Filtering cached aggregated data for table...');
        // Filter aggregated data based on checkintype/checkouttype filters (same as chart)
        const filteredData = cachedAggregatedData.filter(record => {
          // Map null to 'unknown' for filtering (CheckType uses 'unknown', display uses 'onbekend')
          const checkinType = (record.checkintype || 'unknown') as CheckType;
          const checkoutType = (record.checkouttype || 'unknown') as CheckType;
          const checkinMatch = selectedCheckinTypes.has(checkinType);
          const checkoutMatch = selectedCheckoutTypes.has(checkoutType);
          return checkinMatch && checkoutMatch;
        });
        const processed = processData(filteredData);
        console.log('[open_transacties] [CLIENT] Filtered data ready:', processed.length, 'records');
        setTransactionData(processed);
      }
    }
  }, [cachedAggregatedData, cacheKey, selectedContactID, selectedLocationID, selectedYear, selectedCheckinTypes, selectedCheckoutTypes, hideRecentCheckins]);

  // Generate years from 2000 to current year (descending)
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: currentYear - 1999 }, (_, i) => currentYear - i);


  // Save filter state to localStorage whenever it changes
  useEffect(() => {
    const stateToSave = {
      selectedContactID,
      selectedLocationID,
      selectedYear,
      selectedCheckinTypes: Array.from(selectedCheckinTypes),
      selectedCheckoutTypes: Array.from(selectedCheckoutTypes),
      showControles
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stateToSave));
  }, [selectedContactID, selectedLocationID, selectedYear, selectedCheckinTypes, selectedCheckoutTypes, showControles]);

  // Pre-process synchronisatie records: convert dates to strings and deduplicate by date
  // Use the same date formatting as chart categories to avoid timezone mismatches
  const processedControleDates = useMemo(() => {
    if (!controleRecords || controleRecords.length === 0) {
      return new Set<string>();
    }
    
    const dateSet = new Set<string>();
    for (let i = 0; i < controleRecords.length; i++) {
      const record = controleRecords[i];
      if (!record || !record.checkindate) continue;
      
      // Parse the date (could be Date object or ISO string from API)
      const controleDate = typeof record.checkindate === 'string' 
        ? new Date(record.checkindate) 
        : new Date(record.checkindate);
      
      // Check if date is valid
      if (isNaN(controleDate.getTime())) continue;
      
      // Format date the same way as chart categories to avoid timezone mismatches
      // Chart categories use: new Date(year, month, day) in local time, then toISOString()
      // We need to extract the local date components and format the same way
      const year = controleDate.getFullYear();
      const month = controleDate.getMonth();
      const day = controleDate.getDate();
      
      // Create a new date in local time (matching chart category generation)
      const localDate = new Date(year, month, day);
      localDate.setHours(0, 0, 0, 0);
      const dateStr = localDate.toISOString().split('T')[0];
      
      if (dateStr) {
        dateSet.add(dateStr);
      }
    }
    
    return dateSet;
  }, [controleRecords]);

  // Fetch synchronisatie records when locationID or year changes
  useEffect(() => {
    const fetchControles = async () => {
      if (!selectedLocationID || !selectedYear) {
        setControleRecords([]);
        return;
      }

      try {
        const response = await fetch('/api/reports/controles', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            locationID: selectedLocationID,
            year: selectedYear
          })
        });

        if (!response.ok) {
          console.error('[controles] Failed to fetch synchronisatie records:', response.statusText);
          setControleRecords([]);
          return;
        }

        const data = await response.json();
        setControleRecords(data);
        console.log('[controles] Fetched', data.length, 'synchronisatie records');
      } catch (error) {
        console.error('[controles] Error fetching synchronisatie records:', error);
        setControleRecords([]);
      }
    };

    fetchControles();
  }, [selectedLocationID, selectedYear]);

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
    // Note: checkintype/checkouttype changes don't trigger re-fetch
    const currentFilters = { contactID: selectedContactID, locationID: selectedLocationID, year: selectedYear };
    if (previousFilters.current) {
      const filtersChanged = 
        previousFilters.current.contactID !== currentFilters.contactID ||
        previousFilters.current.locationID !== currentFilters.locationID ||
        previousFilters.current.year !== currentFilters.year;
      
      if (filtersChanged) {
        setCachedRawData(null);
        setCachedAggregatedData(null);
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


  // Helper function to process data (filter future dates and optionally recent checkins)
  // Accepts any data type with a date property
  const processData = <T extends { date: string }>(data: T[]): T[] => {
    // Filter out future dates
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Calculate cutoff date (3 days ago if hideRecentCheckins is true)
    const cutoffDate = new Date(today);
    if (hideRecentCheckins) {
      cutoffDate.setDate(cutoffDate.getDate() - 2); // Today - 2 days = 3 days total (today, yesterday, day before)
    } else {
      cutoffDate.setTime(0); // No cutoff if not hiding recent
    }
    
    return data.filter((row: T) => {
      const rowDate = new Date(row.date);
      rowDate.setHours(0, 0, 0, 0);
      
      // Filter out future dates
      if (rowDate > today) {
        return false;
      }
      
      // Filter out recent checkins if enabled
      if (hideRecentCheckins && rowDate >= cutoffDate) {
        return false;
      }
      
      return true;
    });
  };

  // Fetch transaction data
  const handleFetchData = async () => {
    if (!selectedLocationID) {
      setError('Selecteer een stalling');
      return;
    }

    // Generate cache key based on filters that affect the query (not checkintype/checkouttype)
    const currentCacheKey = `${selectedContactID}-${selectedLocationID}-${selectedYear}`;
    
    // Check if we have cached aggregated data in state for this combination
    if (cacheKey === currentCacheKey && cachedAggregatedData) {
      console.log('[open_transacties] [CLIENT] Using cached aggregated data from state:', cachedAggregatedData.length, 'records');
      // Filter and use cached aggregated data directly (no re-aggregation needed)
      const filteredData = cachedAggregatedData.filter(record => {
        const checkinType = (record.checkintype || 'unknown') as CheckType;
        const checkoutType = (record.checkouttype || 'unknown') as CheckType;
      const checkinMatch = selectedCheckinTypes.has(checkinType);
      const checkoutMatch = selectedCheckoutTypes.has(checkoutType);
      return checkinMatch && checkoutMatch;
    });
    const processedData = processData<AggregatedTransactionData>(filteredData);
    setTransactionData(processedData);
      return;
    }

    // Check localStorage cache
    const savedCache = localStorage.getItem(CACHE_STORAGE_KEY);
    if (savedCache) {
      try {
        const parsed = JSON.parse(savedCache);
        // Check if cache key matches and we have either raw data or aggregated data
        if (parsed.cacheKey === currentCacheKey && (parsed.cachedRawData || parsed.cachedAggregatedData)) {
          if (parsed.cachedRawData) {
          // Use cached data from localStorage
          setCachedRawData(parsed.cachedRawData);
          }
          setCacheKey(parsed.cacheKey);
          
          // If we have cached aggregated data, use it; otherwise aggregate once
          if (parsed.cachedAggregatedData) {
            console.log('[open_transacties] [CLIENT] Using cached aggregated data from localStorage:', parsed.cachedAggregatedData.length, 'records');
            setCachedAggregatedData(parsed.cachedAggregatedData);
            // Filter based on checkintype/checkouttype
            const filteredData = parsed.cachedAggregatedData.filter((record: AggregatedTransactionData) => {
              const checkinType = (record.checkintype || 'unknown') as CheckType;
              const checkoutType = (record.checkouttype || 'unknown') as CheckType;
              const checkinMatch = selectedCheckinTypes.has(checkinType);
              const checkoutMatch = selectedCheckoutTypes.has(checkoutType);
              return checkinMatch && checkoutMatch;
            });
            const processedData = processData<AggregatedTransactionData>(filteredData);
            setTransactionData(processedData);
          } else if (parsed.cachedRawData) {
            // Need to aggregate (shouldn't happen if cache is complete, but handle it)
            setAggregationProgress(0);
            const aggregated = await aggregateRawDataAsync(parsed.cachedRawData, (progress) => {
              setAggregationProgress(progress);
            });
            setCachedAggregatedData(aggregated);
            setAggregationProgress(null);
            // Filter based on checkintype/checkouttype
            const filteredData = aggregated.filter(record => {
              const checkinType = (record.checkintype || 'unknown') as CheckType;
              const checkoutType = (record.checkouttype || 'unknown') as CheckType;
              const checkinMatch = selectedCheckinTypes.has(checkinType);
              const checkoutMatch = selectedCheckoutTypes.has(checkoutType);
              return checkinMatch && checkoutMatch;
            });
            const processedData = processData<AggregatedTransactionData>(filteredData);
            setTransactionData(processedData);
            
            // Update localStorage with aggregated data
            try {
              const updateCacheData = {
                cachedRawData: parsed.cachedRawData,
                cachedAggregatedData: aggregated,
                cacheKey: parsed.cacheKey
              };
              const updateCacheString = JSON.stringify(updateCacheData);
              const updateCacheSizeMB = updateCacheString.length / (1024 * 1024);
              
              if (updateCacheSizeMB > 4) {
                console.warn('[open_transacties] [CLIENT] Updated cache size too large (' + updateCacheSizeMB.toFixed(2) + 'MB), saving aggregated data only');
                // Save only aggregated data
                const aggregatedOnly = {
                  cachedAggregatedData: aggregated,
                  cacheKey: parsed.cacheKey
                };
                localStorage.setItem(CACHE_STORAGE_KEY, JSON.stringify(aggregatedOnly));
              } else {
                localStorage.setItem(CACHE_STORAGE_KEY, updateCacheString);
              }
            } catch (e) {
              const errorMessage = e instanceof Error ? e.message : String(e);
              if (errorMessage.includes('QuotaExceededError') || errorMessage.includes('quota')) {
                console.warn('[open_transacties] [CLIENT] localStorage quota exceeded when updating cache');
              } else {
              console.warn('[open_transacties] [CLIENT] Failed to update cache with aggregated data:', e);
              }
            }
          }
          return;
        }
      } catch (e) {
        console.warn('[open_transacties] [CLIENT] Failed to parse saved cache:', e);
      }
    }

    // Cache is invalid or missing, fetch new data
    const fetchStart = Date.now();
    setLoading(true);
    setError(null);

    const settings: Settings = {
      contactID: selectedContactID,
      locationID: selectedLocationID,
      year: selectedYear
    };

    try {
      const response = await fetch('/api/reports/open_transacties', {
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
      const parseStart = Date.now();
      const rawData: RawTransactionData[] = await response.json();
      const parseTime = Date.now() - parseStart;
      
      // Calculate approximate size
      const dataSize = JSON.stringify(rawData).length;
      const dataSizeMB = parseFloat((dataSize / (1024 * 1024)).toFixed(2));
      
      if (dataSizeMB > 4) {
        console.warn('[open_transacties] [CLIENT] ⚠️ Response size exceeds Next.js 4MB limit. Consider implementing pagination or data compression.');
      }
      
      // Cache the raw data and update cache key
      setCachedRawData(rawData);
      setCacheKey(currentCacheKey);
      
      // Aggregate raw data once (this is expensive, so we cache the result)
      console.log('[open_transacties] [CLIENT] Aggregating raw data (one-time operation)...');
      setAggregationProgress(0);
      const aggregated = await aggregateRawDataAsync(rawData, (progress) => {
        setAggregationProgress(progress);
      });
      setAggregationProgress(null);
      
      // Cache the aggregated data
      setCachedAggregatedData(aggregated);
      
      // Filter based on checkintype/checkouttype
      const filteredData = aggregated.filter(record => {
        const checkinType = (record.checkintype || 'unknown') as CheckType;
        const checkoutType = (record.checkouttype || 'unknown') as CheckType;
        const checkinMatch = selectedCheckinTypes.has(checkinType);
        const checkoutMatch = selectedCheckoutTypes.has(checkoutType);
        return checkinMatch && checkoutMatch;
      });
      
      // Process and set the data
      const processStart = Date.now();
      const processedData = processData(filteredData);
      setTransactionData(processedData);
      
      // Save to localStorage with both raw and aggregated data
      try {
        const saveStart = Date.now();
        const cacheData = {
          cachedRawData: rawData,
          cachedAggregatedData: aggregated,
          cacheKey: currentCacheKey
        };
        const cacheString = JSON.stringify(cacheData);
        const cacheSizeMB = cacheString.length / (1024 * 1024);
        
        // Check size before saving (localStorage limit is typically 5-10MB)
        if (cacheSizeMB > 4) {
          console.warn('[open_transacties] [CLIENT] Cache size too large (' + cacheSizeMB.toFixed(2) + 'MB), skipping localStorage save to avoid quota exceeded error');
          // Try saving only aggregated data (usually much smaller)
          try {
            const aggregatedOnly = {
              cachedAggregatedData: aggregated,
              cacheKey: currentCacheKey
            };
            const aggregatedString = JSON.stringify(aggregatedOnly);
            const aggregatedSizeMB = aggregatedString.length / (1024 * 1024);
            if (aggregatedSizeMB <= 4) {
              localStorage.setItem(CACHE_STORAGE_KEY, aggregatedString);
            }
          } catch (e2) {
            console.warn('[open_transacties] [CLIENT] Failed to save aggregated data to localStorage:', e2);
          }
        } else {
          localStorage.setItem(CACHE_STORAGE_KEY, cacheString);
        }
      } catch (e) {
        const errorMessage = e instanceof Error ? e.message : String(e);
        if (errorMessage.includes('QuotaExceededError') || errorMessage.includes('quota')) {
          console.warn('[open_transacties] [CLIENT] localStorage quota exceeded. Try clearing old cache data or use a smaller dataset.');
        } else {
        console.warn('[open_transacties] [CLIENT] Failed to save cache to localStorage:', e);
        }
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
  const getSortedData = (): AggregatedTransactionData[] => {
    if (!sortColumn) return transactionData;

    return [...transactionData].sort((a, b) => {
      let aValue: number | string;
      let bValue: number | string;

      if (sortColumn === 'date') {
        // Sort by date
        const aDate = new Date(a.date);
        const bDate = new Date(b.date);
        aValue = aDate.getTime();
        bValue = bDate.getTime();
      } else if (sortColumn === 'checkintype') {
        aValue = a.checkintype || 'onbekend';
        bValue = b.checkintype || 'onbekend';
      } else if (sortColumn === 'checkouttype') {
        aValue = a.checkouttype || 'onbekend';
        bValue = b.checkouttype || 'onbekend';
      } else if (sortColumn === 'openTransactionsForDay') {
        aValue = a.openTransactionsForDay;
        bValue = b.openTransactionsForDay;
      } else if (sortColumn === 'totalOpenTransactions') {
        aValue = a.totalOpenTransactions;
        bValue = b.totalOpenTransactions;
      } else {
        // Default: no sorting
        return 0;
      }

      if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  };

  // Prepare chart data with filtering applied
  const chartData = useMemo(() => {
    if (!cachedAggregatedData || cachedAggregatedData.length === 0) {
      return null;
    }

    // Filter aggregated data based on selected checkintype/checkouttype
    // Treat NULL values as 'unknown'
    const filteredAggregatedData = cachedAggregatedData.filter(record => {
      const checkinType = (record.checkintype || 'unknown') as CheckType;
      const checkoutType = (record.checkouttype || 'unknown') as CheckType;
      const checkinMatch = selectedCheckinTypes.has(checkinType);
      const checkoutMatch = selectedCheckoutTypes.has(checkoutType);
      return checkinMatch && checkoutMatch;
    });

    // Aggregate filtered data by date (much faster than re-aggregating from raw data)
    const aggregatedByDate = aggregateByDate(filteredAggregatedData);
    // Apply processData to filter future dates and recent checkins
    const processed = processData(aggregatedByDate);

    // Sort data by date for charts
    const sortedForChart = [...processed].sort((a, b) => {
      const aDate = new Date(a.date);
      const bDate = new Date(b.date);
      return aDate.getTime() - bDate.getTime();
    });

    const categories = sortedForChart.map(row => row.date);
    const openTransactionsForDay = sortedForChart.map(row => row.openTransactionsForDay);
    const totalOpenTransactions = sortedForChart.map(row => row.totalOpenTransactions);

    // Calculate max values for each series for y-axis scaling
    const maxOpenForDay = Math.max(...openTransactionsForDay, 1);
    const maxTotalOpen = Math.max(...totalOpenTransactions, 1);

    // Prepare synchronisatie annotations (vertical lines) if showControles is enabled
    // Use pre-processed synchronisatie dates Set for O(1) lookup
    const controleAnnotations: Array<{ x: string }> = [];
    if (showControles && processedControleDates.size > 0 && categories.length > 0) {
      // Convert categories to Set for fast lookup
      const categoriesSet = new Set(categories);
      
      // Only add annotations for dates that exist in both synchronisatie dates and categories
      processedControleDates.forEach(dateStr => {
        if (categoriesSet.has(dateStr)) {
          controleAnnotations.push({ x: dateStr });
        }
      });
    }

    return {
      categories,
      openTransactionsForDay,
      totalOpenTransactions,
      maxOpenForDay: Math.ceil(maxOpenForDay * 1.1), // Add 10% padding
      maxTotalOpen: Math.ceil(maxTotalOpen * 1.1), // Add 10% padding
      controleAnnotations
    };
  }, [cachedAggregatedData, selectedCheckinTypes, selectedCheckoutTypes, hideRecentCheckins, aggregateByDate, showControles, processedControleDates]);

  // Memoize chart options to ensure ApexCharts updates when showControles changes
  const chartOptions = useMemo(() => {
    if (!chartData) return null;
    
    return {
      chart: {
        id: 'open-transactions-chart',
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
      plotOptions: {
        bar: {
          horizontal: false,
          columnWidth: '55%',
          dataLabels: {
            position: 'top'
          }
        }
      },
      title: {
        text: 'Open transacties overzicht vs Datum',
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
        type: 'category',
        categories: chartData.categories,
        title: {
          text: 'Datum',
          align: 'left'
        },
        labels: {
          rotate: -45,
          rotateAlways: false,
          maxHeight: 100
        },
        // tickAmount: chartData.categories.length > 25 ? 25 : chartData.categories.length
      },
      yaxis: [
        {
          // Left y-axis for open transactions for day
          title: {
            text: 'Open transacties voor dag'
          },
          min: 0,
          max: chartData.maxOpenForDay,
          opposite: false
        },
        {
          // Right y-axis for total open transactions
          title: {
            text: 'Aantal open transacties'
          },
          min: 0,
          max: chartData.maxTotalOpen,
          opposite: true
        }
      ],
      tooltip: {
        enabled: true,
        shared: true,
        intersect: false,
        followCursor: true
      },
      colors: ['#3b82f6', '#22c55e'], // blue for open for day, green for total
      legend: {
        show: true,
        position: 'top'
      },
      annotations: {
        xaxis: showControles && chartData.controleAnnotations && chartData.controleAnnotations.length > 0 
          ? chartData.controleAnnotations.map(annotation => ({
              x: annotation.x,
              strokeDashArray: 0,
              borderColor: '#ef4444', // red color
              borderWidth: 2,
              label: {
                borderColor: '#ef4444',
                style: {
                  color: '#fff',
                  background: '#ef4444',
                  fontSize: '10px'
                },
                text: 'Synchronisatie',
                orientation: 'vertical'
              }
            }))
          : []
      }
    };
  }, [chartData, showControles]);

  // Toggle checkintype filter
  const toggleCheckinType = (type: CheckType) => {
    setSelectedCheckinTypes(prev => {
      const newSet = new Set(prev);
      if (newSet.has(type)) {
        newSet.delete(type);
      } else {
        newSet.add(type);
      }
      return newSet;
    });
  };

  // Toggle checkouttype filter
  const toggleCheckoutType = (type: CheckType) => {
    setSelectedCheckoutTypes(prev => {
      const newSet = new Set(prev);
      if (newSet.has(type)) {
        newSet.delete(type);
      } else {
        newSet.add(type);
      }
      return newSet;
    });
  };

  // Generate CSV
  const handleDownloadCSV = () => {
    const sortedData = getSortedData();
    if (sortedData.length === 0) return;

    const headers = [
      'Datum',
      'Check-in Type',
      'Check-out Type',
      'Aantal transacties (op deze dag)',
      'Aantal transacties (tot en met dag)'
    ];

    const rows = sortedData.map(row => [
      row.date,
      row.checkintype || 'onbekend',
      row.checkouttype || 'onbekend',
      row.openTransactionsForDay.toString(),
      row.totalOpenTransactions.toString()
    ]);

    const csvContent = [
      headers.map(h => `"${h.replace(/"/g, '""')}"`).join(','),
      ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `open_transacties_overzicht_${selectedYear}_${selectedLocationID}.csv`);
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
        gemeenten={gemeenten?.map(g => ({ ...g, CompanyName: g.CompanyName ?? undefined }))}
        exploitanten={exploitanten?.map(e => ({ ...e, CompanyName: e.CompanyName ?? undefined }))}
        isFietsberaad={isFietsberaad}
        onYearChange={(year) => {
          setSelectedYear(year);
        }}
        onContactChange={(contactID) => {
          setSelectedContactID(contactID);
          setSelectedLocationID(null);
        }}
        onLocationChange={setSelectedLocationID}
        yearFirst={true}
      />

      <div className="mb-6 space-y-4">
        {/* Checkintype Filters */}
        <div className="flex flex-col">
          <label className="text-sm font-medium text-gray-700 mb-2">
            Check-in Type
          </label>
          <div className="flex flex-wrap gap-4">
            {allCheckTypes.map(type => (
              <label key={type} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedCheckinTypes.has(type)}
                  onChange={() => toggleCheckinType(type)}
                  className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700 capitalize">{type === 'unknown' ? 'onbekend' : type}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Checkouttype Filters */}
        <div className="flex flex-col">
          <label className="text-sm font-medium text-gray-700 mb-2">
            Check-out Type
          </label>
          <div className="flex flex-wrap gap-4">
            {allCheckTypes.map(type => (
              <label key={type} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedCheckoutTypes.has(type)}
                  onChange={() => toggleCheckoutType(type)}
                  className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700 capitalize">{type === 'unknown' ? 'onbekend' : type}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Hide Recent Checkins Checkbox */}
        <div className="flex items-center gap-2 mt-4">
          <input
            type="checkbox"
            id="hideRecentCheckins"
            checked={hideRecentCheckins}
            onChange={(e) => setHideRecentCheckins(e.target.checked)}
            className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
          />
          <label htmlFor="hideRecentCheckins" className="text-sm font-medium text-gray-700 cursor-pointer">
            Verberg recente transacties (laatste 3 dagen)
          </label>
        </div>

        {/* Show Synchronisatie Checkbox */}
        <div className="flex items-center gap-2 mt-4">
          <input
            type="checkbox"
            id="showControles"
            checked={showControles}
            onChange={(e) => setShowControles(e.target.checked)}
            className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
          />
          <label htmlFor="showControles" className="text-sm font-medium text-gray-700 cursor-pointer">
            Toon synchronisatie
          </label>
        </div>

      </div>

      {/* Data Section */}
      <div className="mt-6">
        <h2 className="text-xl font-semibold mb-4">Transactie Detail Overzicht</h2>
        <div className="mb-4 flex gap-2">
          <button
            onClick={handleFetchData}
            disabled={loading || !selectedLocationID || aggregationProgress !== null}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            {aggregationProgress !== null 
              ? `Aggregeren (${aggregationProgress.toFixed(0)}%)` 
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

        {/* Chart for overview section */}
        {transactionData.length > 0 && chartData && chartOptions && (
          <div className="mb-6">
            <div className="bg-white p-4 border border-gray-300 rounded">
              {/* Chart descriptions */}
              <div className="mb-4 text-xs text-gray-600 space-y-1">
                <p>
                  Aantal transacties (op deze dag) geeft het aantal transacties weer dat op die specifieke dag is ingecheckt.
                </p>
                <p>
                  Aantal transacties (tot en met dag) geeft het totaal aantal nog openstaande transacties weer tot en met die dag (transacties die zijn ingecheckt maar nog niet zijn uitgecheckt).
                </p>
                <p>
                  De aantallen tot aan deze dag worden berekend vanaf de eerste dag in de grafiek.
                </p>
                <p>
                  De checkboxes voor Check-in Type en Check-out Type filteren welke transacties worden getoond in de grafiek en tabel. Alleen transacties met de geselecteerde types worden meegenomen in de berekeningen.
                </p>
              </div>
              <Chart
                type="bar"
                options={chartOptions}
                series={[
                  {
                    name: 'Aantal transacties (op deze dag)',
                    data: chartData.openTransactionsForDay,
                    yAxisIndex: 0 // Use first y-axis (left)
                  },
                  {
                    name: 'Aantal transacties (tot en met dag)',
                    data: chartData.totalOpenTransactions,
                    yAxisIndex: 1 // Use second y-axis (right)
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
                      Datum {sortColumn === 'date' && (sortDirection === 'asc' ? '↑' : '↓')}
                    </th>
                    <th 
                      className="border border-gray-300 px-4 py-2 text-left cursor-pointer hover:bg-gray-200 select-none bg-gray-100"
                      onClick={() => handleSort('checkintype')}
                    >
                      Check-in Type {sortColumn === 'checkintype' && (sortDirection === 'asc' ? '↑' : '↓')}
                    </th>
                    <th 
                      className="border border-gray-300 px-4 py-2 text-left cursor-pointer hover:bg-gray-200 select-none bg-gray-100"
                      onClick={() => handleSort('checkouttype')}
                    >
                      Check-out Type {sortColumn === 'checkouttype' && (sortDirection === 'asc' ? '↑' : '↓')}
                    </th>
                    <th 
                      className="border border-gray-300 px-4 py-2 text-right cursor-pointer hover:bg-gray-200 select-none bg-gray-100"
                      onClick={() => handleSort('openTransactionsForDay')}
                    >
                      Aantal transacties (op deze dag) {sortColumn === 'openTransactionsForDay' && (sortDirection === 'asc' ? '↑' : '↓')}
                    </th>
                    <th 
                      className="border border-gray-300 px-4 py-2 text-right cursor-pointer hover:bg-gray-200 select-none bg-gray-100"
                      onClick={() => handleSort('totalOpenTransactions')}
                    >
                      Aantal transacties (tot en met dag) {sortColumn === 'totalOpenTransactions' && (sortDirection === 'asc' ? '↑' : '↓')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {getSortedData().map((row, index) => (
                    <tr key={index} className="hover:bg-gray-50">
                      <td className="border border-gray-300 px-4 py-2">{row.date}</td>
                      <td className="border border-gray-300 px-4 py-2 capitalize">{row.checkintype || 'onbekend'}</td>
                      <td className="border border-gray-300 px-4 py-2 capitalize">{row.checkouttype || 'onbekend'}</td>
                      <td className="border border-gray-300 px-4 py-2 text-right">{row.openTransactionsForDay}</td>
                      <td className="border border-gray-300 px-4 py-2 text-right">{row.totalOpenTransactions}</td>
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

export default OpenTransactiesOverzichtComponent;

