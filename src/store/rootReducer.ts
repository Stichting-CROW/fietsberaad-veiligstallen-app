import { combineReducers } from "redux";
import { authSlice } from "./authSlice";
import { adminSlice } from "./adminSlice";
import { filterSlice } from "./filterSlice";
import { filterArticlesSlice } from "./filterArticlesSlice";
import { mapSlice } from "./mapSlice";
import { geoSlice } from "./geoSlice";
import { appSlice } from "./appSlice";
import gemeenteFiltersReducer from './gemeenteFiltersSlice';
import reportsFiltersReducer from './reportsFiltersSlice';

const rootReducer = combineReducers({
  [authSlice.name]: authSlice.reducer,
  [adminSlice.name]: adminSlice.reducer,
  [filterSlice.name]: filterSlice.reducer,
  [filterArticlesSlice.name]: filterArticlesSlice.reducer,
  [mapSlice.name]: mapSlice.reducer,
  [appSlice.name]: appSlice.reducer,
  [geoSlice.name]: geoSlice.reducer,
  gemeenteFilters: gemeenteFiltersReducer,
  reportsFilters: reportsFiltersReducer,
});

export type RootState = ReturnType<typeof rootReducer>;

export default rootReducer;
