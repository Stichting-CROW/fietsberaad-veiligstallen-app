import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { type RootState } from './rootReducer';

interface GemeenteFiltersState {
  nameFilter: string;
  showGemeentenWithoutStallingen: "yes" | "no" | "only";
  showGemeentenWithoutUsers: "yes" | "no" | "only";
  showGemeentenWithoutExploitanten: "yes" | "no" | "only";
  selectedModuleFilter: string; // "all", "none", "wel_<moduleId>", or "geen_<moduleId>"
}

// Load initial state from session storage if available
const loadInitialState = (): GemeenteFiltersState => {
  if (typeof window !== 'undefined') {
    const savedState = sessionStorage.getItem('gemeente-filters');
    if (savedState) {
      try {
        return JSON.parse(savedState);
      } catch (e) {
        console.error('Error parsing saved filters:', e);
      }
    }
  }
  return {
    nameFilter: "",
    showGemeentenWithoutStallingen: "yes",
    showGemeentenWithoutUsers: "yes",
    showGemeentenWithoutExploitanten: "yes",
    selectedModuleFilter: "all",
  };
};

const initialState: GemeenteFiltersState = loadInitialState();

export const gemeenteFiltersSlice = createSlice({
  name: 'gemeenteFilters',
  initialState,
  reducers: {
    setNameFilter: (state, action: PayloadAction<string>) => {
      state.nameFilter = action.payload;
      try {
        sessionStorage.setItem('gemeente-filters', JSON.stringify(state));
      } catch (e) {
        console.error('Error saving filters to session storage:', e);
      }
    },
    setShowGemeentenWithoutStallingen: (state, action: PayloadAction<"yes" | "no" | "only">) => {
      state.showGemeentenWithoutStallingen = action.payload;
      try {
        sessionStorage.setItem('gemeente-filters', JSON.stringify(state));
      } catch (e) {
        console.error('Error saving filters to session storage:', e);
      }
    },
    setShowGemeentenWithoutUsers: (state, action: PayloadAction<"yes" | "no" | "only">) => {
      state.showGemeentenWithoutUsers = action.payload;
      try {
        sessionStorage.setItem('gemeente-filters', JSON.stringify(state));
      } catch (e) {
        console.error('Error saving filters to session storage:', e);
      }
    },
    setShowGemeentenWithoutExploitanten: (state, action: PayloadAction<"yes" | "no" | "only">) => {
      state.showGemeentenWithoutExploitanten = action.payload;
      try {
        sessionStorage.setItem('gemeente-filters', JSON.stringify(state));
      } catch (e) {
        console.error('Error saving filters to session storage:', e);
      }
    },
    setSelectedModuleFilter: (state, action: PayloadAction<string>) => {
      state.selectedModuleFilter = action.payload;
      try {
        sessionStorage.setItem('gemeente-filters', JSON.stringify(state));
      } catch (e) {
        console.error('Error saving filters to session storage:', e);
      }
    },
    resetFilters: (state) => {
      state.nameFilter = "";
      state.showGemeentenWithoutStallingen = "no";
      state.showGemeentenWithoutUsers = "no";
      state.showGemeentenWithoutExploitanten = "yes";
      state.selectedModuleFilter = "all";
      try {
        sessionStorage.setItem('gemeente-filters', JSON.stringify(state));
      } catch (e) {
        console.error('Error saving filters to session storage:', e);
      }
    },
  },
});

export const {
  setNameFilter,
  setShowGemeentenWithoutStallingen,
  setShowGemeentenWithoutUsers,
  setShowGemeentenWithoutExploitanten,
  setSelectedModuleFilter,
  resetFilters,
} = gemeenteFiltersSlice.actions;

export const selectGemeenteFilters = (state: RootState) => state.gemeenteFilters;

export default gemeenteFiltersSlice.reducer; 