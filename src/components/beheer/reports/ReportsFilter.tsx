import React, { useState, useEffect, useRef, useImperativeHandle, forwardRef } from "react";
import BikeparkSelect from './BikeparkSelect';
import {
  getStartEndDT,
  getRangeForPreset,
  getSingleMonthRange,
  getSingleQuarterRange,
  getSingleWeekRange,
  getSingleYearRange
} from "./ReportsDateFunctions";
import BikeparkDataSourceSelect, { type BikeparkWithDataSource } from "./BikeparkDataSourceSelect";
import WeekdaySelect, { type SeriesLabel } from "./WeekdaySelect";
import { VSFietsenstallingLijst } from "~/types/fietsenstallingen";

export type ReportType =
  | "transacties_voltooid"
  | "inkomsten"
  | "abonnementen"
  | "abonnementen_lopend"
  | "bezetting"
  | "absolute_bezetting"
  | "stallingsduur"
  | "volmeldingen"
  | "gelijktijdig_vol"
  | "downloads";
export const reportTypeValues: [string, ...string[]] = [
  "transacties_voltooid",
  "inkomsten",
  "abonnementen",
  "abonnementen_lopend",
  "bezetting",
  "absolute_bezetting",
  "stallingsduur",
  "volmeldingen",
  "gelijktijdig_vol",
  "downloads"
];

export type ReportDatatype = "bezettingsdata" | "ruwedata"
export const reportDatatypeValues = ["bezettingsdata", "ruwedata"]

export type ReportCategories = "none" | "per_stalling" | "per_weekday" | "per_section" | "per_type_klant"
export const reportCategoriesValues = ["none", "per_stalling", "per_weekday", "per_section", "per_type_klant"]

export type ReportGrouping =
  | "per_hour"
  | "per_hour_time"
  | "per_quarter_hour"
  | "per_day"
  | "per_weekday"
  | "per_week"
  | "per_month"
  | "per_quarter"
  | "per_year"
  | "per_bucket"
export const reportGroupingValues = [
  "per_hour",
  "per_hour_time",
  "per_quarter_hour",
  "per_day",
  "per_weekday",
  "per_week",
  "per_month",
  "per_quarter",
  "per_year",
  "per_bucket"
]

export type ReportRangeUnit = "range_all" | "range_year" | "range_month" | "range_quarter" | "range_week" | "range_custom"
export const reportRangeUnitValues = ["range_all", "range_year", "range_month", "range_quarter", "range_week", "range_custom"]
// export type ReportUnit = "reportUnit_day" | "reportUnit_weekDay" | "reportUnit_week" | "range_month" | "reportUnit_quarter" | "reportUnit_year" // | "reportUnit_onequarter" | "reportUnit_oneyear"

export type ReportBikepark = VSFietsenstallingLijst

export type PeriodPreset =
  | "deze_week"
  | "deze_maand"
  | "dit_kwartaal"
  | "dit_jaar"
  | "afgelopen_7_dagen"
  | "afgelopen_30_dagen"
  | "afgelopen_12_maanden"
  | "alles";

export interface ReportParams {
  reportType: ReportType;
  reportGrouping: ReportGrouping;
  reportCategories: ReportCategories;
  reportRangeUnit: ReportRangeUnit;

  bikeparkIDs: string[];
  startDT: Date | undefined;
  endDT: Date | undefined;
  fillups: boolean;
  source?: string;

  dayBeginsAt?: string;

  bikeparkDataSources: BikeparkWithDataSource[];
}

// Use yesterday as the default end date since there's no data for today in the cache
function getDefaultRangeEnd(): Date {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  d.setHours(23, 59, 59, 999);
  return d;
}

function getDefaultRangeStart(): Date {
  const end = getDefaultRangeEnd();
  const start = new Date(end);
  start.setDate(start.getDate() - 29);
  start.setHours(0, 0, 0, 0);
  return start;
}

const DEFAULT_SERIES: SeriesLabel[] = ['Maandag', 'Dinsdag', 'Woensdag', 'Donderdag', 'Vrijdag', 'Zaterdag', 'Zondag'];

export const defaultReportState: ReportState = {
  reportType: "transacties_voltooid",
  reportCategories: "per_stalling",
  reportGrouping: "per_month",
  reportRangeUnit: "range_custom",
  selectedBikeparkIDs: [],
  fillups: false,
  grouped: "0",
  bikeparkDataSources: [],
  customStartDate: getDefaultRangeStart().toISOString(),
  customEndDate: getDefaultRangeEnd().toISOString(),
  activePreset: "afgelopen_30_dagen",
  selectedSeries: DEFAULT_SERIES
}

interface ReportsFilterComponentProps {
  showAbonnementenRapporten: boolean;
  firstDate: Date;
  lastDate: Date;
  bikeparks: ReportBikepark[];
  showDetails?: boolean;
  activeReportType?: ReportType;
  onStateChange: (newState: ReportState) => void;
  initialFilterState?: Partial<ReportState>;
}

export const getAvailableReports = (showAbonnementenRapporten: boolean) => {
  const availableReports = [];
  availableReports.push({ id: "transacties_voltooid", title: "Afgeronde transacties" });
  // availableReports.push({ id: "inkomsten", title: "Inkomsten (€)" });
  // if(showAbonnementenRapporten) {
  //     availableReports.push({ id: "abonnementen", title: "Abonnementswijzigingen" });
  //     availableReports.push({ id: "abonnementen_lopend", title: "Lopende abonnementen" });
  // }
  availableReports.push({ id: "bezetting", title: "Procentuele bezetting" });
  availableReports.push({ id: "absolute_bezetting", title: "Absolute bezetting" });
  availableReports.push({ id: "stallingsduur", title: "Stallingsduur" });
  // availableReports.push({ id: "volmeldingen", title: "Drukke en rustige momenten" });
  // availableReports.push({ id: "gelijktijdig_vol", title: "Gelijktijdig vol" });
  // availableReports.push({ id: "downloads", title: "Download data" });

  return availableReports;
}

