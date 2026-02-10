import React, { useState, useMemo, useEffect } from 'react';

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
type StatusFilter = 'all' | 'ok' | 'not ok';

const DatabaseCBSGemeentecodes: React.FC<DatabaseCBSGemeentecodesProps> = () => {
  const [activeTab, setActiveTab] = useState<TabType>('veiligstallen');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<CBSData | null>(null);
  const [filterText, setFilterText] = useState('');
  const [veranderingenFilter, setVeranderingenFilter] = useState<VeranderingenFilter>('alles');
  const [veiligstallenNameFilter, setVeiligstallenNameFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [itemTypeFilter, setItemTypeFilter] = useState<string>('organizations');

  const handleRapport = async () => {
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
  };

  // Load data automatically when component mounts
  useEffect(() => {
    handleRapport();
  }, []);

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

  // Find CBS gemeente by name (case-insensitive)
  const findCBSGemeenteByName = (name: string): CBSGemeentecode | undefined => {
    if (!data?.cbs_gemeentecodes) return undefined;
    return data.cbs_gemeentecodes.find(
      (gemeente) => gemeente.name.toLowerCase() === name.toLowerCase()
    );
  };

  // Check if contact name exists in CBS data
  const checkNaamStatus = (contact: Contact): boolean => {
    return findCBSGemeenteByName(contact.companyname) !== undefined;
  };

  // Check if CBS code matches Veiligstallen code
  const checkCBSCodeStatus = (contact: Contact): boolean | null => {
    const cbsGemeente = findCBSGemeenteByName(contact.companyname);
    if (!cbsGemeente) {
      return null; // No corresponding name in CBS database
    }
    const cbsCode = getCurrentCode(cbsGemeente);
    if (cbsCode === '-') {
      return false;
    }
    // Veiligstallen code is already padded in the backend
    const veiligstallenCode = contact.veiligstallen_gemeentecode || '';
    return cbsCode === veiligstallenCode;
  };

  // Find Veiligstallen contact by gemeentecode
  const findVeiligstallenByCode = (code: string): Contact | undefined => {
    if (!data?.contacts || !code || code === '-') {
      return undefined;
    }
    // Pad code to 4 digits for comparison
    const paddedCode = code.padStart(4, '0');
    return data.contacts.find(contact => 
      contact.veiligstallen_gemeentecode === paddedCode
    );
  };

  // Find CBS gemeenten that don't exist in Veiligstallen data
  const cbsNotInVeiligstallen = useMemo(() => {
    if (!data?.cbs_gemeentecodes || !data?.contacts) {
      return [];
    }
    
    // Create a set of all Veiligstallen company names (case-insensitive)
    const veiligstallenNames = new Set(
      data.contacts.map(contact => contact.companyname.toLowerCase())
    );
    
    // Filter CBS gemeenten that don't have a matching name in Veiligstallen
    return data.cbs_gemeentecodes.filter(gemeente => 
      !veiligstallenNames.has(gemeente.name.toLowerCase())
    );
  }, [data]);

  return (
    <div className="p-6">
      <h1 className="text-3xl font-bold mb-4">CBS Gemeentecodes</h1>

      <div className="mb-6">
        <div className="mb-4">
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
                  onClick={() => setActiveTab('cbs')}
                  className={`py-2 px-1 border-b-2 font-medium text-sm ${
                    activeTab === 'cbs'
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  CBS
                </button>
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
                          <tr key={index} className="hover:bg-gray-50">
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
                  placeholder="Filter op naam..."
                  value={veiligstallenNameFilter}
                  onChange={(e) => setVeiligstallenNameFilter(e.target.value)}
                  className="px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                />
                <select
                  value={itemTypeFilter}
                  onChange={(e) => setItemTypeFilter(e.target.value)}
                  className="px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                >
                  <option value="all">ItemType: Alles</option>
                  <option value="admin">Admin</option>
                  <option value="dataprovider">Dataprovider</option>
                  <option value="exploitant">Exploitant</option>
                  <option value="organizations">Organizations</option>
                </select>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
                  className="px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                >
                  <option value="all">Status: Alles</option>
                  <option value="ok">Status: OK</option>
                  <option value="not ok">Status: Niet OK</option>
                </select>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 border border-gray-300">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border border-gray-300">
                        Naam
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border border-gray-300">
                        Veiligstallen Gemeentecode
                      </th>
                      <th 
                        className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border border-gray-300 cursor-help"
                        title="Groen vinkje: de naam van de organisatie in Veiligstallen komt voor in de CBS database. Rood kruis: de naam komt niet voor in de CBS database. Koppeling informatie: de naam van de organisatie in Veiligstallen wordt vergeleken met de CBS gemeentenaam (vergelijking is hoofdletterongevoelig)."
                      >
                        Naam Status
                      </th>
                      <th 
                        className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border border-gray-300 cursor-help"
                        title="Groen vinkje: de CBS gemeentecode komt overeen met de Veiligstallen gemeentecode. Rood kruis: de codes komen niet overeen. Streepje: de naam van de organisatie komt niet voor in de CBS database. Koppeling informatie: eerst wordt de CBS gemeente gevonden op basis van de naam van de organisatie in Veiligstallen (hoofdletterongevoelig), daarna wordt de huidige CBS gemeentecode vergeleken met de Veiligstallen gemeentecode (beide opgevuld tot 4 cijfers met voorloopnullen)."
                      >
                        CBSCode Status
                      </th>
                      <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border border-gray-300">
                        Fietsenstallingen
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {(() => {
                      // Filter contacts based on name, itemtype and status filters
                      let filteredContacts = data.contacts.filter((contact) => {
                        // Name filter
                        if (veiligstallenNameFilter && !contact.companyname.toLowerCase().includes(veiligstallenNameFilter.toLowerCase())) {
                          return false;
                        }
                        
                        // ItemType filter
                        if (itemTypeFilter !== 'all') {
                          if (contact.itemtype !== itemTypeFilter) {
                            return false;
                          }
                        }
                        
                        // Combined status filter (both naam and cbscode must be OK)
                        if (statusFilter !== 'all') {
                          const naamStatus = checkNaamStatus(contact);
                          const cbsCodeStatus = checkCBSCodeStatus(contact);
                          const bothOk = naamStatus && cbsCodeStatus === true;
                          
                          if (statusFilter === 'ok' && !bothOk) {
                            return false;
                          }
                          if (statusFilter === 'not ok' && bothOk) {
                            return false;
                          }
                        }
                        
                        return true;
                      });
                      
                      if (filteredContacts.length === 0) {
                        return (
                          <tr>
                            <td
                              colSpan={4}
                              className="px-6 py-4 text-center text-sm text-gray-500"
                            >
                              Geen contacten gevonden
                            </td>
                          </tr>
                        );
                      }
                      
                      return filteredContacts.map((contact, index) => {
                        const naamStatus = checkNaamStatus(contact);
                        const cbsCodeStatus = checkCBSCodeStatus(contact);
                        
                        return (
                          <tr key={index} className="hover:bg-gray-50">
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 border border-gray-300">
                              {contact.companyname}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 border border-gray-300">
                              {contact.veiligstallen_gemeentecode || '-'}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-center border border-gray-300">
                              {naamStatus ? (
                                <span className="text-green-600 font-bold">✓</span>
                              ) : (
                                <span className="text-red-600 font-bold">✗</span>
                              )}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-center border border-gray-300">
                              {cbsCodeStatus === null ? (
                                <span className="text-gray-400">-</span>
                              ) : cbsCodeStatus ? (
                                <span className="text-green-600 font-bold">✓</span>
                              ) : (
                                <span className="text-red-600 font-bold">✗</span>
                              )}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-center text-gray-500 border border-gray-300">
                              {contact.fietsenstallingen_count}
                            </td>
                          </tr>
                        );
                      });
                    })()}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* CBS Not in Veiligstallen Table */}
          {data && (
            <div className="mt-8">
              <h2 className="text-2xl font-bold mb-4">CBS Gemeenten niet in Veiligstallen</h2>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 border border-gray-300">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border border-gray-300">
                        Naam
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider border border-gray-300">
                        Code
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border border-gray-300">
                        Veiligstallen Naam
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {cbsNotInVeiligstallen.length === 0 ? (
                      <tr>
                        <td
                          colSpan={3}
                          className="px-6 py-4 text-center text-sm text-gray-500"
                        >
                          Geen CBS gemeenten gevonden die niet in Veiligstallen voorkomen
                        </td>
                      </tr>
                    ) : (
                      cbsNotInVeiligstallen.map((gemeente, index) => {
                        const currentCode = getCurrentCode(gemeente);
                        const matchingContact = findVeiligstallenByCode(currentCode);
                        return (
                          <tr key={index} className="hover:bg-gray-50">
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 border border-gray-300">
                              {gemeente.name}
                            </td>
                            <td className={`px-6 py-4 whitespace-nowrap text-sm border border-gray-300 text-right ${currentCode === '-' ? 'bg-gray-100 text-gray-400' : 'text-gray-500'}`}>
                              {currentCode}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 border border-gray-300">
                              {matchingContact ? matchingContact.companyname : ''}
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
        </>
      )}
    </div>
  );
};

export default DatabaseCBSGemeentecodes;
