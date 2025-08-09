import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import { HYDRATE } from "next-redux-wrapper";

export interface AppState {
  isParkingListVisible: boolean;
  isFilterBoxVisible: boolean;
  isMobileNavigationVisible: boolean;
  activeArticleMunicipality: string | undefined;
  activeArticleTitle: string | undefined;
  exploitantenVersion: number;
  gemeentenVersion: number;
}

interface SetActiveArticlePayload {
  articleTitle: string;
  municipality: string;
}

// Initial state
const initialState: AppState = {
  isParkingListVisible: false,
  isFilterBoxVisible: false,
  isMobileNavigationVisible: false,
  activeArticleMunicipality: undefined,
  activeArticleTitle: undefined,
  exploitantenVersion: 0,
  gemeentenVersion: 0
};

// Actual Slice
export const appSlice = createSlice({
  name: "app",
  initialState,
  reducers: {
    setIsParkingListVisible(state, action: PayloadAction<boolean>) {
      state.isParkingListVisible = action.payload;
    },
    setIsFilterBoxVisible(state, action: PayloadAction<boolean>) {
      state.isFilterBoxVisible = action.payload;
    },
    setIsMobileNavigationVisible(state, action: PayloadAction<boolean>) {
      state.isMobileNavigationVisible = action.payload;
    },
    setActiveArticle(state, action: PayloadAction<SetActiveArticlePayload>) {
      state.activeArticleTitle = action.payload.articleTitle;
      state.activeArticleMunicipality = action.payload.municipality;
    },
    incrementExploitantenVersion(state) {
      state.exploitantenVersion += 1;
    },
    incrementGemeentenVersion(state) {
      state.gemeentenVersion += 1;
    },
  },

  // Special reducer for hydrating the state. Special case for next-redux-wrapper
  extraReducers: {
    [HYDRATE]: (state, action: PayloadAction<{ app: AppState }>) => {
      return {
        ...state,
        ...action.payload.app,
      };
    },
  },
});

export const {
  setIsParkingListVisible,
  setIsFilterBoxVisible,
  setIsMobileNavigationVisible,
  setActiveArticle,
  incrementExploitantenVersion,
  incrementGemeentenVersion,
} = appSlice.actions;
