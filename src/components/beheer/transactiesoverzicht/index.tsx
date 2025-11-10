import React, { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useGemeentenInLijst } from '~/hooks/useGemeenten';
import { useExploitanten } from '~/hooks/useExploitanten';
import { useFietsenstallingtypen } from '~/hooks/useFietsenstallingtypen';
import type { ParkingDetailsType } from '~/types/parking';

// Interval durations constant - can be changed later to be user-configurable
const INTERVAL_DURATIONS = [12, 12]; // Two 12-hour intervals per day

interface TransactionIntervalData {
  date: string;
  startTime: string;
  transactionsStarted: number;
  openTransactionsAtStart: number;
  transactionsEnded: {
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
  const [parkingLocations, setParkingLocations] = useState<ParkingDetailsType[]>([]);
  const [filteredParkingLocations, setFilteredParkingLocations] = useState<ParkingDetailsType[]>([]);
  const [transactionData, setTransactionData] = useState<TransactionIntervalData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      setTransactionData(data);
    } catch (err) {
      console.error('Error fetching transaction data:', err);
      setError(err instanceof Error ? err.message : 'Fout bij ophalen van data');
    } finally {
      setLoading(false);
    }
  };

  // Generate CSV
  const handleDownloadCSV = () => {
    if (transactionData.length === 0) return;

    const headers = [
      'Datum + Starttijd',
      'Transacties gestart',
      'Open transacties bij start',
      'Transacties beëindigd (≤1u)',
      'Transacties beëindigd (1-3u)',
      'Transacties beëindigd (3-6u)',
      'Transacties beëindigd (6-9u)',
      'Transacties beëindigd (9-13u)',
      'Transacties beëindigd (13-18u)',
      'Transacties beëindigd (18-24u)',
      'Transacties beëindigd (24-36u)',
      'Transacties beëindigd (36-48u)',
      'Transacties beëindigd (48u-1w)',
      'Transacties beëindigd (1w-2w)',
      'Transacties beëindigd (2w-3w)',
      'Transacties beëindigd (>3w)'
    ];

    const rows = transactionData.map(row => [
      `${row.date} ${row.startTime}`,
      row.transactionsStarted.toString(),
      row.openTransactionsAtStart.toString(),
      row.transactionsEnded.duration_leq_1h.toString(),
      row.transactionsEnded.duration_1_3h.toString(),
      row.transactionsEnded.duration_3_6h.toString(),
      row.transactionsEnded.duration_6_9h.toString(),
      row.transactionsEnded.duration_9_13h.toString(),
      row.transactionsEnded.duration_13_18h.toString(),
      row.transactionsEnded.duration_18_24h.toString(),
      row.transactionsEnded.duration_24_36h.toString(),
      row.transactionsEnded.duration_36_48h.toString(),
      row.transactionsEnded.duration_48h_1w.toString(),
      row.transactionsEnded.duration_1w_2w.toString(),
      row.transactionsEnded.duration_2w_3w.toString(),
      row.transactionsEnded.duration_gt_3w.toString()
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

      {/* Transactions Overview Section */}
      <div className="mt-6">
        <h2 className="text-xl font-semibold mb-4">Transactions Overview</h2>
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

        {transactionData.length > 0 && (
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse border border-gray-300">
              <thead>
                <tr className="bg-gray-100">
                  <th className="border border-gray-300 px-4 py-2 text-left">Datum + Starttijd</th>
                  <th className="border border-gray-300 px-4 py-2 text-right">Transacties gestart</th>
                  <th className="border border-gray-300 px-4 py-2 text-right">Open transacties bij start</th>
                  <th className="border border-gray-300 px-4 py-2 text-right">≤1u</th>
                  <th className="border border-gray-300 px-4 py-2 text-right">1-3u</th>
                  <th className="border border-gray-300 px-4 py-2 text-right">3-6u</th>
                  <th className="border border-gray-300 px-4 py-2 text-right">6-9u</th>
                  <th className="border border-gray-300 px-4 py-2 text-right">9-13u</th>
                  <th className="border border-gray-300 px-4 py-2 text-right">13-18u</th>
                  <th className="border border-gray-300 px-4 py-2 text-right">18-24u</th>
                  <th className="border border-gray-300 px-4 py-2 text-right">24-36u</th>
                  <th className="border border-gray-300 px-4 py-2 text-right">36-48u</th>
                  <th className="border border-gray-300 px-4 py-2 text-right">48u-1w</th>
                  <th className="border border-gray-300 px-4 py-2 text-right">1w-2w</th>
                  <th className="border border-gray-300 px-4 py-2 text-right">2w-3w</th>
                  <th className="border border-gray-300 px-4 py-2 text-right">>3w</th>
                </tr>
              </thead>
              <tbody>
                {transactionData.map((row, index) => (
                  <tr key={index} className="hover:bg-gray-50">
                    <td className="border border-gray-300 px-4 py-2">{row.date} {row.startTime}</td>
                    <td className="border border-gray-300 px-4 py-2 text-right">{row.transactionsStarted}</td>
                    <td className="border border-gray-300 px-4 py-2 text-right">{row.openTransactionsAtStart}</td>
                    <td className="border border-gray-300 px-4 py-2 text-right">{row.transactionsEnded.duration_leq_1h}</td>
                    <td className="border border-gray-300 px-4 py-2 text-right">{row.transactionsEnded.duration_1_3h}</td>
                    <td className="border border-gray-300 px-4 py-2 text-right">{row.transactionsEnded.duration_3_6h}</td>
                    <td className="border border-gray-300 px-4 py-2 text-right">{row.transactionsEnded.duration_6_9h}</td>
                    <td className="border border-gray-300 px-4 py-2 text-right">{row.transactionsEnded.duration_9_13h}</td>
                    <td className="border border-gray-300 px-4 py-2 text-right">{row.transactionsEnded.duration_13_18h}</td>
                    <td className="border border-gray-300 px-4 py-2 text-right">{row.transactionsEnded.duration_18_24h}</td>
                    <td className="border border-gray-300 px-4 py-2 text-right">{row.transactionsEnded.duration_24_36h}</td>
                    <td className="border border-gray-300 px-4 py-2 text-right">{row.transactionsEnded.duration_36_48h}</td>
                    <td className="border border-gray-300 px-4 py-2 text-right">{row.transactionsEnded.duration_48h_1w}</td>
                    <td className="border border-gray-300 px-4 py-2 text-right">{row.transactionsEnded.duration_1w_2w}</td>
                    <td className="border border-gray-300 px-4 py-2 text-right">{row.transactionsEnded.duration_2w_3w}</td>
                    <td className="border border-gray-300 px-4 py-2 text-right">{row.transactionsEnded.duration_gt_3w}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default TransactiesOverzichtComponent;

