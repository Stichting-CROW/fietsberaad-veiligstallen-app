import React, { useEffect, useState } from 'react';
import { useGemeentenInLijst } from '~/hooks/useGemeenten';
import { useDispatch, useSelector } from 'react-redux';
import { 
  setStatus,
  setNavigation,
  setContent,
  setSearchTerm,
  resetFilters,
  setFilters,
  selectArticleFilters,
  type ArticleFiltersState,
} from '~/store/articleFiltersSlice';

interface ArticleFiltersProps {
  showReset?: boolean;
  activeMunicipalityID?: string;
  initialFilters?: Partial<ArticleFiltersState>;
  initialSearchTerm?: string;
}

// defaultFilters is no longer needed as we use Redux state

const ArticleFilters: React.FC<ArticleFiltersProps> = ({
  showReset = true,
  activeMunicipalityID,
  initialFilters = {},
  initialSearchTerm = '',
}) => {
  const dispatch = useDispatch();
  const filters = useSelector(selectArticleFilters);
  const { gemeenten, isLoading: gemeentenLoading } = useGemeentenInLijst();

  // Initialize filters with initial values if provided
  useEffect(() => {
    if (initialFilters && Object.keys(initialFilters).length > 0) {
      dispatch(setFilters({ ...initialFilters }));
    }
    if (initialSearchTerm) {
      dispatch(setSearchTerm(initialSearchTerm));
    }
  }, [dispatch, initialFilters, initialSearchTerm]);

  const handleChange = (key: keyof ArticleFiltersState, value: string) => {
    switch (key) {
      case 'status':
        dispatch(setStatus(value as 'All' | 'Yes' | 'No'));
        break;
      case 'navigation':
        dispatch(setNavigation(value as 'All' | 'Main' | 'NotMain'));
        break;
      case 'content':
        dispatch(setContent(value as 'All' | 'Content' | 'NoContent'));
        break;
    }
  };

  const handleResetFilters = () => {
    dispatch(resetFilters());
  };

  return (
    <div className="mb-4">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold">Filter Pagina's</h2>
        {showReset && (
          <button
            className="bg-red-500 text-white px-4 py-2 rounded-md hover:bg-red-600"
            onClick={handleResetFilters}
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
          value={filters.searchTerm}
          onChange={e => dispatch(setSearchTerm(e.target.value))}
        />
      </div>
      <form className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="flex flex-col">
          <label htmlFor="status" className="text-sm font-medium text-gray-700">Zichtbaar op de website (Is ingeschakeld en heeft inhoud)</label>
          <select
            id="status"
            name="status"
            className="mt-1 p-2 border border-gray-300 rounded-md"
            value={filters.status}
            onChange={e => handleChange('status', e.target.value)}
          >
            <option value="All">Alle</option>
            <option value="Yes">Ja</option>
            <option value="No">Nee</option>
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