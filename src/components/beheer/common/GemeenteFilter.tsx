import React, { useEffect, useRef } from 'react';
import CollapsibleContent from './CollapsibleContent';
import type { VSContactGemeenteInLijst } from "~/types/contacts";
import type { VSUserWithRolesNew } from "~/types/users";
import { useDispatch, useSelector } from 'react-redux';
import { SearchFilter } from '~/components/common/SearchFilter';
import { AVAILABLE_MODULES } from '~/types/modules';
import { useModulesContacts } from '~/hooks/useModulesContacts';

import { 
  setNameFilter,
  setShowGemeentenWithoutStallingen,
  setShowGemeentenWithoutUsers,
  setShowGemeentenWithoutExploitanten,
  setSelectedModuleFilter,
  resetFilters,
  selectGemeenteFilters,
} from '~/store/gemeenteFiltersSlice';

interface GemeenteFilterProps {
  gemeenten: VSContactGemeenteInLijst[];
  users: VSUserWithRolesNew[];
  onFilterChange: (filteredGemeenten: VSContactGemeenteInLijst[]) => void;
  showStallingenFilter?: boolean;
  showUsersFilter?: boolean;
  showExploitantenFilter?: boolean;
  showModulesFilter?: boolean;
}

const GemeenteFilter: React.FC<GemeenteFilterProps> = ({
  gemeenten,
  users,
  onFilterChange,
  showStallingenFilter = false,
  showUsersFilter = false,
  showExploitantenFilter = false,
  showModulesFilter = false,
}) => {
  const dispatch = useDispatch();
  const filters = useSelector(selectGemeenteFilters);
  const nameInputRef = useRef<HTMLInputElement>(null);

  const allModulesContacts = useModulesContacts();

  // console.log(`*** GemeenteFilter - filters: ${JSON.stringify(filters)}`);
  // console.log(`*** GemeenteFilter - gemeenten:`, gemeenten);
  // console.log(`*** GemeenteFilter - users:`, users);

  // Initialize filters if they don't exist
  useEffect(() => {
    if (!filters) {
      dispatch(resetFilters());
    }
  }, [dispatch, filters]);

  useEffect(() => {
    // Focus the input field when the component mounts
    if (nameInputRef.current) {
      nameInputRef.current.focus();
    }
  }, []);

  const handleNameFilterChange = (value: string) => {
    dispatch(setNameFilter(value));
  };

  const handleResetFilters = () => {
    dispatch(resetFilters());
    if (nameInputRef.current) {
      nameInputRef.current.focus();
    }
  };

  const getModulesForGemeente = (gemeenteId: string) => {
    return allModulesContacts.modulesContacts.filter(mc => mc.SiteID === gemeenteId);
  };

  const hasModule = (gemeenteId: string, moduleId: string) => {
    return getModulesForGemeente(gemeenteId).some(mc => mc.ModuleID === moduleId);
  };

  useEffect(() => {
    const filtered = gemeenten
      .filter((gemeente) => 
        (!filters?.nameFilter || filters.nameFilter === "") || 
        gemeente.CompanyName?.toLowerCase().includes((filters?.nameFilter || "").toLowerCase())
      )
      .filter((gemeente) => {
        return (
          (!showStallingenFilter || 
            (!gemeente.hasStallingen && filters?.showGemeentenWithoutStallingen !== "no" || 
              gemeente.hasStallingen && filters?.showGemeentenWithoutStallingen !== "only")) &&
          (!showUsersFilter || 
            (!gemeente.hasUsers && filters?.showGemeentenWithoutUsers !== "no" || 
              gemeente.hasUsers && filters?.showGemeentenWithoutUsers !== "only")) &&
          (!showExploitantenFilter || 
            (!gemeente.hasExploitanten && filters?.showGemeentenWithoutExploitanten !== "no" ||
              gemeente.hasExploitanten && filters?.showGemeentenWithoutExploitanten !== "only")) &&
          (!showModulesFilter || 
            filters?.selectedModuleFilter === "all" ||
            filters?.selectedModuleFilter === "none" && getModulesForGemeente(gemeente.ID).length === 0 ||
            filters?.selectedModuleFilter.startsWith("wel_") && hasModule(gemeente.ID, filters.selectedModuleFilter.substring(4)) ||
            filters?.selectedModuleFilter.startsWith("geen_") && !hasModule(gemeente.ID, filters.selectedModuleFilter.substring(5)))
        );
      });

    onFilterChange(filtered);
  }, [
    filters,
    gemeenten, 
    users,
    allModulesContacts.modulesContacts,
    showStallingenFilter,
    showUsersFilter,
    showExploitantenFilter,
    showModulesFilter,
    onFilterChange
  ]);

  return (
    <div className="space-y-4">

      <div className="flex flex-col">
        <SearchFilter
          id="gemeenteName"
          label="Data-eigenaar:"
          value={filters?.nameFilter || ""}
          onChange={handleNameFilterChange}
        />
      </div>

      {(showStallingenFilter || showUsersFilter || showExploitantenFilter || showModulesFilter) && (
        <CollapsibleContent 
          buttonText="Extra filter opties"
          isOpen={
            // !!filters?.nameFilter ||
            filters?.showGemeentenWithoutStallingen !== "yes" ||
            filters?.showGemeentenWithoutUsers !== "yes" ||
            filters?.showGemeentenWithoutExploitanten !== "yes" ||
            filters?.selectedModuleFilter !== "all"
          }
        >
          <div className="p-4 space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-semibold">Extra filters</h2>
              <button 
                onClick={handleResetFilters}
                className="bg-red-500 text-white px-3 py-1 rounded-md hover:bg-red-600 text-sm"
              >
                Reset Filters
              </button>
            </div>

            {showStallingenFilter && (
              <div className="flex items-center">
                <label htmlFor="showGemeentenWithoutStallingen" className="text-sm font-medium text-gray-700">Toon data-eigenaren zonder stallingen:</label>
                <select 
                  id="showGemeentenWithoutStallingen" 
                  name="showGemeentenWithoutStallingen" 
                  value={filters?.showGemeentenWithoutStallingen || "no"}
                  onChange={(e) => dispatch(setShowGemeentenWithoutStallingen(e.target.value as "yes"|"no"|"only"))}
                  className="ml-2 p-2 border border-gray-300 rounded-md"
                >
                  <option value="yes">Ja</option>
                  <option value="no">Nee</option>
                  <option value="only">Alleen Zonder</option>
                </select>
              </div>
            )}

            {showUsersFilter && (
              <div className="flex items-center">
                <label htmlFor="showGemeentenWithoutUsers" className="text-sm font-medium text-gray-700">Toon data-eigenaren zonder gebruikers:</label>
                <select 
                  id="showGemeentenWithoutUsers" 
                  name="showGemeentenWithoutUsers" 
                  value={filters?.showGemeentenWithoutUsers || "no"}
                  onChange={(e) => dispatch(setShowGemeentenWithoutUsers(e.target.value as "yes"|"no"|"only"))}
                  className="ml-2 p-2 border border-gray-300 rounded-md"
                >
                  <option value="yes">Ja</option>
                  <option value="no">Nee</option>
                  <option value="only">Alleen Zonder</option>
                </select>
              </div>
            )}

            {showExploitantenFilter && (
              <div className="flex items-center">
                <label htmlFor="showGemeentenWithoutExploitanten" className="text-sm font-medium text-gray-700">Toon data-eigenaren zonder exploitanten:</label>
                <select 
                  id="showGemeentenWithoutExploitanten" 
                  name="showGemeentenWithoutExploitanten" 
                  value={filters?.showGemeentenWithoutExploitanten || "yes"}
                  onChange={(e) => dispatch(setShowGemeentenWithoutExploitanten(e.target.value as "yes"|"no"|"only"))}
                  className="ml-2 p-2 border border-gray-300 rounded-md"
                >
                  <option value="yes">Ja</option>
                  <option value="no">Nee</option>
                  <option value="only">Alleen Zonder</option>
                </select>
              </div>
            )}

            {showModulesFilter && (
              <div className="flex items-center">
                <label htmlFor="selectedModuleFilter" className="text-sm font-medium text-gray-700">Module filter: Data-eigenaar heeft </label>
                <select 
                  id="selectedModuleFilter" 
                  name="selectedModuleFilter" 
                  value={filters?.selectedModuleFilter || "all"}
                  onChange={(e) => dispatch(setSelectedModuleFilter(e.target.value))}
                  className="ml-2 p-2 border border-gray-300 rounded-md"
                >
                  <option value="all">Alle modules</option>
                  <option value="none">Geen modules</option>
                  {/* Wel options */}
                  {AVAILABLE_MODULES.map((module) => (
                    <option key={`wel_${module.ID}`} value={`wel_${module.ID}`}>
                      {module.Name}
                    </option>
                  ))}
                  {/* Geen options */}
                  {AVAILABLE_MODULES.map((module) => (
                    <option key={`geen_${module.ID}`} value={`geen_${module.ID}`}>
                      Geen {module.Name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </CollapsibleContent>
      )}
    </div>
  );
};

export default GemeenteFilter; 