// TODO: fase out ReportState in favor of filterState
export type ReportState = {
  reportType: ReportType;
  reportGrouping: ReportGrouping;
  reportCategories: ReportCategories;
  reportRangeUnit: ReportRangeUnit;
  selectedBikeparkIDs: string[];
  fillups: boolean;
  grouped: string;
  bikeparkDataSources: BikeparkWithDataSource[];
  customStartDate?: string;
  customEndDate?: string;
  activePreset?: PeriodPreset;
  selectedSeries?: SeriesLabel[];
  source?: string;
};

export interface ReportsFilterHandle {
  applyPreset: (preset: PeriodPreset) => void;
  applyCustomRange: (start: Date, end: Date) => void;
}

const STORAGE_KEY = 'VS_reports_filterState';
// Presets that use "range_custom" as their reportRangeUnit
const PRESETS_USING_CUSTOM_RANGE: PeriodPreset[] = ["afgelopen_7_dagen", "afgelopen_30_dagen", "afgelopen_12_maanden"];

const ReportsFilterComponent = forwardRef<ReportsFilterHandle, ReportsFilterComponentProps>(({
  showAbonnementenRapporten,
  firstDate,
  lastDate,
  bikeparks,
  showDetails = true,
  activeReportType,
  onStateChange,
  initialFilterState
}, ref) => {
  const selectClasses = "min-w-56 h-10 p-2 border-2 border-gray-300 rounded-md";

  const deriveLegacyRange = (parsed: any): { customStartDate?: string; customEndDate?: string } => {
    const rangeUnit = parsed?.reportRangeUnit as ReportRangeUnit | undefined;
    const rangeYear = parsed?.reportRangeYear as number | "lastPeriod" | undefined;
    const rangeValue = parsed?.reportRangeValue as number | "lastPeriod" | undefined;

    if (!rangeUnit) {
      return {};
    }

    try {
      switch (rangeUnit) {
        case "range_all": {
          const start = new Date(firstDate);
          start.setHours(0, 0, 0, 0);
          const end = new Date(lastDate);
          end.setHours(23, 59, 59, 999);
          return {
            customStartDate: start.toISOString(),
            customEndDate: end.toISOString(),
          };
        }
        case "range_year": {
          const { startDT, endDT } = getSingleYearRange(rangeYear ?? "lastPeriod");
          return {
            customStartDate: startDT.toISOString(),
            customEndDate: endDT.toISOString(),
          };
        }
        case "range_month": {
          const { startDT, endDT } = getSingleMonthRange(rangeYear ?? "lastPeriod", rangeValue ?? "lastPeriod");
          return {
            customStartDate: startDT.toISOString(),
            customEndDate: endDT.toISOString(),
          };
        }
        case "range_quarter": {
          const { startDT, endDT } = getSingleQuarterRange(rangeYear ?? "lastPeriod", rangeValue ?? "lastPeriod");
          return {
            customStartDate: startDT.toISOString(),
            customEndDate: endDT.toISOString(),
          };
        }
        case "range_week": {
          const { startDT, endDT } = getSingleWeekRange(rangeYear ?? "lastPeriod", rangeValue ?? "lastPeriod");
          return {
            customStartDate: startDT.toISOString(),
            customEndDate: endDT.toISOString(),
          };
        }
        default:
          return {};
      }
    } catch (error) {
      console.warn("Failed to derive legacy report range", error);
      return {};
    }
  };

  // Load initial state from localStorage or use defaults
  const loadInitialState = () => {
    const savedState = localStorage.getItem(STORAGE_KEY);
    if (savedState) {
      try {
        const parsed = JSON.parse(savedState);
        const legacyRange = (!parsed.customStartDate || !parsed.customEndDate) ? deriveLegacyRange(parsed) : {};

        const reportRangeUnit = parsed.reportRangeUnit || defaultReportState.reportRangeUnit;
        const savedActivePreset = parsed.activePreset as PeriodPreset | undefined;
        // If reportRangeUnit is "range_custom" and activePreset is undefined or not one of the presets that use "range_custom",
        // then it's a manual custom range and activePreset should be undefined
        const activePreset = reportRangeUnit === "range_custom" && (savedActivePreset === undefined || !PRESETS_USING_CUSTOM_RANGE.includes(savedActivePreset))
          ? undefined 
          : (savedActivePreset ?? defaultReportState.activePreset);

        return {
          reportType: (parsed.reportType && reportTypeValues.includes(parsed.reportType))
            ? parsed.reportType as ReportType
            : defaultReportState.reportType,
          reportGrouping: parsed.reportGrouping || defaultReportState.reportGrouping,
          reportCategories: parsed.reportCategories || defaultReportState.reportCategories,
          reportRangeUnit,
          fillups: parsed.fillups ?? defaultReportState.fillups,
          grouped: parsed.grouped ?? defaultReportState.grouped,
          selectedBikeparkIDs: parsed.selectedBikeparkIDs || defaultReportState.selectedBikeparkIDs,
          selectedBikeparkDataSources: parsed.bikeparkDataSources || parsed.selectedBikeparkDataSources || defaultReportState.bikeparkDataSources,
          customStartDate: parsed.customStartDate || legacyRange.customStartDate || defaultReportState.customStartDate,
          customEndDate: parsed.customEndDate || legacyRange.customEndDate || defaultReportState.customEndDate,
          activePreset,
          selectedSeries: parsed.selectedSeries || defaultReportState.selectedSeries || DEFAULT_SERIES,
          source: parsed.source || undefined
        };
      } catch (e) {
        console.warn('Failed to parse saved filter state:', e);
      }
    }
    return null;
  };

  const localStorageState = loadInitialState();
  
  // Merge URL state with localStorage state (URL takes precedence)
  const initialState = initialFilterState 
    ? { ...localStorageState, ...initialFilterState }
    : localStorageState;

  const finalReportRangeUnit = initialState?.reportRangeUnit ?? defaultReportState.reportRangeUnit;
  const savedActivePreset = initialState?.activePreset;
  // If reportRangeUnit is "range_custom" and activePreset is undefined or not one of the presets that use "range_custom",
  // then it's a manual custom range and activePreset should be undefined
  const finalActivePreset = finalReportRangeUnit === "range_custom" && (savedActivePreset === undefined || !PRESETS_USING_CUSTOM_RANGE.includes(savedActivePreset))
    ? undefined 
    : (savedActivePreset ?? defaultReportState.activePreset);

  // Use activeReportType if provided, otherwise use initialState or default
  const [reportType, setReportType] = useState<ReportType>(
    activeReportType ?? initialState?.reportType ?? defaultReportState.reportType
  );
  const [reportGrouping, setReportGrouping] = useState<ReportGrouping>(initialState?.reportGrouping ?? defaultReportState.reportGrouping);
  const [reportCategories, setReportCategories] = useState<ReportCategories>(initialState?.reportCategories ?? defaultReportState.reportCategories);
  const [reportRangeUnit, setReportRangeUnit] = useState<ReportRangeUnit>(finalReportRangeUnit);
  const [selectedBikeparkIDs, setSelectedBikeparkIDs] = useState<string[]>(initialState?.selectedBikeparkIDs ?? defaultReportState.selectedBikeparkIDs);
  const [selectedBikeparkDataSources, setSelectedBikeparkDataSources] = useState<BikeparkWithDataSource[]>(initialState?.selectedBikeparkDataSources ?? defaultReportState.bikeparkDataSources);
  const [datatype, setDatatype] = useState<ReportDatatype | undefined>(undefined);
  const [customStartDate, setCustomStartDate] = useState<string | undefined>(initialState?.customStartDate ?? defaultReportState.customStartDate);
  const [customEndDate, setCustomEndDate] = useState<string | undefined>(initialState?.customEndDate ?? defaultReportState.customEndDate);
  const [activePreset, setActivePreset] = useState<PeriodPreset | undefined>(finalActivePreset);
  const [fillups, setFillups] = useState(initialState?.fillups ?? defaultReportState.fillups);
  const [grouped, setGrouped] = useState(initialState?.grouped ?? defaultReportState.grouped);
  const [selectedSeries, setSelectedSeries] = useState<SeriesLabel[]>(initialState?.selectedSeries ?? defaultReportState.selectedSeries ?? DEFAULT_SERIES);
  const [source, setSource] = useState<string | undefined>(initialState?.source ?? undefined);
  const [percBusy, setPercBusy] = useState("");
  const [percQuiet, setPercQuiet] = useState("");
  const [errorState, setErrorState] = useState<string | undefined>(undefined);
  const [warningState, setWarningState] = useState<string | undefined>(undefined);
  const xAxisSelectRef = useRef<HTMLSelectElement>(null);
  const legendaSelectRef = useRef<HTMLSelectElement>(null);

  const currentReportState: ReportState = {
    reportType,
    reportGrouping,
    reportCategories,
    reportRangeUnit,
    selectedBikeparkIDs,
    fillups,
    grouped,
    bikeparkDataSources: selectedBikeparkDataSources,
    customStartDate,
    customEndDate,
    activePreset,
    selectedSeries,
    source
  };

  const normalizeDate = (date: Date) => {
    const normalized = new Date(date);
    normalized.setHours(0, 0, 0, 0);
    return normalized;
  };

  const setRangeWithDates = (unit: ReportRangeUnit, start: Date, end: Date, preset?: PeriodPreset) => {
    const normalizedStart = new Date(start);
    normalizedStart.setHours(0, 0, 0, 0);
    const normalizedEnd = new Date(end);
    normalizedEnd.setHours(23, 59, 59, 999);

    if (normalizedStart > normalizedEnd) {
      const temp = new Date(normalizedStart);
      normalizedStart.setTime(normalizedEnd.getTime());
      normalizedEnd.setTime(temp.getTime());
    }

    setReportRangeUnit(unit);
    setCustomStartDate(normalizedStart.toISOString());
    setCustomEndDate(normalizedEnd.toISOString());
    setActivePreset(preset);
  };

  const applyCustomRangeInternal = (start: Date, end: Date, preset?: PeriodPreset) => {
    let normalizedStart = normalizeDate(start);
    let normalizedEnd = normalizeDate(end);

    if (normalizedStart > normalizedEnd) {
      const temp = normalizedStart;
      normalizedStart = normalizedEnd;
      normalizedEnd = temp;
    }

    const rangeEnd = new Date(normalizedEnd);
    rangeEnd.setHours(23, 59, 59, 999);

    setRangeWithDates("range_custom", normalizedStart, rangeEnd, preset);
  };

  const applyPresetInternal = (preset: PeriodPreset) => {
    try {
      const presetRange = getRangeForPreset(preset, { now: new Date(), firstDate, lastDate });
      setRangeWithDates(presetRange.reportRangeUnit, presetRange.startDT, presetRange.endDT, preset);
    } catch (error) {
      console.warn(`Failed to apply preset ${preset}`, error);
      setActivePreset(undefined);
    }
  };

  useImperativeHandle(ref, () => ({
    applyPreset: (preset: PeriodPreset) => {
      applyPresetInternal(preset);
    },
    applyCustomRange: (start: Date, end: Date) => {
      applyCustomRangeInternal(start, end, undefined);
    }
  }));

  const availableReports = getAvailableReports(showAbonnementenRapporten);

  useEffect(() => {
    if (activeReportType && activeReportType !== reportType) {
      setReportType(activeReportType);
    }
  }, [activeReportType, reportType]);

  // Track the last applied URL state to prevent re-applying the same state
  const lastAppliedUrlStateRef = useRef<string>('');
  
  // Apply initial filter state from URL when provided
  // This allows URL params to override localStorage state
  useEffect(() => {
    if (!initialFilterState) return;
    
    // Create a stable string representation of the URL state
    const urlStateString = JSON.stringify({
      reportGrouping: initialFilterState.reportGrouping,
      reportCategories: initialFilterState.reportCategories,
      reportRangeUnit: initialFilterState.reportRangeUnit,
      selectedBikeparkIDs: initialFilterState.selectedBikeparkIDs?.sort(),
      customStartDate: initialFilterState.customStartDate,
      customEndDate: initialFilterState.customEndDate,
      activePreset: initialFilterState.activePreset,
      fillups: initialFilterState.fillups,
      source: initialFilterState.source,
      selectedSeries: initialFilterState.selectedSeries?.sort(),
      bikeparkDataSources: initialFilterState.bikeparkDataSources
    });
    
    // Only apply if this is a new/different URL state
    if (urlStateString === lastAppliedUrlStateRef.current) {
      return;
    }
    
    lastAppliedUrlStateRef.current = urlStateString;
    
    // Apply URL state only if values are different from current state
    if (initialFilterState.reportGrouping && initialFilterState.reportGrouping !== reportGrouping) {
      setReportGrouping(initialFilterState.reportGrouping);
    }
    if (initialFilterState.reportCategories && initialFilterState.reportCategories !== reportCategories) {
      setReportCategories(initialFilterState.reportCategories);
    }
    if (initialFilterState.reportRangeUnit && initialFilterState.reportRangeUnit !== reportRangeUnit) {
      setReportRangeUnit(initialFilterState.reportRangeUnit);
    }
    if (initialFilterState.selectedBikeparkIDs && initialFilterState.selectedBikeparkIDs.length > 0) {
      const currentIds = [...selectedBikeparkIDs].sort().join(',');
      const newIds = [...initialFilterState.selectedBikeparkIDs].sort().join(',');
      if (currentIds !== newIds) {
        setSelectedBikeparkIDs(initialFilterState.selectedBikeparkIDs);
      }
    }
    if (initialFilterState.customStartDate && initialFilterState.customStartDate !== customStartDate) {
      setCustomStartDate(initialFilterState.customStartDate);
    }
    if (initialFilterState.customEndDate && initialFilterState.customEndDate !== customEndDate) {
      setCustomEndDate(initialFilterState.customEndDate);
    }
    if (initialFilterState.activePreset && initialFilterState.activePreset !== activePreset) {
      setActivePreset(initialFilterState.activePreset);
    }
    if (initialFilterState.fillups !== undefined && initialFilterState.fillups !== fillups) {
      setFillups(initialFilterState.fillups);
    }
    if (initialFilterState.source !== undefined && initialFilterState.source !== source) {
      setSource(initialFilterState.source);
    }
    if (initialFilterState.selectedSeries) {
      const currentSeries = [...(selectedSeries || [])].sort().join(',');
      const newSeries = [...initialFilterState.selectedSeries].sort().join(',');
      if (currentSeries !== newSeries) {
        setSelectedSeries(initialFilterState.selectedSeries);
      }
    }
    if (initialFilterState.bikeparkDataSources) {
      const currentDataSources = JSON.stringify(selectedBikeparkDataSources || []);
      const newDataSources = JSON.stringify(initialFilterState.bikeparkDataSources);
      if (currentDataSources !== newDataSources) {
        setSelectedBikeparkDataSources(initialFilterState.bikeparkDataSources);
      }
    }
  }, [initialFilterState]);

  const previousStateRef = useRef<ReportState | null>(null);
  const hasInitializedBikeparksRef = useRef<boolean>(false);
  const initialBikeparkSelectionRef = useRef<string[] | undefined>(
    initialState?.selectedBikeparkIDs || initialFilterState?.selectedBikeparkIDs
  );

  // Load initial bikepark selection when bikeparks are first loaded
  // Only runs once to set default "select all" behavior, then respects user selections
  useEffect(() => {
    if (bikeparks.length === 0 || hasInitializedBikeparksRef.current) return;
    
    const validBikeparkIDs = bikeparks
      .filter(bikepark => bikepark.StallingsID !== null)
      .map(bikepark => bikepark.StallingsID as string);
    
    // Only auto-select all if there's no saved selection from localStorage/URL
    // Check if we have a meaningful initial state (not just empty array from default)
    const hasSavedSelection = initialBikeparkSelectionRef.current && 
                               initialBikeparkSelectionRef.current.length > 0;
    
    // Only auto-select if there's no saved state to respect
    if (!hasSavedSelection) {
      setSelectedBikeparkIDs(validBikeparkIDs);
    }
    
    hasInitializedBikeparksRef.current = true;
  }, [bikeparks]);

  // Track previous bikeparks to detect changes
  const previousBikeparksRef = useRef<string>('');
  
  // Update selectedBikeparkIDs when bikeparks prop changes (e.g., when bikeparksWithData changes)
  // Filter out any selected IDs that are no longer in the available bikeparks list
  useEffect(() => {
    if (bikeparks.length === 0) return;
    
    // Create a stable string representation of bikeparks to detect changes
    const bikeparksString = bikeparks
      .map(bp => bp.StallingsID)
      .filter(id => id !== null)
      .sort()
      .join(',');
    
    // Only proceed if bikeparks actually changed
    if (bikeparksString === previousBikeparksRef.current) return;
    previousBikeparksRef.current = bikeparksString;
    
    const availableBikeparkIDs = bikeparks
      .filter(bikepark => bikepark.StallingsID !== null)
      .map(bikepark => bikepark.StallingsID as string);
    
    // Use functional updates to access current state values
    setSelectedBikeparkIDs(currentSelectedIDs => {
      // Filter selectedBikeparkIDs to only include IDs that are still available
      const filteredSelectedIDs = currentSelectedIDs.filter(id => 
        availableBikeparkIDs.includes(id)
      );
      
      // Only update if there's a change (some IDs were removed)
      if (filteredSelectedIDs.length !== currentSelectedIDs.length) {
        skipNextBikeparkIDsSyncRef.current = true;
        return filteredSelectedIDs;
      }
      return currentSelectedIDs;
    });
    
    // Use functional updates to access current state values
    setSelectedBikeparkDataSources(currentDataSources => {
      // Also update bikeparkDataSources to match available bikeparks
      const filteredDataSources = currentDataSources.filter(bp => 
        availableBikeparkIDs.includes(bp.StallingsID)
      );
      
      if (filteredDataSources.length !== currentDataSources.length) {
        skipNextDataSourceSyncRef.current = true;
        return filteredDataSources;
      }
      return currentDataSources;
    });
  }, [bikeparks]);

  const lastBikeparkDataSourcesRef = useRef<string>('');
  const lastSelectedBikeparkIDsRef = useRef<string>('');
  const skipNextDataSourceSyncRef = useRef<boolean>(false);
  const skipNextBikeparkIDsSyncRef = useRef<boolean>(false);

  // Sync selectedBikeparkIDs with bikeparkDataSources when bikeparkDataSources changes
  // This is especially important for the bezetting report type where BikeparkDataSourceSelect is used
  useEffect(() => {
    if (reportType !== 'bezetting') return;
    if (skipNextDataSourceSyncRef.current) {
      skipNextDataSourceSyncRef.current = false;
      return;
    }

    const currentDataSourcesString = JSON.stringify(selectedBikeparkDataSources || []);
    const dataSourcesChanged = currentDataSourcesString !== lastBikeparkDataSourcesRef.current;
    lastBikeparkDataSourcesRef.current = currentDataSourcesString;

    // Only sync when bikeparkDataSources actually changes
    if (!dataSourcesChanged) return;

    if (selectedBikeparkDataSources && selectedBikeparkDataSources.length > 0) {
      const idsFromDataSources = selectedBikeparkDataSources.map(bp => bp.StallingsID);
      const currentIds = [...selectedBikeparkIDs].sort().join(',');
      const newIds = [...idsFromDataSources].sort().join(',');
      if (currentIds !== newIds) {
        skipNextBikeparkIDsSyncRef.current = true;
        setSelectedBikeparkIDs(idsFromDataSources);
      }
    } else if (selectedBikeparkDataSources && selectedBikeparkDataSources.length === 0) {
      // If bikeparkDataSources is cleared, also clear selectedBikeparkIDs
      if (selectedBikeparkIDs.length > 0) {
        skipNextBikeparkIDsSyncRef.current = true;
        setSelectedBikeparkIDs([]);
      }
    }
  }, [reportType, selectedBikeparkDataSources]);

  // Sync bikeparkDataSources with selectedBikeparkIDs when user manually changes selectedBikeparkIDs
  // This keeps them in sync when user changes selection in BikeparkSelect
  useEffect(() => {
    if (reportType !== 'bezetting') return;
    if (skipNextBikeparkIDsSyncRef.current) {
      skipNextBikeparkIDsSyncRef.current = false;
      return;
    }

    const currentIdsString = [...selectedBikeparkIDs].sort().join(',');
    const idsChanged = currentIdsString !== lastSelectedBikeparkIDsRef.current;
    lastSelectedBikeparkIDsRef.current = currentIdsString;

    // Only sync when selectedBikeparkIDs actually changes
    if (!idsChanged) return;

    // Update bikeparkDataSources to match selectedBikeparkIDs
    // Keep existing source selections when possible, default to FMS
    const updatedDataSources = selectedBikeparkIDs
      .map(id => {
        const existing = selectedBikeparkDataSources.find(bp => bp.StallingsID === id);
        const bikepark = bikeparks.find(bp => bp.StallingsID === id);
        if (bikepark) {
          return {
            StallingsID: id,
            Title: bikepark.Title || '',
            source: existing?.source || 'FMS'
          };
        }
        return null;
      })
      .filter((bp): bp is BikeparkWithDataSource => bp !== null);

    const currentDataSourcesString = JSON.stringify(selectedBikeparkDataSources || []);
    const newDataSourcesString = JSON.stringify(updatedDataSources);
    if (currentDataSourcesString !== newDataSourcesString) {
      skipNextDataSourceSyncRef.current = true;
      setSelectedBikeparkDataSources(updatedDataSources);
    }
  }, [reportType, selectedBikeparkIDs, bikeparks]);

  useEffect(() => {
    const newState: ReportState = currentReportState;

    // If state has changed:
    if (null === previousStateRef.current || JSON.stringify(newState) !== JSON.stringify(previousStateRef.current)) {

      // Auto set defaults for report types
      if (newState.reportType !== previousStateRef.current?.reportType) {
        switch (newState.reportType) {
          case "transacties_voltooid":
            setReportGrouping("per_week");
            setReportCategories("per_stalling");
            break;
          case "bezetting":
            setReportGrouping("per_hour");
            setReportCategories("per_weekday");
            break;
          case "absolute_bezetting":
            // Default to "Per uur" for absolute_bezetting
            setReportGrouping("per_hour_time");
            setReportCategories("per_stalling");
            break;
          case "stallingsduur":
            setReportGrouping("per_bucket");
            setReportCategories("per_type_klant");
            break;
          default:
            setReportGrouping("per_week");
            setReportCategories("per_stalling");
            break;
        }
      }

      // Ensure absolute_bezetting never ends up with an invalid grouping (e.g. from localStorage)
      if (newState.reportType === "absolute_bezetting" && newState.reportGrouping !== "per_hour_time" && newState.reportGrouping !== "per_quarter_hour") {
        setReportGrouping("per_hour_time");
        return;
      }

      if (null === previousStateRef.current || newState.reportRangeUnit !== previousStateRef.current.reportRangeUnit) {
        switch (newState.reportRangeUnit) {
          case "range_year":
            if (newState.reportGrouping === "per_year") {
              setReportGrouping("per_month");
              return;
            }
            break;
          case "range_quarter":
            if (newState.reportGrouping === "per_year" || newState.reportGrouping === "per_quarter") {
              setReportGrouping("per_month");
              return;
            }
            break;
          case "range_month":
            if (newState.reportGrouping === "per_year" || newState.reportGrouping === "per_quarter" || newState.reportGrouping === "per_month") {
              setReportGrouping("per_week");
              return;
            }
            break;
          case "range_week":
            if (newState.reportGrouping === "per_year" || newState.reportGrouping === "per_quarter" || newState.reportGrouping === "per_month" || newState.reportGrouping === "per_week") {
              setReportGrouping("per_day");
              return;
            }
          default:
            break;
        }
      }

      // Auto-switch grouping for absolute_bezetting when period >= 14 days and "Uur" or "Kwartier" is selected
      if (newState.reportType === "absolute_bezetting" && newState.customStartDate && newState.customEndDate) {
        const startDT = new Date(newState.customStartDate);
        const endDT = new Date(newState.customEndDate);
        const DAY_IN_MS = 24 * 60 * 60 * 1000;
        const isValidPeriod = endDT >= startDT;
        const periodInDays = isValidPeriod ? Math.floor((endDT.getTime() - startDT.getTime()) / DAY_IN_MS) + 1 : 0;
        
        // Check if period changed and grouping is now invalid
        const prevStartDT = previousStateRef.current?.customStartDate ? new Date(previousStateRef.current.customStartDate) : null;
        const prevEndDT = previousStateRef.current?.customEndDate ? new Date(previousStateRef.current.customEndDate) : null;
        const periodChanged = !prevStartDT || !prevEndDT || 
          prevStartDT.getTime() !== startDT.getTime() || 
          prevEndDT.getTime() !== endDT.getTime();
        
        if (periodChanged && isValidPeriod && periodInDays >= 14 && newState.reportGrouping === "per_quarter_hour") {
          // Prefer "Per uur" as the fallback when the period gets too large for kwartier
          setReportGrouping("per_hour_time");
          return;
        }
      }

      previousStateRef.current = newState; // Update the previous state
      onStateChange(newState);
    }

    return;
  }, [
    reportType,
    reportGrouping,
    reportCategories,
    reportRangeUnit,
    selectedBikeparkIDs,
    fillups,
    grouped,
    selectedBikeparkDataSources,
    customStartDate,
    customEndDate,
    activePreset,
    selectedSeries,
    source,
    onStateChange,
    bikeparks
  ]);


  useEffect(() => {
    checkInput();
  }, [reportRangeUnit, reportType, selectedBikeparkIDs, datatype, customStartDate, customEndDate, activePreset]);

  // Helper function to calculate available X-axis options based on current state
  const getAvailableXAxisOptions = (): Array<{ value: ReportGrouping; label: string; disabled?: boolean }> => {
    const { startDT, endDT } = getStartEndDT(currentReportState, firstDate, lastDate);
    const DAY_IN_MS = 24 * 60 * 60 * 1000;
    const isValidPeriod = endDT >= startDT;
    const periodInDays = isValidPeriod ? Math.floor((endDT.getTime() - startDT.getTime()) / DAY_IN_MS) + 1 : 0;

    const isStallingsduurReport = ["stallingsduur"].includes(reportType);
    const isBezettingReport = ["bezetting"].includes(reportType);
    const isAbsoluteBezettingReport = ["absolute_bezetting"].includes(reportType);
    const showIntervalPeriods = !isStallingsduurReport && !isBezettingReport;

    const showIntervalYear = showIntervalPeriods && true;
    const showIntervalMonth = (showIntervalPeriods && isValidPeriod) ? periodInDays <= 732 : false;
    const showIntervalWeek = (showIntervalPeriods && isValidPeriod) ? periodInDays <= 366 : false;
    const showIntervalDay = (showIntervalPeriods && isValidPeriod) ? periodInDays <= 90 : false;
    const showIntervalWeekday = showIntervalPeriods && ["stallingsduur"].includes(reportType);
    const showIntervalHourOfDay = ["bezetting"].includes(reportType) === true;
    const isHourDisabled = isAbsoluteBezettingReport && isValidPeriod && periodInDays >= 14;
    const isQuarterHourDisabled = isAbsoluteBezettingReport && isValidPeriod && periodInDays >= 14;
    const showIntervalBucket = isStallingsduurReport;

    const xAxisOptions: Array<{ value: ReportGrouping; label: string; disabled?: boolean }> = [];
    if (isAbsoluteBezettingReport) {
      xAxisOptions.push({
        value: "per_hour_time",
        label: isHourDisabled ? "Uur (max. 14 dagen)" : "Uur",
        disabled: isHourDisabled,
      });
      xAxisOptions.push({
        value: "per_quarter_hour",
        label: isQuarterHourDisabled ? "Kwartier (max. 14 dagen)" : "Kwartier",
        disabled: isQuarterHourDisabled,
      });
    } else {
      if (showIntervalYear) xAxisOptions.push({ value: "per_year", label: "Jaar" });
      if (showIntervalMonth) xAxisOptions.push({ value: "per_month", label: "Maand" });
      if (showIntervalWeek) xAxisOptions.push({ value: "per_week", label: "Week" });
      if (showIntervalDay) xAxisOptions.push({ value: "per_day", label: "Dag" });
      if (showIntervalWeekday) xAxisOptions.push({ value: "per_weekday", label: "Dag van de week" });
      if (showIntervalHourOfDay) xAxisOptions.push({ value: "per_hour", label: "Uur van de dag" });
      if (showIntervalBucket) xAxisOptions.push({ value: "per_bucket", label: "Stallingsduur" });
    }

    return xAxisOptions;
  };

  // Auto-update reportGrouping if current selection is no longer available
  useEffect(() => {
    if (!reportType) return;

    const availableOptions = getAvailableXAxisOptions();
    
    // Check if current reportGrouping is still available (and not disabled)
    const currentOption = availableOptions.find(opt => opt.value === reportGrouping);
    const isCurrentOptionValid = currentOption && !currentOption.disabled;
    
    // If current selection is not available or is disabled, select the first available non-disabled option
    if (!isCurrentOptionValid && availableOptions.length > 0) {
      const firstAvailableOption = availableOptions.find(opt => !opt.disabled) || availableOptions[0];
      if (firstAvailableOption && firstAvailableOption.value !== reportGrouping) {
        setReportGrouping(firstAvailableOption.value);
      }
    }
  }, [reportType, customStartDate, customEndDate, reportRangeUnit, activePreset, firstDate, lastDate, reportGrouping]);

  // Auto set preset "select" values if period changes
  useEffect(() => {
    const startDT = customStartDate ? new Date(customStartDate) : undefined;
    const endDT = customEndDate ? new Date(customEndDate) : undefined;
    if(! startDT || ! endDT) return;

    const DAY_IN_MS = 24 * 60 * 60 * 1000;
    const isValidPeriod = endDT >= startDT;
    const periodInDays = isValidPeriod ? Math.floor((endDT.getTime() - startDT.getTime()) / DAY_IN_MS) + 1 : 0;

    if(! isValidPeriod) return;

    if(periodInDays <= 100) {
      // Do nothing
    } else if(periodInDays <= 124) {
      setReportRangeUnit("range_week");
      console.log('Naar week')
    } else if(periodInDays <= 732) {
      setReportRangeUnit("range_month");
      console.log('Naar maand')
    } else if(periodInDays <= 1464) {
      setReportRangeUnit("range_quarter");
      console.log('Naar kwartier')
    } else {
      setReportRangeUnit("range_year");
      console.log('Naar jaar')
    }
  }, [customStartDate, customEndDate, activePreset]);

  // useEffect(() => {
  // Filter out any selected bikeparks that are no longer in the bikeparks array
  // setSelectedBikeparkIDs((prevSelected) =>
  //   prevSelected.filter((id) => bikeparks.some((park) => park.StallingsID === id))
  // );
  // setSelectedBikeparkIDs(bikeparks.map((bikepark) => bikepark.StallingsID));
  // }, [bikeparks]);  

  const checkInput = () => {

    if (reportType === "downloads" && datatype === "bezettingsdata") {
      const { endDT } = getStartEndDT(currentReportState, firstDate, lastDate);
      if (endDT > new Date()) {
        setWarningState("Zeer recente bezettingsdata op basis van in- en uitchecks is onbetrouwbaar omdat deze nog niet gecorrigeerd zijn middels controlescans");
      }
    }

    return true;
  };

  // const getXAxisLabel = (value: ReportGrouping): string => {
  //   const labels: Record<ReportGrouping, string> = {
  //     per_year: "Jaar",
  //     per_month: "Maand",
  //     per_week: "Week",
  //     per_day: "Dag",
  //     per_weekday: "Dag van de week",
  //     per_hour: "Uur van de dag",
  //     per_bucket: "Stallingsduur",
  //     per_quarter: "Kwartaal",
  //   };
  //   return labels[value] || value;
  // };

  // const getLegendaLabel = (value: ReportCategories): string => {
  //   const labels: Record<ReportCategories, string> = {
  //     none: "Geen",
  //     per_stalling: "Per stalling",
  //     per_weekday: "Per dag van de week",
  //     per_section: "Per sectie",
  //     per_type_klant: "Per type klant",
  //   };
  //   return labels[value] || value;
  // };

  const renderUnitSelect = () => {
    if (undefined === reportType) return null;

    if (showDetails === false) return null;

    const { startDT, endDT } = getStartEndDT(currentReportState, firstDate, lastDate);
    const DAY_IN_MS = 24 * 60 * 60 * 1000;
    const isValidPeriod = endDT >= startDT;
    const periodInDays = isValidPeriod ? Math.floor((endDT.getTime() - startDT.getTime()) / DAY_IN_MS) + 1 : 0;

    const isStallingsduurReport = ["stallingsduur"].includes(reportType);
    const isBezettingReport = ["bezetting"].includes(reportType);
    const isAbsoluteBezettingReport = ["absolute_bezetting"].includes(reportType);
    const showIntervalPeriods = !isStallingsduurReport && !isBezettingReport;

    const showCategorySection = ["bezetting"].includes(reportType);
    const showCategoryPerTypeKlant = ["stallingsduur"].includes(reportType);

    // Show the generic BikeparkSelect for all reports, including absolute_bezetting
    const showBikeparkSelect = true;

    // Build available X-axis options using the helper function
    const xAxisOptions = getAvailableXAxisOptions();

    // Build available Legenda options
    const legendaOptions: Array<{ value: ReportCategories; label: string }> = [];
    if (!isStallingsduurReport && !isBezettingReport) {
      legendaOptions.push({ value: "none", label: "Geen" });
      legendaOptions.push({ value: "per_stalling", label: "Per stalling" });
    }
    if (isBezettingReport) {
      legendaOptions.push({ value: "per_weekday", label: "Per dag van de week" });
    }
    if (showCategorySection && !isBezettingReport) {
      legendaOptions.push({ value: "per_section", label: "Per sectie" });
    }
    if (showCategoryPerTypeKlant) {
      legendaOptions.push({ value: "per_type_klant", label: "Per type klant" });
    }

    return (
      <div className="flex flex-wrap gap-4">
        <div className="md:hidden w-full">
          <label htmlFor="report" className="block text-sm font-semibold text-gray-700 mb-2">
            Rapportage
          </label>
          <select
            className={`${selectClasses} w-full`}
            name="report"
            id="report"
            value={reportType}
            onChange={(e) => setReportType(e.target.value as ReportType)}
            required
          >
            {availableReports.map((report) => (
              <option key={report.id} value={report.id}>
                {report.title}
              </option>
            ))}
          </select>
        </div>
        {reportType === "downloads" && (
          <div className="row">
            <div className="title">Soort data</div>
            <select
              name="datatype"
              value={datatype}
              className="p-2 border-2 border-gray-300 rounded-md"
              onChange={(e) => setDatatype(e.target.value as ReportDatatype)}
            >
              <option value="bezettingsdata">Bezettingsdata</option>
              {false && <option value="ruwedata">Ruwe data</option>}
            </select>
          </div>
        )}

        <div className="relative inline-block text-left">
          <button
            type="button"
            className="flex items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-56 h-10 pointer-events-none"
          >
            <span>X-as: {xAxisOptions.length === 1 ? xAxisOptions[0]?.label ?? reportGrouping : (xAxisOptions.find(opt => opt.value === reportGrouping)?.label ?? reportGrouping)}</span>
            <svg
              className="h-4 w-4 text-gray-500"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          <select
            ref={xAxisSelectRef}
            value={reportGrouping}
            onChange={(e) => setReportGrouping(e.target.value as ReportGrouping)}
            name="reportGrouping"
            id="reportGrouping"
            className="absolute left-0 top-0 w-full h-full opacity-0 cursor-pointer z-10"
            required
          >
            {xAxisOptions.map((option) => (
              <option key={option.value} value={option.value} disabled={option.disabled}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        {reportType !== "absolute_bezetting" && (
          <div className="relative inline-block text-left">
            <button
              type="button"
              className="flex items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-56 h-10 pointer-events-none"
            >
              <span>Legenda: {legendaOptions.length === 1 ? legendaOptions[0]?.label ?? reportCategories : (legendaOptions.find(opt => opt.value === reportCategories)?.label ?? reportCategories)}</span>
              <svg
                className="h-4 w-4 text-gray-500"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            <select
              ref={legendaSelectRef}
              value={reportCategories}
              onChange={(e) => setReportCategories(e.target.value as ReportCategories)}
              name="reportCategories"
              id="reportCategories"
              className="absolute left-0 top-0 w-full h-full opacity-0 cursor-pointer z-10"
              required
            >
              {legendaOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        )}

        {showBikeparkSelect &&
          <BikeparkSelect
            bikeparks={bikeparks}
            selectedBikeparkIDs={selectedBikeparkIDs}
            setSelectedBikeparkIDs={setSelectedBikeparkIDs}
            singleSelection={false}
          />
        }
        {showBikeparkSelect && reportType === 'bezetting' &&
          <WeekdaySelect
            availableSeries={DEFAULT_SERIES}
            selectedSeries={selectedSeries}
            setSelectedSeries={setSelectedSeries}
          />
        }
        {showBikeparkSelect && reportType === 'bezetting' &&
          <BikeparkDataSourceSelect
            bikeparks={bikeparks}
            onSelectionChange={setSelectedBikeparkDataSources}
          />
        }
        {reportType === 'absolute_bezetting' && (
          <div className="relative inline-block text-left">
            <button
              type="button"
              className="flex items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-56 h-10 pointer-events-none"
            >
              <span>Databron: {source || 'Alle'}</span>
              <svg
                className="h-4 w-4 text-gray-500"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            <select
              value={source || ''}
              onChange={(e) => setSource(e.target.value || undefined)}
              name="source"
              id="source"
              className="absolute left-0 top-0 w-full h-full opacity-0 cursor-pointer z-10"
            >
              <option value="">Alle</option>
              <option value="FMS">FMS</option>
              <option value="Lumiguide">Lumiguide</option>
            </select>
          </div>
        )}
      </div>
    );
  };

  const renderAbonnementenSelect = (): React.ReactNode => {
    return (
      <div>
        <select
          value={grouped}
          onChange={(e) => setGrouped(e.target.value)}
          className={selectClasses}
          id="grouped"
        >
          <option value="0">Alle abonnementen</option>
          <option value="1">Per abonnement</option>
        </select>
      </div>)
  }

  const renderVolmeldingenSelect = (): React.ReactNode => {
    return (
      <>
        <div className="inputgroup col-sm-5 col-md-2" id="inputgroup_absrel">
          <div className="title">Y-as</div>
          <input type="radio" name="absrel" value="absolute" checked={grouped === "absolute"} onChange={() => setGrouped("absolute")} /> Absoluut<br />
          <input type="radio" name="absrel" value="relative" checked={grouped === "relative"} onChange={() => setGrouped("relative")} /> Procentueel<br />
        </div>
        <div className="inputgroup col-sm-6 col-md-3" id="inputgroup_drukte" style={{ width: "250px" }}>
          <div id="druk">
            Druk als meer dan <input value={percBusy} onChange={(e) => setPercBusy(e.target.value)} type="text" className="integer numeric form-control inline w-11" maxLength={2} name="percBusy" />% vol
          </div>
          <div id="rustig">
            Rustig als minder dan <input value={percQuiet} onChange={(e) => setPercQuiet(e.target.value)} type="text" className="integer numeric form-control inline w-11" maxLength={2} name="percQuiet" />% vol
          </div>
        </div>
      </>
    )
  }

  // Save state to localStorage whenever it changes
  useEffect(() => {
    const stateToSave = {
      reportType,
      reportGrouping,
      reportCategories,
      reportRangeUnit,
      selectedBikeparkIDs,
      bikeparkDataSources: selectedBikeparkDataSources,
      fillups,
      grouped,
      customStartDate,
      customEndDate,
      activePreset,
      selectedSeries,
      source
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stateToSave));
  }, [
    reportType,
    reportGrouping,
    reportCategories,
    reportRangeUnit,
    selectedBikeparkIDs,
    selectedBikeparkDataSources,
    fillups,
    grouped,
    customStartDate,
    customEndDate,
    activePreset,
    selectedSeries,
    source
  ]);

  return (
    <div className="noPrint" id="ReportComponent">
      <div className="flex flex-col space-y-4">
        <div>
          {renderUnitSelect()}

          {reportType === "abonnementen" && (
            <div>
              {renderAbonnementenSelect()}
            </div>
          )}

          {reportType === "volmeldingen" && (
            <div>
              {renderVolmeldingenSelect()}
            </div>
          )}
        </div>

        {/* new row, full width */}
        <div className="flex flex-col space-y-2">
          {errorState && <div style={{ color: "red", fontWeight: "bold" }}>{errorState}</div>}
          {warningState && <div style={{ color: "orange", fontWeight: "bold" }}>{warningState}</div>}
        </div>

        {/* {renderFilterStatus()} */}

      </div>
    </div>
  );
});

ReportsFilterComponent.displayName = "ReportsFilterComponent";

export default ReportsFilterComponent;