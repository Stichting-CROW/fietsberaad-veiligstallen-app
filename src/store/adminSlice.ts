import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import { HYDRATE } from "next-redux-wrapper";
import { type VSContact } from "~/types/contacts";

export interface AdminState {
  activeMunicipalityInfo: VSContact | undefined;
}

// Initial state
const initialState: AdminState = {
  activeMunicipalityInfo: undefined,
};

// Actual Slice
export const adminSlice = createSlice({
  name: "admin",
  initialState,
  reducers: {
    setActiveMunicipalityInfo(state, action: PayloadAction<VSContact>) {
      state.activeMunicipalityInfo = action.payload;
    },
  },

  // Special reducer for hydrating the state. Special case for next-redux-wrapper
  extraReducers: {
    [HYDRATE]: (state, action: PayloadAction<{ admin: AdminState }>) => {
      return {
        ...state,
        ...action.payload.admin,
      };
    },
  },
});

export const {
  setActiveMunicipalityInfo,
} = adminSlice.actions;
