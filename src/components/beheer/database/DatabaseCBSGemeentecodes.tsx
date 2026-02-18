import React, { useState, useMemo, useEffect, useCallback } from 'react';

interface DatabaseCBSGemeentecodesProps {}

interface Contact {
  companyname: string;
  veiligstallen_gemeentecode: string;
  itemtype: string | null;
  fietsenstallingen_count: number;
}

interface CBSGemeentecodeHistory {
  cbscode: string;
  firstyear: string;
  lastyear: string;
}

interface CBSGemeentecode {
  name: string;
  history: CBSGemeentecodeHistory[];
}

interface CBSData {
  contacts: Contact[];
  cbs_gemeentecodes: CBSGemeentecode[];
}

type TabType = 'cbs' | 'veiligstallen';
type VeranderingenFilter = 'alles' | 'opgeheven' | 'nieuw' | 'ongewijzigd';
type VeiligstallenStatus =
  | 'ok'
  | 'bestaat_niet_meer'
  | 'hernoemd'
  | 'nieuwe_gemeente';
type StatusFilter =
  | 'all'
  | 'ok'
  | 'not_ok'
  | 'bestaat_niet_meer'
  | 'hernoemd'
  | 'nieuwe_gemeente';

const DatabaseCBSGemeentecodes: React.FC<DatabaseCBSGemeentecodesProps> = () => {
  const [activeTab, setActiveTab] = useState<TabType>('veiligstallen');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<CBSData | null>(null);
  const [filterText, setFilterText] = useState('');
  const [veranderingenFilter, setVeranderingenFilter] = useState<VeranderingenFilter>('alles');
  const [veiligstallenNameFilter, setVeiligstallenNameFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [alleenMetStallingen, setAlleenMetStallingen] = useState(false);
  const [isExportingRapport, setIsExportingRapport] = useState(false);

  const handleRapport = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/protected/database/cbs-gemeentecodes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Request failed' }));
        throw new Error(errorData.error || `Request failed with status ${response.status}`);
      }

      const result = await response.json();
      if (result.success && result.data) {
        setData(result.data);
      } else {
        throw new Error(result.error || 'Failed to load data');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred while loading data');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Load data automatically when component mounts
  useEffect(() => {
    handleRapport();
  }, [handleRapport]);

  // Get gemeentecode for a specific year
  const getCodeForYear = (gemeente: CBSGemeentecode, year: number): string => {
    const entry = gemeente.history.find(
      (h) => parseInt(h.firstyear) <= year && year <= parseInt(h.lastyear)
    );
    return entry ? entry.cbscode : '-';
  };

  // Pre-calculate cell info for all rows and years to determine horizontal merging (across columns)
  const calculateCellMerging = (
    gemeentecodes: CBSGemeentecode[],
    years: number[]
  ): Map<string, { colSpan: number; shouldRender: boolean }> => {
    const cellInfoMap = new Map<string, { colSpan: number; shouldRender: boolean }>();
    
    gemeentecodes.forEach((gemeente, rowIndex) => {
      let yearIndex = 0;
      
      while (yearIndex < years.length) {
        const year = years[yearIndex];
        if (year === undefined) break;
        const key = `${rowIndex}-${year}`;
        const currentCode = getCodeForYear(gemeente, year!);
        
        // Calculate how many consecutive years have the same code
        let span = 1;
        for (let i = yearIndex + 1; i < years.length; i++) {
          const nextYear = years[i];
          if (nextYear === undefined) break;
          const nextCode = getCodeForYear(gemeente, nextYear!);
          if (nextCode === currentCode) {
            span++;
          } else {
            break;
          }
        }
        
        cellInfoMap.set(key, {
          colSpan: span > 1 ? span : 1,
          shouldRender: true,
        });
        
        // Mark subsequent years in this span as should not render
        for (let i = yearIndex + 1; i < yearIndex + span; i++) {
          const yearToSkip = years[i];
          if (yearToSkip === undefined) break;
          const skipKey = `${rowIndex}-${yearToSkip}`;
          cellInfoMap.set(skipKey, {
            colSpan: 1,
            shouldRender: false,
          });
        }
        
        yearIndex += span;
      }
    });
    
    return cellInfoMap;
  };

  // Extract all unique years from the data (newest first, oldest last)
  const years = useMemo(() => {
    if (!data?.cbs_gemeentecodes) {
      return [];
    }
    
    const yearSet = new Set<number>();
    
    // Collect all years from all gemeenten's history
    data.cbs_gemeentecodes.forEach((gemeente) => {
      gemeente.history.forEach((entry) => {
        const firstYear = parseInt(entry.firstyear);
        const lastYear = parseInt(entry.lastyear);
        
        // Add all years in the range [firstYear, lastYear]
        for (let year = firstYear; year <= lastYear; year++) {
          yearSet.add(year);
        }
      });
    });
    
    // Convert to array, sort descending (newest first)
    return Array.from(yearSet).sort((a, b) => b - a);
  }, [data]);

  // Get oldest and newest years
  const oldestYear = years.length > 0 ? years[years.length - 1] : null;
  const newestYear = years.length > 0 ? years[0] : null;

  // Voor Veiligstallen-tab: alleen CBS gemeenten uit meest recente spreadsheet
  const cbsGemeentecodesNewestYear = useMemo(() => {
    if (!data?.cbs_gemeentecodes || newestYear === null) {
      return data?.cbs_gemeentecodes ?? [];
    }
    return data.cbs_gemeentecodes.filter(
      (gemeente) => getCodeForYear(gemeente, newestYear!) !== '-'
    );
  }, [data, newestYear]);

  // Filter CBS gemeentecodes by name and veranderingen type
  const filteredCBSGemeentecodes = useMemo(() => {
    if (!data?.cbs_gemeentecodes) {
      return [];
    }

    let filtered = data.cbs_gemeentecodes.filter((gemeente) =>
      gemeente.name.toLowerCase().includes(filterText.toLowerCase())
    );

    // Apply veranderingen filter
    if (veranderingenFilter === 'opgeheven' && newestYear !== null) {
      // Gemeenten that don't exist in the newest year
      filtered = filtered.filter((gemeente) => {
        const codeInNewestYear = getCodeForYear(gemeente, newestYear!);
        return codeInNewestYear === '-';
      });
    } else if (veranderingenFilter === 'nieuw' && oldestYear !== null && newestYear !== null) {
      // Gemeenten that didn't exist in the oldest year (2011) but still exist in the newest year (leftmost column)
      filtered = filtered.filter((gemeente) => {
        const codeInOldestYear = getCodeForYear(gemeente, oldestYear!);
        const codeInNewestYear = getCodeForYear(gemeente, newestYear!);
        return codeInOldestYear === '-' && codeInNewestYear !== '-';
      });
    } else if (veranderingenFilter === 'ongewijzigd' && oldestYear !== null && newestYear !== null) {
      // Gemeenten that have the same code throughout all years
      // This means they have only one history entry and it spans all years
      filtered = filtered.filter((gemeente) => {
        if (gemeente.history.length !== 1) {
          return false;
        }
        const entry = gemeente.history[0];
        if (!entry) return false;
        // Check if this entry spans all available years
        const entryFirstYear = parseInt(entry.firstyear);
        const entryLastYear = parseInt(entry.lastyear);
        return entryFirstYear <= oldestYear! && entryLastYear >= newestYear!;
      });
    }
    // 'alles' filter: no additional filtering needed

    return filtered;
  }, [data, filterText, veranderingenFilter, oldestYear, newestYear]);

  // Pre-calculate cell merging info (recalculate when filter changes)
  const cellMergingInfo = useMemo(() => {
    if (!data || filteredCBSGemeentecodes.length === 0) {
      return new Map<string, { colSpan: number; shouldRender: boolean }>();
    }
    return calculateCellMerging(filteredCBSGemeentecodes, years);
  }, [data, filteredCBSGemeentecodes, years]);

  // Get current gemeentecode (from history entry with highest lastyear)
  const getCurrentCode = (gemeente: CBSGemeentecode): string => {
    if (gemeente.history.length === 0) return '-';
    const sortedHistory = [...gemeente.history].sort((a, b) => 
      parseInt(b.lastyear) - parseInt(a.lastyear)
    );
    const latestEntry = sortedHistory[0];
    return latestEntry ? latestEntry.cbscode : '-';
  };

  // Rows voor Veiligstallen-tab: per code, CBS naam, VS naam, naam status
  // Codes = merge unique van CBS (meest recente jaar) en Veiligstallen
  // + individuele regels voor VS items zonder code
  const veiligstallenRows = useMemo(() => {
    if (!data?.cbs_gemeentecodes || !data?.contacts) return [];
    const orgContacts = data.contacts.filter(
      (c) => c.itemtype === 'organizations'
    );
    const codesFromCBS = new Set<string>();
    cbsGemeentecodesNewestYear.forEach((g) => {
      const code = getCurrentCode(g);
      if (code !== '-') codesFromCBS.add(code.padStart(4, '0'));
    });
    const codesFromVS = new Set<string>();
    data.contacts.forEach((c) => {
      const code = (c.veiligstallen_gemeentecode || '').padStart(4, '0');
      if (code && code !== '0000') codesFromVS.add(code);
    });
    const allCodes = [...new Set([...codesFromCBS, ...codesFromVS])].sort();
    const codeRows = allCodes.map((paddedCode) => {
      const matches = cbsGemeentecodesNewestYear.filter((g) => {
        const c = getCurrentCode(g);
        return c !== '-' && c.padStart(4, '0') === paddedCode;
      });
      const cbsGemeente =
        matches.length === 0
          ? undefined
          : matches.length === 1
            ? matches[0]
            : matches.reduce((a, b) => {
                const aLast = Math.max(
                  ...a.history.map((h) => parseInt(h.lastyear))
                );
                const bLast = Math.max(
                  ...b.history.map((h) => parseInt(h.lastyear))
                );
                return bLast > aLast ? b : a;
              });
      const vsContact =
        orgContacts.find(
          (c) =>
            (c.veiligstallen_gemeentecode || '').padStart(4, '0') === paddedCode
        ) ??
        data.contacts.find(
          (c) =>
            (c.veiligstallen_gemeentecode || '').padStart(4, '0') === paddedCode
        );
      const cbsName = cbsGemeente?.name ?? '---';
      const vsName = vsContact?.companyname ?? '----';
      const aantalStallingen = vsContact?.fietsenstallingen_count ?? 0;
      let status: VeiligstallenStatus;
      if (!cbsGemeente) {
        status = 'bestaat_niet_meer';
      } else if (!vsContact) {
        status = 'nieuwe_gemeente';
      } else if (
        cbsGemeente.name.toLowerCase() !== vsContact.companyname.toLowerCase()
      ) {
        status = 'hernoemd';
      } else {
        status = 'ok';
      }
      return { code: paddedCode, cbsName, vsName, status, aantalStallingen };
    });
    const noCodeRows = orgContacts
      .filter(
        (c) =>
          !c.veiligstallen_gemeentecode ||
          String(c.veiligstallen_gemeentecode).trim() === ''
      )
      .map((c) => ({
        code: '-',
        cbsName: '---',
        vsName: c.companyname,
        status: 'ok' as const,
        aantalStallingen: c.fietsenstallingen_count,
      }));
    return [...codeRows, ...noCodeRows];
  }, [data, cbsGemeentecodesNewestYear]);

  const escapeCsv = (value: string): string => {
    const str = String(value ?? '');
    if (str.includes('"') || str.includes(',') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const handleExportRapport = useCallback(() => {
    if (!veiligstallenRows.length) return;
    setIsExportingRapport(true);
    try {
      const headers = [
        'Code',
        'Status',
        'Veiligstallen Naam',
        'CBS Naam',
        'Aantal stallingen',
      ];
      const rows = veiligstallenRows.map((r) =>
        [
          escapeCsv(r.code),
          escapeCsv(r.status),
          escapeCsv(r.vsName),
          escapeCsv(r.cbsName),
          String(r.aantalStallingen),
        ].join(',')
      );
      const csv = [headers.join(','), ...rows].join('\n');
      const blob = new Blob(['\uFEFF' + csv], {
        type: 'text/csv; charset=utf-8',
      });
      const now = new Date();
      const filename = `cbs-rapport-${now.toISOString().slice(0, 10)}-${String(now.getHours()).padStart(2, '0')}-${String(now.getMinutes()).padStart(2, '0')}.csv`;
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export mislukt');
    } finally {
      setIsExportingRapport(false);
    }
  }, [veiligstallenRows]);

  return (
    <div className="p-6">
      <h1 className="text-3xl font-bold mb-4">CBS Gemeentecodes</h1>

      <div className="mb-6">
        <div className="mb-4 flex gap-2">
          <button
            onClick={handleRapport}
            disabled={isLoading}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? (
              <>
                <svg
                  className="animate-spin -ml-1 mr-3 h-5 w-5 text-white"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  ></circle>
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  ></path>
                </svg>
                Laden...
              </>
            ) : (
              'Refresh'
            )}
          </button>
          {data && (
            <button
              onClick={handleExportRapport}
              disabled={isLoading || isExportingRapport}
              className="inline-flex items-center px-4 py-2 border border-amber-500 text-sm font-medium rounded-md shadow-sm text-amber-700 bg-amber-50 hover:bg-amber-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-amber-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isExportingRapport ? (
                <>
                  <svg
                    className="animate-spin -ml-1 mr-2 h-4 w-4 text-amber-600"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Bezig...
                </>
              ) : (
                'Rapport'
              )}
            </button>
          )}
        </div>

        {error && (
          <div className="rounded-md bg-red-50 p-4 mb-4">
            <div className="text-sm text-red-800">{error}</div>
          </div>
        )}
      </div>

      {data && (
        <>
          {/* Tabs */}
          <div className="mb-6">
            <div className="border-b border-gray-200">
              <nav className="-mb-px flex space-x-8">
                <button
                  onClick={() => setActiveTab('veiligstallen')}
                  className={`py-2 px-1 border-b-2 font-medium text-sm ${
                    activeTab === 'veiligstallen'
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  Veiligstallen
                </button>
                <button
                  onClick={() => setActiveTab('cbs')}
                  className={`py-2 px-1 border-b-2 font-medium text-sm ${
                    activeTab === 'cbs'
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  CBS
                </button>
              </nav>
            </div>
          </div>

          {/* CBS Tab */}
          {activeTab === 'cbs' && (
            <div>
              <div className="mb-4 flex gap-4 items-center">
                <input
                  type="text"
                  placeholder="Filter op naam..."
                  value={filterText}
                  onChange={(e) => setFilterText(e.target.value)}
                  className="px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                />
                <select
                  value={veranderingenFilter}
                  onChange={(e) => setVeranderingenFilter(e.target.value as VeranderingenFilter)}
                  className="px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                >
                  <option value="alles">Alles</option>
                  <option value="opgeheven">Opgeheven</option>
                  <option value="nieuw">Nieuw</option>
                  <option value="ongewijzigd">Ongewijzigd</option>
                </select>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 border border-gray-300 table-fixed">
                  <colgroup>
                    <col style={{ width: 'auto', minWidth: '200px' }} />
                    <col style={{ width: '80px' }} />
                    {years.map((year) => (
                      <col key={`col-${year}`} style={{ width: '70px' }} />
                    ))}
                  </colgroup>
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border border-gray-300">
                        CBS Naam
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider border border-gray-300" style={{ width: '80px' }}>
                        Code
                      </th>
                      {years.map((year) => (
                        <th
                          key={year}
                          className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider border border-gray-300" style={{ width: '70px' }}
                        >
                          {year}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {filteredCBSGemeentecodes.length === 0 ? (
                      <tr>
                        <td
                          colSpan={years.length + 2}
                          className="px-6 py-4 text-center text-sm text-gray-500"
                        >
                          Geen gemeenten gevonden
                        </td>
                      </tr>
                    ) : (
                      filteredCBSGemeentecodes.map((gemeente, index) => {
                        const currentCode = getCurrentCode(gemeente);
                        return (
                          <tr key={gemeente.name} className="hover:bg-gray-50">
                            <td className="px-6 py-4 text-sm font-medium text-gray-900 border border-gray-300 break-words">
                              {gemeente.name}
                            </td>
                            <td className={`px-4 py-4 whitespace-nowrap text-sm border border-gray-300 text-right ${currentCode === '-' ? 'bg-gray-100 text-gray-400' : 'text-gray-500'}`} style={{ width: '80px' }}>
                              {currentCode}
                            </td>
                            {years.map((year) => {
                              const cellKey = `${index}-${year}`;
                              const cellInfo = cellMergingInfo.get(cellKey);
                              
                              // If cell info doesn't exist or shouldn't render, skip this cell
                              if (!cellInfo || !cellInfo.shouldRender) {
                                return null;
                              }

                              const code = getCodeForYear(gemeente, year);
                              const isDash = code === '-';

                              return (
                                <td
                                  key={year}
                                  colSpan={cellInfo.colSpan > 1 ? cellInfo.colSpan : 1}
                                  className={`px-4 py-4 whitespace-nowrap text-sm border border-gray-300 text-right ${isDash ? 'bg-gray-100 text-gray-400' : 'text-gray-500'}`}
                                  style={{ width: '70px' }}
                                >
                                  {code}
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Veiligstallen Tab */}
          {activeTab === 'veiligstallen' && (
            <div>
              <div className="mb-4 flex gap-4 items-center flex-wrap">
                <input
                  type="text"
                  placeholder="Filter op naam (CBS of Veiligstallen)..."
                  value={veiligstallenNameFilter}
                  onChange={(e) => setVeiligstallenNameFilter(e.target.value)}
                  className="px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                />
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
                  className="px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                >
                  <option value="all">Status: Alles</option>
                  <option value="ok">Status: Ok</option>
                  <option value="not_ok">Status: Not ok</option>
                  <option value="bestaat_niet_meer">Status: Bestaat niet meer</option>
                  <option value="hernoemd">Status: Hernoemd</option>
                  <option value="nieuwe_gemeente">Status: Nieuwe gemeente</option>
                </select>
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={alleenMetStallingen}
                    onChange={(e) => setAlleenMetStallingen(e.target.checked)}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-700">
                    Alleen met stallingen (&gt;0)
                  </span>
                </label>
              </div>
              <div className="overflow-x-auto w-fit">
                <table className="table-auto divide-y divide-gray-200 border border-gray-300">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border border-gray-300">
                        Code
                      </th>
                      <th
                        className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border border-gray-300 cursor-help"
                        title="Ok: namen komen overeen of geen code. Bestaat niet meer: niet in CBS. Hernoemd: namen wijken af. Nieuwe gemeente: niet in Veiligstallen."
                      >
                        Status
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border border-gray-300">
                        Veiligstallen Naam
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border border-gray-300">
                        CBS Naam
                      </th>
                      <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border border-gray-300">
                        Aantal stallingen
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {(() => {
                      let filtered = veiligstallenRows;
                      if (veiligstallenNameFilter) {
                        const q = veiligstallenNameFilter.toLowerCase();
                        filtered = filtered.filter(
                          (r) =>
                            r.cbsName.toLowerCase().includes(q) ||
                            r.vsName.toLowerCase().includes(q)
                        );
                      }
                      if (statusFilter !== 'all') {
                        filtered = filtered.filter((r) =>
                          statusFilter === 'not_ok'
                            ? r.status !== 'ok'
                            : r.status === statusFilter
                        );
                      }
                      if (alleenMetStallingen) {
                        filtered = filtered.filter(
                          (r) => r.aantalStallingen > 0
                        );
                      }
                      if (filtered.length === 0) {
                        return (
                          <tr>
                            <td
                              colSpan={5}
                              className="px-6 py-4 text-center text-sm text-gray-500"
                            >
                              Geen rijen gevonden
                            </td>
                          </tr>
                        );
                      }
                      return filtered.map((row, idx) => (
                        <tr
                          key={row.code === '-' ? `no-code-${row.vsName}-${idx}` : row.code}
                          className="hover:bg-gray-50"
                        >
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 border border-gray-300">
                            {row.code}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-center border border-gray-300">
                            {row.status === 'ok' ? (
                              <span className="text-green-600 font-medium">Ok</span>
                            ) : row.status === 'bestaat_niet_meer' ? (
                              <span
                                className="text-red-600 font-medium cursor-help"
                                title="Code komt niet meer voor in CBS (opgeheven)"
                              >
                                Bestaat niet meer
                              </span>
                            ) : row.status === 'hernoemd' ? (
                              <span
                                className="text-amber-600 font-medium cursor-help"
                                title="CBS naam wijkt af van Veiligstallen naam"
                              >
                                Hernoemd
                              </span>
                            ) : (
                              <span
                                className="text-blue-600 font-medium cursor-help"
                                title="Gemeente in CBS maar nog niet in Veiligstallen"
                              >
                                Nieuwe gemeente
                              </span>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 border border-gray-300">
                            {row.vsName}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 border border-gray-300">
                            {row.cbsName}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-center text-gray-500 border border-gray-300">
                            {row.aantalStallingen}
                          </td>
                        </tr>
                      ));
                    })()}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default DatabaseCBSGemeentecodes;
