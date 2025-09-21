import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { type RootState } from './rootReducer';

interface ReportsFiltersState {
  nameFilter: string;
  showGemeentenWithoutStallingen: "yes" | "no" | "only";
  showGemeentenWithoutUsers: "yes" | "no" | "only";
  showGemeentenWithoutExploitanten: "yes" | "no" | "only";
}

// Load initial state from session storage if available
const loadInitialState = (): ReportsFiltersState => {
  if (typeof window !== 'undefined') {
    const savedState = sessionStorage.getItem('reports-filters');
    if (savedState) {
      return JSON.parse(savedState);
    }
  }
  return {
    nameFilter: "",
    showGemeentenWithoutStallingen: "no",
    showGemeentenWithoutUsers: "no",
    showGemeentenWithoutExploitanten: "yes",
  };
};

const initialState: ReportsFiltersState = loadInitialState();

export const reportsFiltersSlice = createSlice({
  name: 'reportsFilters',
  initialState,
  reducers: {
    setNameFilter: (state, action: PayloadAction<string>) => {
      state.nameFilter = action.payload;
      sessionStorage.setItem('reports-filters', JSON.stringify(state));
    },
    setShowGemeentenWithoutStallingen: (state, action: PayloadAction<"yes" | "no" | "only">) => {
      state.showGemeentenWithoutStallingen = action.payload;
      sessionStorage.setItem('reports-filters', JSON.stringify(state));
    },
    setShowGemeentenWithoutUsers: (state, action: PayloadAction<"yes" | "no" | "only">) => {
      state.showGemeentenWithoutUsers = action.payload;
      sessionStorage.setItem('reports-filters', JSON.stringify(state));
    },
    setShowGemeentenWithoutExploitanten: (state, action: PayloadAction<"yes" | "no" | "only">) => {
      state.showGemeentenWithoutExploitanten = action.payload;
      sessionStorage.setItem('reports-filters', JSON.stringify(state));
    },
    resetFilters: (state) => {
      state.nameFilter = "";
      state.showGemeentenWithoutStallingen = "no";
      state.showGemeentenWithoutUsers = "no";
      state.showGemeentenWithoutExploitanten = "yes";
      sessionStorage.setItem('reports-filters', JSON.stringify(state));
    },
  },
});

export const {
  setNameFilter,
  setShowGemeentenWithoutStallingen,
  setShowGemeentenWithoutUsers,
  setShowGemeentenWithoutExploitanten,
  resetFilters,
} = reportsFiltersSlice.actions;

export const selectReportsFilters = (state: RootState) => state.reportsFilters;

export default reportsFiltersSlice.reducer; 