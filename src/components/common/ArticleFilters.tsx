import React, { useEffect, useState } from 'react';
import { useGemeentenInLijst } from '~/hooks/useGemeenten';

export type ArticleFiltersState = {
  gemeenteId: string;
  status: 'All' | 'Yes' | 'No';
  navigation: 'All' | 'Main' | 'NotMain';
  content: 'All' | 'Content' | 'NoContent';
};

interface ArticleFiltersProps {
  onChange: (filters: ArticleFiltersState, searchTerm: string) => void;
  showGemeenteSelection?: boolean;
  showReset?: boolean;
  activeMunicipalityID?: string;
  initialFilters?: Partial<ArticleFiltersState>;
  initialSearchTerm?: string;
}

const defaultFilters: ArticleFiltersState = {
  gemeenteId: '',
  status: 'All',
  navigation: 'All',
  content: 'All',
};

const ArticleFilters: React.FC<ArticleFiltersProps> = ({
  onChange,
  showGemeenteSelection = true,
  showReset = true,
  activeMunicipalityID,
  initialFilters = {},
  initialSearchTerm = '',
}) => {
  const { gemeenten, isLoading: gemeentenLoading } = useGemeentenInLijst();
  const [gemeenteReadOnly, setGemeenteReadOnly] = useState(false);
  const [filters, setFilters] = useState<ArticleFiltersState>({ ...defaultFilters, ...initialFilters });
  const [searchTerm, setSearchTerm] = useState(initialSearchTerm);

  // Internal filter logic: auto-select, readonly, etc.
  useEffect(() => {
    if (!gemeenten || !Array.isArray(gemeenten) || gemeenten.length === undefined) return;
    if (!showGemeenteSelection) {
      // Always set gemeenteId to activeMunicipalityID (if not '1'), or ''
      if (activeMunicipalityID && activeMunicipalityID !== '1') {
        setFilters(f => ({ ...f, gemeenteId: activeMunicipalityID }));
      } else {
        setFilters(f => ({ ...f, gemeenteId: '' }));
      }
      setGemeenteReadOnly(true);
      return;
    }
    // If only one gemeente, lock to it
    if (gemeenten.length === 1) {
      setFilters(f => ({ ...f, gemeenteId: gemeenten[0]?.ID || '' }));
      setGemeenteReadOnly(true);
      return;
    }
    // If active municipality is set and not '1', lock to it
    if (activeMunicipalityID && activeMunicipalityID !== '1') {
      setFilters(f => ({ ...f, gemeenteId: activeMunicipalityID }));
      setGemeenteReadOnly(true);
      return;
    }
    // Otherwise, allow selection
    setGemeenteReadOnly(false);
    // If the current gemeenteId is not in the list, reset it
    setFilters(f => {
      const safeGemeenteId = f.gemeenteId || '';
      if (safeGemeenteId && Array.isArray(gemeenten) && !gemeenten.find(g => g.ID === safeGemeenteId)) {
        return { ...defaultFilters, ...f, gemeenteId: '' };
      }
      return { ...defaultFilters, ...f, gemeenteId: safeGemeenteId };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gemeenten, activeMunicipalityID, showGemeenteSelection]);

  // Call onChange whenever filters or searchTerm change
  useEffect(() => {
    onChange(filters, searchTerm);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, searchTerm]);

  const handleChange = (key: keyof ArticleFiltersState, value: string) => {
    if (key === 'gemeenteId' && gemeenteReadOnly) return;
    setFilters(f => ({ ...f, [key]: value }));
  };

  const resetFilters = () => {
    setFilters(defaultFilters);
    setSearchTerm('');
  };

  return (
    <div className="mb-4">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold">Filter Pagina's</h2>
        {showReset && (
          <button
            className="bg-red-500 text-white px-4 py-2 rounded-md hover:bg-red-600"
            onClick={resetFilters}
            type="button"
          >
            Reset Filters
          </button>
        )}
      </div>
      <div className="mb-4">
        <label htmlFor="articleSearch" className="text-sm font-medium text-gray-700">Zoek pagina</label>
        <input
          type="search"
          id="articleSearch"
          name="articleSearch"
          placeholder="Typ om te zoeken..."
          className="mt-1 p-2 border border-gray-300 rounded-md w-full"
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
        />
      </div>
      <form className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {showGemeenteSelection && (
          <div className="flex flex-col">
            <label htmlFor="gemeente" className="text-sm font-medium text-gray-700">Selecteer Gemeente:</label>
            <div className="relative">
              <select
                id="gemeente"
                name="gemeente"
                className={`mt-1 p-2 border border-gray-300 rounded-md w-full ${gemeenteReadOnly ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                value={filters.gemeenteId}
                onChange={e => handleChange('gemeenteId', e.target.value)}
                disabled={gemeenteReadOnly}
                title={gemeenteReadOnly ? 'Gemeente is vastgezet door actieve selectie' : undefined}
              >
                <option value="">Alles</option>
                {gemeenten.map(gemeente => (
                  <option value={gemeente.ID} key={gemeente.ID}>{gemeente.CompanyName}</option>
                ))}
              </select>
              {gemeenteReadOnly && (
                <span className="absolute right-2 top-2 text-gray-400" title="Gemeente is vastgezet">🔒</span>
              )}
            </div>
          </div>
        )}
        <div className="flex flex-col">
          <label htmlFor="status" className="text-sm font-medium text-gray-700">Selecteer Pagina Status</label>
          <select
            id="status"
            name="status"
            className="mt-1 p-2 border border-gray-300 rounded-md"
            value={filters.status}
            onChange={e => handleChange('status', e.target.value)}
          >
            <option value="All">Alle</option>
            <option value="Yes">Actief</option>
            <option value="No">Niet Actief</option>
          </select>
        </div>
        <div className="flex flex-col">
          <label htmlFor="navigation" className="text-sm font-medium text-gray-700">Type</label>
          <select
            id="navigation"
            name="navigation"
            className="mt-1 p-2 border border-gray-300 rounded-md"
            value={filters.navigation}
            onChange={e => handleChange('navigation', e.target.value)}
          >
            <option value="All">Alle</option>
            <option value="Main">Navigatie</option>
            <option value="NotMain">Andere</option>
          </select>
        </div>
        <div className="flex flex-col">
          <label htmlFor="content" className="text-sm font-medium text-gray-700">Met/zonder inhoud</label>
          <select
            id="content"
            name="content"
            className="mt-1 p-2 border border-gray-300 rounded-md"
            value={filters.content}
            onChange={e => handleChange('content', e.target.value)}
          >
            <option value="All">Alle</option>
            <option value="Content">Alleen met inhoud</option>
            <option value="NoContent">Alleen zonder inhoud</option>
          </select>
        </div>
      </form>
    </div>
  );
};

export default ArticleFilters; 