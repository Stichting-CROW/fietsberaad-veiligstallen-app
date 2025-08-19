import * as React from "react";
// import Input from "@mui/material/TextField";
import { useDispatch, useSelector } from "react-redux";
import { useEffect } from "react";
import type { AppState } from "~/store/store";

function SearchBar({
  value,
  filterChanged,
  afterHtml
}: {
  value?: string,
  filterChanged: (event: React.ChangeEvent<HTMLInputElement>) => void,
  afterHtml?: any,
}) {
  const dispatch = useDispatch();
  
  // Directly access the Redux state to ensure we always have the current value
  const filterQuery = useSelector((state: AppState) => state.filter.query);

  // Use the Redux state value if available, otherwise fall back to the prop
  const inputValue = filterQuery !== undefined ? filterQuery : (value || '');

  // Monitor value changes
  useEffect(() => {
    // console.debug("SearchBar useEffect - value prop changed to:", value);
  }, [value]);

  useEffect(() => {
    // console.debug("SearchBar useEffect - filterQuery from Redux changed to:", filterQuery);
  }, [filterQuery]);

  return (
    <>
      <input
        type="search"
        name=""
        placeholder="Vind een stalling"
        className="
          sticky top-0 z-10
          h-12
          w-full
          rounded-3xl
          px-4
          shadow-md
        "
        onChange={(e) => {
          console.debug("SearchBar onChange - e.target.value:", e.target.value);
          filterChanged(e);
        }}
        value={inputValue}
      />
      {afterHtml ? afterHtml : ''}
    </>
  );
}

export default SearchBar;
