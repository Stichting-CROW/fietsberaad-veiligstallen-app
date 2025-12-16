import React, { useState, useEffect, useMemo } from 'react';
import { useSession } from 'next-auth/react';
import { FietsenstallingenReportRow } from '~/pages/api/protected/database/fietsenstallingen-report';
import { getBeheerderContactOld, getBeheerderContactNew, formatBeheerderContactLink } from '~/utils/parkings-beheerder';

const EXPLOITANTNIETINGESTELD = 'Niet ingesteld';

const HelpdeskReportPage: React.FC = () => {
  const { data: session } = useSession();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>(undefined);
  const [data, setData] = useState<FietsenstallingenReportRow[]>([]);
  const [sortColumn, setSortColumn] = useState<string>('beheerder');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [filterDataeigenaar, setFilterDataeigenaar] = useState<string>('alle');
  const [filterBeheerder, setFilterBeheerder] = useState<string>('alle');
  const [filterType, setFilterType] = useState<string>('alle');
  const [filterHandmatig, setFilterHandmatig] = useState<string>('any');
  const [filterBeheerderField, setFilterBeheerderField] = useState<string>('alle');
  const [filterBeheerderContact, setFilterBeheerderContact] = useState<string>('alle');
  const [filterVerschillendOudNieuw, setFilterVerschillendOudNieuw] = useState<string>('alle');

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(undefined);
      try {
        const response = await fetch('/api/protected/database/fietsenstallingen-report', {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        });

        if (!response.ok) {
          throw new Error(`Error: ${response.statusText}`);
        }

        const result = await response.json() as FietsenstallingenReportRow[];
        setData(result);
      } catch (error) {
        console.error(error);
        setError("Fout bij ophalen van rapportgegevens");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const getOrgValue = (row: FietsenstallingenReportRow, column: string) => {
    if(row.exploitant) {
      return row.exploitant;
    }
    return row.dataeigenaar || EXPLOITANTNIETINGESTELD;
  }

  const handleSort = (column: string) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  // Helper function to check if handmatig is true (null and 0 are treated as false)
  const isHandmatigTrue = (value: boolean | number | null): boolean => {
    if (value === null) return false;
    if (value === true) return true;
    if (typeof value === 'number' && value === 1) return true;
    return false; // 0 or false
  };

  // Get unique filter values
  const uniqueDataeigenaars = useMemo(() => {
    const dataeigenaars = new Set<string>();
    data.forEach(row => {
      const dataeigenaar = row.dataeigenaar || EXPLOITANTNIETINGESTELD;
      // Only add non-empty dataeigenaars, exclude EXPLOITANTNIETINGESTELD since it's a hardcoded option
      if (dataeigenaar && dataeigenaar !== EXPLOITANTNIETINGESTELD) dataeigenaars.add(dataeigenaar);
    });
    return Array.from(dataeigenaars).sort();
  }, [data]);

  const uniqueBeheerders = useMemo(() => {
    const beheerders = new Set<string>();
    data.forEach(row => {
      // beheerder now shows dataowner CompanyName when ExploitantID is null
      // Only add non-empty beheerders, exclude empty strings since they're handled by EXPLOITANTNIETINGESTELD option
      if (row.exploitant && row.exploitant.trim() !== '') {
        beheerders.add(row.exploitant);
      }
    });
    // Filter out EXPLOITANTNIETINGESTELD from sorted array to avoid duplicates, then prepend it
    const sortedBeheerders = Array.from(beheerders).sort().filter(b => b !== EXPLOITANTNIETINGESTELD);
    return [EXPLOITANTNIETINGESTELD, ...sortedBeheerders];
  }, [data]);

  const uniqueTypes = useMemo(() => {
    const types = new Set<string>();
    data.forEach(row => {
      if (row.type) types.add(row.type);
    });
    return Array.from(types).sort();
  }, [data]);

  // Filter data
  const filteredData = useMemo(() => {
    return data.filter(row => {
      // Filter dataeigenaar
      if (filterDataeigenaar !== 'alle') {
        const rowDataeigenaar = row.dataeigenaar || EXPLOITANTNIETINGESTELD;
        if (rowDataeigenaar !== filterDataeigenaar) return false;
      }

      // Filter beheerder
      if (filterBeheerder !== 'alle') {
        // beheerder now shows dataowner CompanyName when ExploitantID is null
        const rowBeheerder = row.exploitant && row.exploitant.trim() !== '' ? row.exploitant : EXPLOITANTNIETINGESTELD;
        if (rowBeheerder !== filterBeheerder) return false;
      }

      // Filter type
      if (filterType !== 'alle') {
        if (row.type !== filterType) return false;
      }

      // Filter handmatig ingesteld
      if (filterHandmatig !== 'any') {
        // null is treated as false, only true or 1 is treated as true
        const isHandmatig = isHandmatigTrue(row.helpdeskHandmatigIngesteld);
        if (filterHandmatig === 'yes' && !isHandmatig) return false;
        if (filterHandmatig === 'no' && isHandmatig) return false;
      }

      // Filter beheerderField (Beheerder)
      if (filterBeheerderField !== 'alle') {
        const hasBeheerderField = row.beheerderField && row.beheerderField.trim() !== '';
        if (filterBeheerderField === 'ingesteld' && !hasBeheerderField) return false;
        if (filterBeheerderField === 'niet ingesteld' && hasBeheerderField) return false;
      }

      // Filter beheerderContact (Beheerder Contact)
      if (filterBeheerderContact !== 'alle') {
        const hasBeheerderContact = row.beheerderContact && row.beheerderContact.trim() !== '';
        if (filterBeheerderContact === 'ingesteld' && !hasBeheerderContact) return false;
        if (filterBeheerderContact === 'niet ingesteld' && hasBeheerderContact) return false;
      }

      // Filter verschillend oud/nieuw
      if (filterVerschillendOudNieuw !== 'alle') {
        const oldInfo = getBeheerderContactOld(
          row.exploitantID,
          row.beheerderField,
          row.beheerderContact,
          row.exploitant || null,
          row.exploitantHelpdesk || null,
          row.dataeigenaar || null,
          row.siteHelpdesk || null
        );
        const newInfo = getBeheerderContactNew(
          row.exploitantID,
          row.beheerderField,
          row.beheerderContact,
          row.helpdeskHandmatigIngesteld,
          row.exploitant || null,
          row.exploitantHelpdesk || null,
          row.dataeigenaar || null,
          row.siteHelpdesk || null
        );
        
        // If both are hidden (verborgen), they are the same - skip other comparisons
        if (!oldInfo.visible && !newInfo.visible) {
          // Both are verborgen, so they are the same
          const isDifferent = false;
          if (filterVerschillendOudNieuw === 'Ja' && !isDifferent) return false;
          if (filterVerschillendOudNieuw === 'Nee' && isDifferent) return false;
        } else {
          // At least one is visible, compare visibility and values
          const isDifferent = oldInfo.visible !== newInfo.visible || 
            (oldInfo.visible && newInfo.visible && 
             `${oldInfo.beheerder}|${oldInfo.beheerdercontact}` !== `${newInfo.beheerder}|${newInfo.beheerdercontact}`);
          
          if (filterVerschillendOudNieuw === 'Ja' && !isDifferent) return false;
          if (filterVerschillendOudNieuw === 'Nee' && isDifferent) return false;
        }
      }

      return true;
    });
  }, [data, filterDataeigenaar, filterBeheerder, filterType, filterHandmatig, filterBeheerderField, filterBeheerderContact, filterVerschillendOudNieuw]);

  const getSortedData = useMemo(() => {
    if (!filteredData.length) return [];

    return [...filteredData].sort((a, b) => {
      const getValue = (col: string, row: FietsenstallingenReportRow): string => {
        switch (col) {
          case 'dataeigenaar':
            return (row.dataeigenaar || EXPLOITANTNIETINGESTELD).toLowerCase();
          case 'beheerder':
            // beheerder now shows dataowner CompanyName when ExploitantID is null
            return (row.exploitant && row.exploitant.trim() !== '' ? row.exploitant : EXPLOITANTNIETINGESTELD).toLowerCase();
          case 'plaats':
            return (row.plaats || '---').toLowerCase();
          case 'type':
            return (row.type || '---').toLowerCase();
          case 'status':
            return (row.status === '1' ? 'actief' : 'niet actief').toLowerCase();
          case 'titel':
            return (row.title || '---').toLowerCase();
          case 'beheerderField':
            return (row.beheerderField || '---').toLowerCase();
          case 'beheerderContact':
            return (row.beheerderContact || '---').toLowerCase();
          case 'dataeigenaar':
            return (row.dataeigenaar || EXPLOITANTNIETINGESTELD).toLowerCase();
          case 'exploitant':
            return (row.exploitant && row.exploitant.trim() !== '' ? row.exploitant : EXPLOITANTNIETINGESTELD).toLowerCase();
          case 'siteHelpdesk':
            return (row.siteHelpdesk || '---').toLowerCase();
          case 'exploitantHelpdesk':
            return (row.exploitantHelpdesk || '---').toLowerCase();
          case 'helpdeskHandmatigIngesteld':
            // null is treated as false, only true or 1 is treated as true
            return isHandmatigTrue(row.helpdeskHandmatigIngesteld) ? 'ja' : 'nee';
          case 'helpdeskOud': {
            const oldInfoForSort = getBeheerderContactOld(
              row.exploitantID,
              row.beheerderField,
              row.beheerderContact,
              row.exploitant || null,
              row.exploitantHelpdesk || null,
              row.dataeigenaar || null,
              row.siteHelpdesk || null
            );
            return oldInfoForSort.visible ? (oldInfoForSort.beheerder || '').toLowerCase() : 'verborgen';
          }
          case 'helpdeskNieuw': {
            const newInfoForSort = getBeheerderContactNew(
              row.exploitantID,
              row.beheerderField,
              row.beheerderContact,
              row.helpdeskHandmatigIngesteld,
              row.exploitant || null,
              row.exploitantHelpdesk || null,
              row.dataeigenaar || null,
              row.siteHelpdesk || null
            );
            return newInfoForSort.visible ? (newInfoForSort.beheerder || '').toLowerCase() : 'verborgen';
          }
          default:
            return '';
        }
      };

      const compare = (col: string, dir: 'asc' | 'desc'): number => {
        const aValue = getValue(col, a);
        const bValue = getValue(col, b);
        const comparison = aValue.localeCompare(bValue);
        return dir === 'asc' ? comparison : -comparison;
      };

      // Primary sort by selected column
      const primaryResult = compare(sortColumn, sortDirection);
      if (primaryResult !== 0) return primaryResult;

      // Secondary and tertiary sorts for default order (beheerder, plaats, titel)
      // Only apply if primary sort is one of these three
      if (['beheerder', 'plaats', 'titel'].includes(sortColumn)) {
        // Determine secondary and tertiary sort columns
        let secondaryCol: string;
        let tertiaryCol: string;
        
        if (sortColumn === 'beheerder') {
          secondaryCol = 'plaats';
          tertiaryCol = 'titel';
        } else if (sortColumn === 'plaats') {
          secondaryCol = 'titel';
          tertiaryCol = 'beheerder';
        } else { // sortColumn === 'titel'
          secondaryCol = 'beheerder';
          tertiaryCol = 'plaats';
        }

        // Secondary sort
        const secondaryResult = compare(secondaryCol, 'asc');
        if (secondaryResult !== 0) return secondaryResult;

        // Tertiary sort
        return compare(tertiaryCol, 'asc');
      }

      // For helpdesk column, use default sort order as tiebreaker
      const beheerderResult = compare('beheerder', 'asc');
      if (beheerderResult !== 0) return beheerderResult;
      
      const plaatsResult = compare('plaats', 'asc');
      if (plaatsResult !== 0) return plaatsResult;
      
      return compare('titel', 'asc');
    });
  }, [filteredData, sortColumn, sortDirection]);

  if (!session) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="bg-yellow-50 border border-yellow-300 rounded-lg shadow-sm p-6 max-w-2xl mx-auto">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-6 w-6 text-yellow-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <div className="ml-3 flex-1">
              <h3 className="text-lg font-medium text-yellow-800 mb-2">
                Inloggen vereist
              </h3>
              <p className="text-sm text-yellow-700 mb-4">
                U moet ingelogd zijn om deze pagina te bekijken.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8" style={{ maxWidth: '80vw', width: '100%' }}>
      <div className="w-full">
        <div className="mb-4">
          <h1 className="text-3xl font-bold">Fietsenstalling Beheerder en Helpdesk Overzicht</h1>
        </div>

        {!loading && !error && data.length > 0 && (
          <div className="mb-4 flex flex-wrap gap-4">
            <div className="flex flex-col">
              <label className="text-sm font-medium text-gray-700 mb-1">Dataeigenaar</label>
              <select
                value={filterDataeigenaar}
                onChange={(e) => setFilterDataeigenaar(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-md text-sm"
              >
                <option value="alle">Alle</option>
                {uniqueDataeigenaars.map(dataeigenaar => (
                  <option key={dataeigenaar} value={dataeigenaar}>{dataeigenaar}</option>
                ))}
              </select>
            </div>
            <div className="flex flex-col">
              <label className="text-sm font-medium text-gray-700 mb-1">Exploitant</label>
              <select
                value={filterBeheerder}
                onChange={(e) => setFilterBeheerder(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-md text-sm"
              >
                <option value="alle">Alle</option>
                {uniqueBeheerders.map(beheerder => (
                  <option key={beheerder} value={beheerder}>{beheerder}</option>
                ))}
              </select>
            </div>
            <div className="flex flex-col">
              <label className="text-sm font-medium text-gray-700 mb-1">Type</label>
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-md text-sm"
              >
                <option value="alle">Alle</option>
                {uniqueTypes.map((type: string) => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
            </div>
            <div className="flex flex-col">
              <label className="text-sm font-medium text-gray-700 mb-1">Handmatig ingesteld</label>
              <select
                value={filterHandmatig}
                onChange={(e) => setFilterHandmatig(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-md text-sm"
              >
                <option value="any">Alle</option>
                <option value="no">Standaard helpdesk</option>
                <option value="yes">Handmatig ingesteld</option>
              </select>
            </div>
            <div className="flex flex-col">
              <label className="text-sm font-medium text-gray-700 mb-1">Beheerder</label>
              <select
                value={filterBeheerderField}
                onChange={(e) => setFilterBeheerderField(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-md text-sm"
              >
                <option value="alle">Alle</option>
                <option value="ingesteld">Ingevuld</option>
                <option value="niet ingesteld">Niet ingevuld</option>
              </select>
            </div>
            <div className="flex flex-col">
              <label className="text-sm font-medium text-gray-700 mb-1">Beheerder Contact</label>
              <select
                value={filterBeheerderContact}
                onChange={(e) => setFilterBeheerderContact(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-md text-sm"
              >
                <option value="alle">Alle</option>
                <option value="ingesteld">Ingevuld</option>
                <option value="niet ingesteld">Niet ingevuld</option>
              </select>
            </div>
            <div className="flex flex-col">
              <label className="text-sm font-medium text-gray-700 mb-1">Verschillend oud/nieuw</label>
              <select
                value={filterVerschillendOudNieuw}
                onChange={(e) => setFilterVerschillendOudNieuw(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-md text-sm"
              >
                <option value="alle">Alle</option>
                <option value="Nee">Nee</option>
                <option value="Ja">Ja</option>
              </select>
            </div>
          </div>
        )}
        
        {loading && (
          <div className="text-center py-8">
            <div className="spinner" style={{ margin: "auto" }}>
              <div className="loader"></div>
            </div>
            <p>Laden...</p>
          </div>
        )}

        {error && (
          <div className="text-center py-8">
            <div style={{ color: "red", fontWeight: "bold" }}>{error}</div>
          </div>
        )}

        {!loading && !error && (
          <div className="border border-gray-300 rounded-lg overflow-hidden" style={{ width: '100%', maxWidth: '80vw' }}>
            <div style={{ 
              maxHeight: 'calc(100vh - 300px)', 
              overflowX: 'auto', 
              overflowY: 'auto',
              position: 'relative'
            }}>
              <table className="min-w-full divide-y divide-gray-200" style={{ width: 'max-content', minWidth: '100%' }}>
                <thead className="bg-gray-50" style={{ position: 'sticky', top: 0, zIndex: 10 }}>
                  <tr>
                    <th 
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-b border-gray-200 cursor-pointer hover:bg-gray-100 select-none"
                      onClick={() => handleSort('dataeigenaar')}
                    >
                      Dataeigenaar
                      {sortColumn === 'dataeigenaar' && (
                        <span className="ml-1">{sortDirection === 'asc' ? '▲' : '▼'}</span>
                      )}
                    </th>
                    {/* <th 
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-b border-gray-200 cursor-pointer hover:bg-gray-100 select-none"
                      onClick={() => handleSort('siteHelpdesk')}
                    >
                      Helpdesk Dataeigenaar
                      {sortColumn === 'siteHelpdesk' && (
                        <span className="ml-1">{sortDirection === 'asc' ? '▲' : '▼'}</span>
                      )}
                    </th> */}
                    <th 
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-b border-gray-200 cursor-pointer hover:bg-gray-100 select-none"
                      onClick={() => handleSort('beheerder')}
                    >
                      Exploitant
                      {sortColumn === 'beheerder' && (
                        <span className="ml-1">{sortDirection === 'asc' ? '▲' : '▼'}</span>
                      )}
                    </th>
                    {/* <th 
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-b border-gray-200 cursor-pointer hover:bg-gray-100 select-none"
                      onClick={() => handleSort('exploitantHelpdesk')}
                    >
                      Exploitant Helpdesk
                      {sortColumn === 'exploitantHelpdesk' && (
                        <span className="ml-1">{sortDirection === 'asc' ? '▲' : '▼'}</span>
                      )}
                    </th> */}
                    <th 
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-b border-gray-200 cursor-pointer hover:bg-gray-100 select-none"
                      onClick={() => handleSort('titel')}
                    >
                      Titel / Plaats [Type]
                      {sortColumn === 'titel' && (
                        <span className="ml-1">{sortDirection === 'asc' ? '▲' : '▼'}</span>
                      )}
                    </th>
                    {/* <th 
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-b border-gray-200 cursor-pointer hover:bg-gray-100 select-none"
                      onClick={() => handleSort('plaats')}
                    >
                      Plaats
                      {sortColumn === 'plaats' && (
                        <span className="ml-1">{sortDirection === 'asc' ? '▲' : '▼'}</span>
                      )}
                    </th>
                    <th 
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-b border-gray-200 cursor-pointer hover:bg-gray-100 select-none"
                      onClick={() => handleSort('type')}
                    >
                      Type
                      {sortColumn === 'type' && (
                        <span className="ml-1">{sortDirection === 'asc' ? '▲' : '▼'}</span>
                      )}
                    </th> */}
                    {/* <th 
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-b border-gray-200 cursor-pointer hover:bg-gray-100 select-none"
                      onClick={() => handleSort('status')}
                    >
                      Status
                      {sortColumn === 'status' && (
                        <span className="ml-1">{sortDirection === 'asc' ? '▲' : '▼'}</span>
                      )}
                    </th> */}
                    <th 
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-b border-gray-200 cursor-pointer hover:bg-gray-100 select-none"
                      onClick={() => handleSort('helpdeskNieuw')}
                    >
                      Weergave
                      {sortColumn === 'helpdeskNieuw' && (
                        <span className="ml-1">{sortDirection === 'asc' ? '▲' : '▼'}</span>
                      )}
                    </th>
                    {filterVerschillendOudNieuw === 'Ja' && (
                      <th 
                        className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-b border-gray-200 cursor-pointer hover:bg-gray-100 select-none"
                        onClick={() => handleSort('helpdeskOud')}
                      >
                        Weergave Oud
                        {sortColumn === 'helpdeskOud' && (
                          <span className="ml-1">{sortDirection === 'asc' ? '▲' : '▼'}</span>
                        )}
                      </th>
                    )}
                    <th 
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-b border-gray-200 cursor-pointer hover:bg-gray-100 select-none"
                      onClick={() => handleSort('helpdeskHandmatigIngesteld')}
                    >
                      Handmatig
                      {sortColumn === 'helpdeskHandmatigIngesteld' && (
                        <span className="ml-1">{sortDirection === 'asc' ? '▲' : '▼'}</span>
                      )}
                    </th>
                    <th 
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-b border-gray-200 cursor-pointer hover:bg-gray-100 select-none"
                      onClick={() => handleSort('beheerderField')}
                    >
                      Beheerder
                      {sortColumn === 'beheerderField' && (
                        <span className="ml-1">{sortDirection === 'asc' ? '▲' : '▼'}</span>
                      )}
                    </th>
                    <th 
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-b border-gray-200 cursor-pointer hover:bg-gray-100 select-none"
                      onClick={() => handleSort('beheerderContact')}
                    >
                      Beheerder Contact
                      {sortColumn === 'beheerderContact' && (
                        <span className="ml-1">{sortDirection === 'asc' ? '▲' : '▼'}</span>
                      )}
                    </th>
                    <th 
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-b border-gray-200 cursor-pointer hover:bg-gray-100 select-none"                  
                    >
                      Standaard Helpdesk
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {getSortedData.length === 0 ? (
                    <tr>
                      <td colSpan={filterVerschillendOudNieuw === 'Ja' ? 13 : 12} className="px-6 py-4 text-center text-gray-500">
                        Geen gegevens beschikbaar
                      </td>
                    </tr>
                  ) : (
                    getSortedData.map((row, index) => {
                      const oldInfo = getBeheerderContactOld(
                        row.exploitantID,
                        row.beheerderField,
                        row.beheerderContact,
                        row.exploitant || null,
                        row.exploitantHelpdesk || null,
                        row.dataeigenaar || null,
                        row.siteHelpdesk || null
                      );
                      const newInfo = getBeheerderContactNew(
                        row.exploitantID,
                        row.beheerderField,
                        row.beheerderContact,
                        row.helpdeskHandmatigIngesteld,
                        row.exploitant || null,
                        row.exploitantHelpdesk || null,
                        row.dataeigenaar || null,
                        row.siteHelpdesk || null
                      );
                      const oldLink = formatBeheerderContactLink(oldInfo.beheerdercontact);
                      const newLink = formatBeheerderContactLink(newInfo.beheerdercontact);
                      
                      return (
                        <tr key={index} className="hover:bg-gray-50">
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {row.dataeigenaar || EXPLOITANTNIETINGESTELD}
                          </td>
                          {/* <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {row.siteHelpdesk || '---'}
                          </td> */}
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {row.exploitant && row.exploitant.trim() !== '' ? row.exploitant : EXPLOITANTNIETINGESTELD}
                          </td>
                          {/* <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {row.exploitantHelpdesk || '---'}
                          </td> */}
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {row.title || '---'} / {row.plaats || '---'} [{row.type || '---'}]
                          </td>
                          {/* <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {row.status === '1' ? 'Actief' : 'Niet Actief'}
                          </td> */}
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {newInfo.visible ? (
                              newLink.href ? (
                                <a 
                                  href={newLink.href}
                                  className="text-blue-600 hover:text-blue-800 hover:underline"
                                  title={newInfo.beheerdercontact}
                                >
                                  {newInfo.beheerder || newLink.displayText}
                                </a>
                              ) : (
                                <span>{newInfo.beheerder || '---'}</span>
                              )
                            ) : (
                              <span className="text-gray-400 italic">verborgen</span>
                            )}
                          </td>
                          {filterVerschillendOudNieuw === 'Ja' && (
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                              {oldInfo.visible ? (
                                oldLink.href ? (
                                  <a 
                                    href={oldLink.href}
                                    className="text-blue-600 hover:text-blue-800 hover:underline"
                                    title={oldInfo.beheerdercontact}
                                  >
                                    {oldInfo.beheerder || oldLink.displayText}
                                  </a>
                                ) : (
                                  <span>{oldInfo.beheerder || '---'}</span>
                                )
                              ) : (
                                <span className="text-gray-400 italic">verborgen</span>
                              )}
                            </td>
                          )}
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {/* null is treated as false, only true or 1 is treated as true */}
                            {isHandmatigTrue(row.helpdeskHandmatigIngesteld) ? 'Ja' : 'Nee'}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {row.beheerderField || '---'}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {row.beheerderContact || '---'}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {row.exploitantID !== null ? row.helpdeskHandmatigIngesteld : row.siteHelpdesk}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {!loading && !error && getSortedData.length > 0 && (
          <div className="mt-4 text-sm text-gray-600">
            Totaal: {getSortedData.length} fietsenstallingen
          </div>
        )}
      </div>
    </div>
  );
};

export default HelpdeskReportPage;

