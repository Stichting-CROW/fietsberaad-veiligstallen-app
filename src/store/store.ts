import { configureStore, type ThunkAction, type Action } from "@reduxjs/toolkit";
import rootReducer, { type RootState } from "./rootReducer";
import { createWrapper } from "next-redux-wrapper";

const makeStore = () =>
  configureStore({
    reducer: rootReducer,
    devTools: process.env.NODE_ENV !== "production",
  });

// @ts-ignore
export type AppState = ReturnType<typeof RootState>;
export type AppStore = ReturnType<typeof makeStore>;
export type AppDispatch = AppStore["dispatch"];
export type AppThunk<ReturnType = void> = ThunkAction<
  ReturnType,
  RootState,
  unknown,
  Action<string>
>;

export const wrapper = createWrapper<AppStore>(makeStore, {
  debug: process.env.NODE_ENV !== "production",
});
