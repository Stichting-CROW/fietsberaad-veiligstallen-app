import { createSlice } from "@reduxjs/toolkit";
import { AppState } from "./store";
import { HYDRATE } from "next-redux-wrapper";
import { type VSContactGemeente } from "~/types/contacts";

// Type for our state
export interface MapState {
  extent: number[];
  zoom: number | undefined;
  selectedParkingId: string | undefined; // selected on map / in list
  activeParkingId: string | undefined;  // visible in modal
  activeMunicipalityInfo: VSContactGemeente | undefined;
  initialLatLng: string[] | undefined;
  initialZoom: number | undefined;
  currentLatLng: string[] | undefined;
  visibleFeatures: string[];
  visibleFeaturesHash: string;
}

// Initial state
const initialState: MapState = {
  extent: [],
  zoom: undefined,
  visibleFeatures: [],
  visibleFeaturesHash: "",
  selectedParkingId: undefined,
  activeParkingId: undefined,
  activeMunicipalityInfo: undefined,
  initialLatLng: undefined,
  initialZoom: undefined,
  currentLatLng: undefined,
};

// Actual Slice
export const mapSlice = createSlice({
  name: "map",
  initialState,
  reducers: {
    // Action to set the map current center
    setMapCurrentLatLong(state, action) {
      state.currentLatLng = action.payload;
    },
    // Action to set the map extent (boundaries)
    setMapExtent(state, action) {
      state.extent = action.payload;
    },
    // Action to set the map zoom level
    setMapZoom(state, action) {
      state.zoom = action.payload;
    },
    // Action to set visible features
    setMapVisibleFeatures(state, action) {
      state.visibleFeatures = action.payload;
      state.visibleFeaturesHash = action.payload.join(",");
    },
    // Set selectedParkingId
    setSelectedParkingId(state, action) {
      state.selectedParkingId = action.payload;
    },
    // Set activeParkingId
    setActiveParkingId(state, action) {
      // console.log('setActiveParkingId', action.payload);
      state.activeParkingId = action.payload;
    },
    // setActiveMunicipality
    // setActiveMunicipality(state, action) {
    //   state.activeMunicipality = action.payload;
    // },
    // setActiveMunicipalityInfo
    setActiveMunicipalityInfo(state, action) {
      state.activeMunicipalityInfo = action.payload;
    },
    // setInitialLatLng
    setInitialLatLng(state, action) {
      state.initialLatLng = action.payload;
    },
    // setInitialZoom
    setInitialZoom(state, action) {
      state.initialZoom = action.payload;
    },
  },

  // Special reducer for hydrating the state. Special case for next-redux-wrapper
  extraReducers: {
    [HYDRATE]: (state, action) => {
      return {
        ...state,
        ...action.payload.map,
      };
    },
  },
});

export const {
  setMapCurrentLatLong,
  setMapExtent,
  setMapZoom,
  setMapVisibleFeatures,
  setSelectedParkingId,
  setActiveParkingId,
  // setActiveMunicipality,
  setActiveMunicipalityInfo,
  setInitialLatLng,
  setInitialZoom
} = mapSlice.actions;
