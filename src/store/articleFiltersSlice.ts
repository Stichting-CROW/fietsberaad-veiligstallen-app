import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { type RootState } from './rootReducer';

export type ArticleFiltersState = {
  status: 'All' | 'Yes' | 'No';
  navigation: 'All' | 'Main' | 'NotMain';
  content: 'All' | 'Content' | 'NoContent';
  searchTerm: string;
};

// Load initial state from session storage if available
const loadInitialState = (): ArticleFiltersState => {
  if (typeof window !== 'undefined') {
    const savedState = sessionStorage.getItem('article-filters');
    if (savedState) {
      try {
        return JSON.parse(savedState);
      } catch (e) {
        console.error('Error parsing saved article filters:', e);
      }
    }
  }
  return {
    status: 'All',
    navigation: 'Main',
    content: 'All',
    searchTerm: '',
  };
};

const initialState: ArticleFiltersState = loadInitialState();

export const articleFiltersSlice = createSlice({
  name: 'articleFilters',
  initialState,
  reducers: {
    setStatus: (state, action: PayloadAction<'All' | 'Yes' | 'No'>) => {
      state.status = action.payload;
      try {
        sessionStorage.setItem('article-filters', JSON.stringify(state));
      } catch (e) {
        console.error('Error saving article filters to session storage:', e);
      }
    },
    setNavigation: (state, action: PayloadAction<'All' | 'Main' | 'NotMain'>) => {
      state.navigation = action.payload;
      try {
        sessionStorage.setItem('article-filters', JSON.stringify(state));
      } catch (e) {
        console.error('Error saving article filters to session storage:', e);
      }
    },
    setContent: (state, action: PayloadAction<'All' | 'Content' | 'NoContent'>) => {
      state.content = action.payload;
      try {
        sessionStorage.setItem('article-filters', JSON.stringify(state));
      } catch (e) {
        console.error('Error saving article filters to session storage:', e);
      }
    },
    setSearchTerm: (state, action: PayloadAction<string>) => {
      state.searchTerm = action.payload;
      try {
        sessionStorage.setItem('article-filters', JSON.stringify(state));
      } catch (e) {
        console.error('Error saving article filters to session storage:', e);
      }
    },
    resetFilters: (state) => {
      state.status = 'All';
      state.navigation = 'Main';
      state.content = 'All';
      state.searchTerm = '';
      try {
        sessionStorage.setItem('article-filters', JSON.stringify(state));
      } catch (e) {
        console.error('Error saving article filters to session storage:', e);
      }
    },
    setFilters: (state, action: PayloadAction<Partial<ArticleFiltersState>>) => {
      Object.assign(state, action.payload);
      try {
        sessionStorage.setItem('article-filters', JSON.stringify(state));
      } catch (e) {
        console.error('Error saving article filters to session storage:', e);
      }
    },
  },
});

export const {
  setStatus,
  setNavigation,
  setContent,
  setSearchTerm,
  resetFilters,
  setFilters,
} = articleFiltersSlice.actions;

export const selectArticleFilters = (state: RootState) => state.articleFilters;

export default articleFiltersSlice.reducer;
