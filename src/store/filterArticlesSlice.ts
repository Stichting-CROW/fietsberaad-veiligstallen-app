import { createSlice } from "@reduxjs/toolkit";
import { HYDRATE } from "next-redux-wrapper";
import { initialState, allowedTypes, allowedTypes2 } from "./filterSlice";

// Exact copy of filterSlice, but with different state and reducers for articles filter
export const filterArticlesSlice = createSlice({
  name: "filterArticles",
  initialState,
  reducers: {
    // Action to toggle the type
    toggleType(state, action) {
      const pfType = action.payload.pfType;
      const index = state.activeTypes.indexOf(pfType);
      if (index === -1) {
        // Add the type to the array if it's not present
        state.activeTypes.push(pfType);
      } else {
        // Remove the type from the array if it's present
        state.activeTypes.splice(index, 1);
      }
    },
    // Action to toggle the type
    setTypes(state, action) {
      const typesToSet = action.payload;
      // Check if given types are valid
      let isInvalidInput = false;
      if (!typesToSet) {
        isInvalidInput = true;
      }
      for (let key in typesToSet) {
        const typeToSet = typesToSet[key];
        if (allowedTypes.indexOf(typeToSet) <= -1) {
          isInvalidInput = true;
        }
      }
      if (isInvalidInput) {
        return;
      }

      state.activeTypes = typesToSet;
    },
    toggleType2(state, action) {
      const pfType = action.payload.pfType;
      const index = state.activeTypes2.indexOf(pfType);
      if (index === -1) {
        // Add the type to the array if it's not present
        state.activeTypes2.push(pfType);
      } else {
        // Remove the type from the array if it's present
        state.activeTypes2.splice(index, 1);
      }
    },
    // Action to toggle the type
    setTypes2(state, action) {
      const typesToSet = action.payload;
      // Check if given types are valid
      let isInvalidInput = false;
      if (!typesToSet) {
        isInvalidInput = true;
      }
      for (let key in typesToSet) {
        const typeToSet = typesToSet[key];
        if (allowedTypes2.indexOf(typeToSet) <= -1) {
          isInvalidInput = true;
        }
      }
      if (isInvalidInput) {
        return;
      }

      state.activeTypes2 = typesToSet;
    },
    setQuery(state, action) {
      state.query = action.payload;
    },
  },

  // Special reducer for hydrating the state. Special case for next-redux-wrapper
  extraReducers: {
    [HYDRATE]: (state, action) => {
      return {
        ...state,
        ...action.payload.filter,
      };
    },
  },
});

export const {
  toggleType,
  toggleType2,
  setTypes,
  setTypes2,
  setQuery
} = filterArticlesSlice.actions;
