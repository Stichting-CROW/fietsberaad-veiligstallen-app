import { type ReportState } from "./ReportsFilter";
import { type ParsedUrlQuery } from "querystring";

/**
 * Serialize filter state to URL query parameters
 */
export const serializeFiltersToUrl = (state: ReportState): Record<string, string> => {
  const params: Record<string, string> = {};

  // Only include non-default values to keep URLs clean
  if (state.reportGrouping) {
    params.grouping = state.reportGrouping;
  }
  if (state.reportCategories && state.reportCategories !== "none") {
    params.categories = state.reportCategories;
  }
  // Always include rangeUnit when it's set, including "range_custom" for manual date selection
  if (state.reportRangeUnit) {
    params.rangeUnit = state.reportRangeUnit;
  }
  if (state.selectedBikeparkIDs && state.selectedBikeparkIDs.length > 0) {
    params.bikeparks = state.selectedBikeparkIDs.join(",");
  }
  // Always include custom dates when they're set (especially for range_custom)
  // Format dates as YYYY-MM-DD for cleaner URLs (ISO strings include time/timezone)
  if (state.customStartDate) {
    const startDate = new Date(state.customStartDate);
    if (!Number.isNaN(startDate.getTime())) {
      const year = startDate.getFullYear();
      const month = `${startDate.getMonth() + 1}`.padStart(2, "0");
      const day = `${startDate.getDate()}`.padStart(2, "0");
      params.startDate = `${year}-${month}-${day}`;
    }
  }
  if (state.customEndDate) {
    const endDate = new Date(state.customEndDate);
    if (!Number.isNaN(endDate.getTime())) {
      const year = endDate.getFullYear();
      const month = `${endDate.getMonth() + 1}`.padStart(2, "0");
      const day = `${endDate.getDate()}`.padStart(2, "0");
      params.endDate = `${year}-${month}-${day}`;
    }
  }
  // Only include preset if we're using a preset (not custom dates)
  // When custom dates are set, preset should be undefined/removed
  if (state.activePreset && state.reportRangeUnit !== "range_custom") {
    params.preset = state.activePreset;
  }
  if (state.fillups) {
    params.fillups = "true";
  }
  if (state.source) {
    params.source = state.source;
  }
  if (state.selectedSeries && state.selectedSeries.length > 0 && state.selectedSeries.length < 7) {
    // Only include if not all series are selected (default)
    params.series = state.selectedSeries.join(",");
  }
  if (state.bikeparkDataSources && state.bikeparkDataSources.length > 0) {
    // Store only the IDs to keep URL short
    // The source will be reconstructed from the global 'source' parameter
    params.bikeparkDataSources = state.bikeparkDataSources.map(bp => bp.StallingsID).join(",");
  }

  return params;
};

/**
 * Deserialize URL query parameters to filter state
 */
export const deserializeFiltersFromUrl = (
  query: ParsedUrlQuery,
  defaultState: Partial<ReportState>
): Partial<ReportState> => {
  const state: Partial<ReportState> = {};

  if (typeof query.grouping === "string") {
    state.reportGrouping = query.grouping as any;
  }
  if (typeof query.categories === "string") {
    state.reportCategories = query.categories as any;
  }
  if (typeof query.rangeUnit === "string") {
    state.reportRangeUnit = query.rangeUnit as any;
  }
  if (typeof query.bikeparks === "string") {
    state.selectedBikeparkIDs = query.bikeparks.split(",").filter(Boolean);
  }
  if (typeof query.startDate === "string") {
    // Parse YYYY-MM-DD format and convert to ISO string
    const date = new Date(`${query.startDate}T00:00:00`);
    if (!Number.isNaN(date.getTime())) {
      state.customStartDate = date.toISOString();
    }
  }
  if (typeof query.endDate === "string") {
    // Parse YYYY-MM-DD format and convert to ISO string (set to end of day)
    const date = new Date(`${query.endDate}T23:59:59`);
    if (!Number.isNaN(date.getTime())) {
      state.customEndDate = date.toISOString();
    }
  }
  if (typeof query.preset === "string") {
    state.activePreset = query.preset as any;
  }
  if (typeof query.fillups === "string") {
    state.fillups = query.fillups === "true";
  }
  if (typeof query.source === "string") {
    state.source = query.source;
  }
  if (typeof query.series === "string") {
    state.selectedSeries = query.series.split(",").filter(Boolean) as any;
  }
  if (typeof query.bikeparkDataSources === "string") {
    // bikeparkDataSources can be either:
    // 1. Comma-separated IDs (new format): "3500_018,3500_195"
    // 2. JSON array (old format for backward compatibility): "[{...}]"
    try {
      // Try parsing as JSON first (old format)
      const parsed = JSON.parse(query.bikeparkDataSources);
      if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0] === 'object' && 'Title' in parsed[0]) {
        // Old format: array of objects with Title
        state.bikeparkDataSources = parsed;
      } else {
        // New format: comma-separated IDs
        const ids = query.bikeparkDataSources.split(",").filter(Boolean);
        // Store IDs only - will be reconstructed in component with bikeparks list
        (state as any).bikeparkDataSourcesIDs = ids;
      }
    } catch (e) {
      // Not JSON, treat as comma-separated IDs (new format)
      const ids = query.bikeparkDataSources.split(",").filter(Boolean);
      if (ids.length > 0) {
        // Store IDs only - will be reconstructed in component with bikeparks list
        (state as any).bikeparkDataSourcesIDs = ids;
      }
    }
  }

  return state;
};

