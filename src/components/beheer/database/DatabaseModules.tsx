import React, { useState, useEffect } from 'react';
import { FiChevronDown, FiChevronUp, FiInfo } from 'react-icons/fi';

interface ModuleWithContacts {
  moduleID: string;
  moduleName: string | null;
  contacts: Array<{
    siteID: string;
    companyName: string | null;
  }>;
  contactsNotUsingModule: Array<{
    siteID: string;
    companyName: string | null;
  }>;
}

interface ModuleInconsistency {
  organisatie: string;
  organisatieID: string;
  inconsistentie: string;
  details: string;
  parkings: Array<{
    title: string | null;
    plaats: string | null;
    exploitantCompanyName: string | null;
    editorCreated: string | null;
  }>;
}

interface DatabaseModulesProps {}

const MAX_CONTACTS_DISPLAY = 15;

const DatabaseModules: React.FC<DatabaseModulesProps> = () => {
  const [modules, setModules] = useState<ModuleWithContacts[]>([]);
  const [inconsistencies, setInconsistencies] = useState<ModuleInconsistency[]>([]);
  const [inconsistentieFilter, setInconsistentieFilter] = useState<string>('all');
  const [aangemaaktDoorFilter, setAangemaaktDoorFilter] = useState<string>('all');
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingInconsistencies, setIsLoadingInconsistencies] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorInconsistencies, setErrorInconsistencies] = useState<string | null>(null);
  const [expandedModules, setExpandedModules] = useState<Set<string>>(new Set());
  const [expandedNotUsingModules, setExpandedNotUsingModules] = useState<Set<string>>(new Set());
  const [hoveredParkingKey, setHoveredParkingKey] = useState<string | null>(null);

  useEffect(() => {
    loadModules();
    loadInconsistencies();
  }, []);

  const loadModules = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/protected/database/modules');
      const result = await response.json();
      if (result.data) {
        setModules(result.data);
      } else if (result.error) {
        setError(result.error);
      }
    } catch (error) {
      console.error('Error loading modules:', error);
      setError('Fout bij het laden van modules');
    } finally {
      setIsLoading(false);
    }
  };

  const loadInconsistencies = async () => {
    setIsLoadingInconsistencies(true);
    setErrorInconsistencies(null);
    try {
      const response = await fetch('/api/protected/database/modules-inconsistencies');
      const result = await response.json();
      if (result.data) {
        setInconsistencies(result.data);
      } else if (result.error) {
        setErrorInconsistencies(result.error);
      }
    } catch (error) {
      console.error('Error loading inconsistencies:', error);
      setErrorInconsistencies('Fout bij het laden van inconsistente data');
    } finally {
      setIsLoadingInconsistencies(false);
    }
  };

  const toggleExpand = (moduleID: string) => {
    setExpandedModules((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(moduleID)) {
        newSet.delete(moduleID);
      } else {
        newSet.add(moduleID);
      }
      return newSet;
    });
  };

  const toggleExpandNotUsing = (moduleID: string) => {
    setExpandedNotUsingModules((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(moduleID)) {
        newSet.delete(moduleID);
      } else {
        newSet.add(moduleID);
      }
      return newSet;
    });
  };

  const renderContacts = (contacts: Array<{ siteID: string; companyName: string | null }>, moduleID: string, isExpanded: boolean, toggleFn: (id: string) => void) => {
    const shouldCollapse = contacts.length > MAX_CONTACTS_DISPLAY;

    if (contacts.length === 0) {
      return <span className="text-gray-400 italic">Geen organisaties</span>;
    }

    // If collapsed and should collapse, only show the expand button
    if (shouldCollapse && !isExpanded) {
      return (
        <button
          onClick={(e) => {
            e.stopPropagation();
            toggleFn(moduleID);
          }}
          className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800 font-medium"
        >
          <FiChevronDown className="h-4 w-4" />
          Toon alle {contacts.length} organisaties
        </button>
      );
    }

    // Show full list when expanded or when <= MAX_CONTACTS_DISPLAY
    return (
      <div>
        <ul className="list-disc list-inside space-y-1">
          {contacts.map((contact) => (
            <li key={contact.siteID}>
              {contact.companyName || contact.siteID}
            </li>
          ))}
        </ul>
        {shouldCollapse && isExpanded && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              toggleFn(moduleID);
            }}
            className="mt-2 flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800 font-medium"
          >
            <FiChevronUp className="h-4 w-4" />
            Toon minder ({contacts.length - MAX_CONTACTS_DISPLAY} verbergen)
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="p-6">
      <h1 className="text-3xl font-bold mb-4">Modules</h1>
      
      {error && (
        <div className="rounded-md bg-red-50 p-4 mb-4">
          <div className="text-sm text-red-800">{error}</div>
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <span className="ml-3 text-gray-600">Laden...</span>
        </div>
      ) : (
        <div className="bg-white shadow-sm rounded-lg overflow-hidden mb-8">
          <table className="divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Module naam
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  IN GEBRUIK BIJ
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  NIET IN GEBRUIK BIJ
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {modules.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-6 py-4 text-center text-sm text-gray-500">
                    Geen modules gevonden
                  </td>
                </tr>
              ) : (
                modules.map((module) => (
                  <tr key={module.moduleID} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {module.moduleName || module.moduleID}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      {renderContacts(
                        module.contacts,
                        module.moduleID,
                        expandedModules.has(module.moduleID),
                        toggleExpand
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      {renderContacts(
                        module.contactsNotUsingModule,
                        module.moduleID,
                        expandedNotUsingModules.has(module.moduleID),
                        toggleExpandNotUsing
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      <h2 className="text-2xl font-bold mb-4">Inconsistente data</h2>
      
      {errorInconsistencies && (
        <div className="rounded-md bg-red-50 p-4 mb-4">
          <div className="text-sm text-red-800">{errorInconsistencies}</div>
        </div>
      )}

      {isLoadingInconsistencies ? (
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <span className="ml-3 text-gray-600">Laden...</span>
        </div>
      ) : (
        <>
          {/* Filter dropdowns */}
          <div className="mb-4 flex gap-4">
            <div>
              <label htmlFor="inconsistentie-filter" className="block text-sm font-medium text-gray-700 mb-2">
                Filter op inconsistentie:
              </label>
              <select
                id="inconsistentie-filter"
                value={inconsistentieFilter}
                onChange={(e) => setInconsistentieFilter(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="all">Alle inconsistenties</option>
                {Array.from(new Set(inconsistencies.map(i => i.inconsistentie)))
                  .sort()
                  .map(type => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
              </select>
            </div>
            <div>
              <label htmlFor="aangemaakt-door-filter" className="block text-sm font-medium text-gray-700 mb-2">
                Aangemaakt door:
              </label>
              <select
                id="aangemaakt-door-filter"
                value={aangemaaktDoorFilter}
                onChange={(e) => setAangemaaktDoorFilter(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="all">Alle</option>
                <option value="NS-connector">NS-connector</option>
                <option value="anders">Anders</option>
              </select>
            </div>
          </div>

          {/* Group inconsistencies by organization */}
          {(() => {
            // Filter inconsistencies based on selected filters
            let filtered = inconsistentieFilter === 'all' 
              ? inconsistencies 
              : inconsistencies.filter(i => i.inconsistentie === inconsistentieFilter);

            // Filter by "Aangemaakt door"
            if (aangemaaktDoorFilter !== 'all') {
              filtered = filtered.filter(inconsistency => {
                const hasNSCreator = inconsistency.parkings.some(p => p.editorCreated === 'NS-connector');
                if (aangemaaktDoorFilter === 'NS-connector') {
                  return hasNSCreator;
                } else if (aangemaaktDoorFilter === 'anders') {
                  return !hasNSCreator;
                }
                return true;
              });
            }

            // Group by organization
            const grouped = new Map<string, ModuleInconsistency[]>();
            for (const inconsistency of filtered) {
              const key = inconsistency.organisatieID;
              if (!grouped.has(key)) {
                grouped.set(key, []);
              }
              grouped.get(key)!.push(inconsistency);
            }

            // Convert to array and sort by organization name
            const groupedArray = Array.from(grouped.entries())
              .map(([organisatieID, items]) => ({
                organisatieID,
                organisatie: items[0]?.organisatie || organisatieID,
                details: items.map(item => ({
                  text: item.details,
                  parkings: item.parkings || [],
                })),
              }))
              .sort((a, b) => (a.organisatie || '').localeCompare(b.organisatie || ''));

            return (
              <div className="bg-white shadow-sm rounded-lg overflow-hidden">
                <table className="divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Organisatie
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Details
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {groupedArray.length === 0 ? (
                      <tr>
                        <td colSpan={2} className="px-6 py-4 text-center text-sm text-gray-500">
                          Geen inconsistente data gevonden
                        </td>
                      </tr>
                    ) : (
                      groupedArray.map((group) => (
                        <tr key={group.organisatieID} className="hover:bg-gray-50">
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                            {group.organisatie}
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-500">
                            <div className="space-y-1">
                              {group.details.map((detail, index) => {
                                const parkingKey = `${group.organisatieID}-${index}`;
                                const isHovered = hoveredParkingKey === parkingKey;
                                return (
                                  <div key={index} className="flex items-center gap-2">
                                    <span>{detail.text}</span>
                                    {detail.parkings.length > 0 && (
                                      <div className="relative inline-block">
                                        <FiInfo
                                          className="h-4 w-4 text-blue-500 cursor-help"
                                          onMouseEnter={() => setHoveredParkingKey(parkingKey)}
                                          onMouseLeave={() => setHoveredParkingKey(null)}
                                        />
                                        {isHovered && (
                                          <div className="absolute z-10 left-0 mt-2 min-w-64 max-w-md p-3 bg-gray-900 text-white text-sm rounded-lg shadow-lg whitespace-nowrap">
                                            <div className="font-semibold mb-2">Gerelateerde stallingen:</div>
                                            <ul className="space-y-1">
                                              {detail.parkings.map((parking, pIndex) => (
                                                <li key={pIndex}>
                                                  {parking.title || 'Geen titel'}
                                                  {parking.plaats ? ` in ${parking.plaats}`: ` in onbekende plaats`}
                                                  {parking.exploitantCompanyName && ` [${parking.exploitantCompanyName}]`}
                                                </li>
                                              ))}
                                            </ul>
                                            <div className="absolute -top-1 left-4 w-2 h-2 bg-gray-900 transform rotate-45"></div>
                                          </div>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            );
          })()}
        </>
      )}
    </div>
  );
};

export default DatabaseModules;

