import { combineReducers } from "redux";
import { HYDRATE } from "next-redux-wrapper";
import { authSlice } from "./authSlice";
import { adminSlice } from "./adminSlice";
import { filterSlice } from "./filterSlice";
import { filterArticlesSlice } from "./filterArticlesSlice";
import { mapSlice } from "./mapSlice";
import { geoSlice } from "./geoSlice";
import { appSlice } from "./appSlice";
import gemeenteFiltersReducer from './gemeenteFiltersSlice';
import reportsFiltersReducer from './reportsFiltersSlice';
import articleFiltersReducer from './articleFiltersSlice';

const combinedReducer = combineReducers({
  [authSlice.name]: authSlice.reducer,
  [adminSlice.name]: adminSlice.reducer,
  [filterSlice.name]: filterSlice.reducer,
  [filterArticlesSlice.name]: filterArticlesSlice.reducer,
  [mapSlice.name]: mapSlice.reducer,
  [appSlice.name]: appSlice.reducer,
  [geoSlice.name]: geoSlice.reducer,
  gemeenteFilters: gemeenteFiltersReducer,
  reportsFilters: reportsFiltersReducer,
  articleFilters: articleFiltersReducer,
});

const rootReducer = (state: any, action: any) => {
  if (action.type === HYDRATE) {
    const nextState = {
      ...state, // use previous state
      ...action.payload, // apply delta from hydration
    };
    return nextState;
  } else {
    return combinedReducer(state, action);
  }
};

export type RootState = ReturnType<typeof rootReducer>;

export default rootReducer;
