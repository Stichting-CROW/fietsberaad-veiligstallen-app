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
import { VSFietsenstallingLijst } from "~/types/fietsenstallingen";

export type ReportType = "transacties_voltooid" | "inkomsten" | "abonnementen" | "abonnementen_lopend" | "bezetting" | "stallingsduur" | "volmeldingen" | "gelijktijdig_vol" | "downloads"
export const reportTypeValues: [string, ...string[]] = ["transacties_voltooid", "inkomsten", "abonnementen", "abonnementen_lopend", "bezetting", "stallingsduur", "volmeldingen", "gelijktijdig_vol", "downloads"]

export type ReportDatatype = "bezettingsdata" | "ruwedata"
export const reportDatatypeValues = ["bezettingsdata", "ruwedata"]

export type ReportCategories = "none" | "per_stalling" | "per_weekday" | "per_section" | "per_type_klant"
export const reportCategoriesValues = ["none", "per_stalling", "per_weekday", "per_section", "per_type_klant"]

export type ReportGrouping = "per_hour" | "per_day" | "per_weekday" | "per_week" | "per_month" | "per_quarter" | "per_year" | "per_bucket"
export const reportGroupingValues = ["per_hour", "per_day", "per_weekday", "per_week", "per_month", "per_quarter", "per_year", "per_bucket"]

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

const DEFAULT_RANGE_END = new Date();
DEFAULT_RANGE_END.setHours(23, 59, 59, 999);

const DEFAULT_RANGE_START = new Date(DEFAULT_RANGE_END);
DEFAULT_RANGE_START.setDate(DEFAULT_RANGE_START.getDate() - 29);
DEFAULT_RANGE_START.setHours(0, 0, 0, 0);

export const defaultReportState: ReportState = {
  reportType: "transacties_voltooid",
  reportCategories: "per_stalling",
  reportGrouping: "per_month",
  reportRangeUnit: "range_custom",
  selectedBikeparkIDs: [],
  fillups: false,
  grouped: "0",
  bikeparkDataSources: [],
  customStartDate: DEFAULT_RANGE_START.toISOString(),
  customEndDate: DEFAULT_RANGE_END.toISOString(),
  activePreset: "afgelopen_30_dagen"
}

interface ReportsFilterComponentProps {
  showAbonnementenRapporten: boolean;
  firstDate: Date;
  lastDate: Date;
  bikeparks: ReportBikepark[];
  showDetails?: boolean;
  activeReportType?: ReportType;
  onStateChange: (newState: ReportState) => void;
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
  availableReports.push({ id: "stallingsduur", title: "Stallingsduur" });
  // availableReports.push({ id: "volmeldingen", title: "Drukke en rustige momenten" });
  // availableReports.push({ id: "gelijktijdig_vol", title: "Gelijktijdig vol" });
  // availableReports.push({ id: "downloads", title: "Download data" });

  return availableReports;
}

const FormLabel = ({ title, children }: { title: string, children: React.ReactNode }) => {
  return <div>
    <label className="col-xs-3 col-sm-2 col-form-label font-bold mr-5">
      {title}
    </label>
    <div>
      {children}
    </div>
  </div>
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
};

export interface ReportsFilterHandle {
  applyPreset: (preset: PeriodPreset) => void;
  applyCustomRange: (start: Date, end: Date) => void;
}

const STORAGE_KEY = 'VS_reports_filterState';

const ReportsFilterComponent = forwardRef<ReportsFilterHandle, ReportsFilterComponentProps>(({
  showAbonnementenRapporten,
  firstDate,
  lastDate,
  bikeparks,
  showDetails = true,
  activeReportType,
  onStateChange
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

        return {
          reportType: parsed.reportType || defaultReportState.reportType,
          reportGrouping: parsed.reportGrouping || defaultReportState.reportGrouping,
          reportCategories: parsed.reportCategories || defaultReportState.reportCategories,
          reportRangeUnit: parsed.reportRangeUnit || defaultReportState.reportRangeUnit,
          fillups: parsed.fillups ?? defaultReportState.fillups,
          grouped: parsed.grouped ?? defaultReportState.grouped,
          selectedBikeparkIDs: parsed.selectedBikeparkIDs || defaultReportState.selectedBikeparkIDs,
          selectedBikeparkDataSources: parsed.bikeparkDataSources || parsed.selectedBikeparkDataSources || defaultReportState.bikeparkDataSources,
          customStartDate: parsed.customStartDate || legacyRange.customStartDate || defaultReportState.customStartDate,
          customEndDate: parsed.customEndDate || legacyRange.customEndDate || defaultReportState.customEndDate,
          activePreset: parsed.activePreset as PeriodPreset | undefined ?? defaultReportState.activePreset
        };
      } catch (e) {
        console.warn('Failed to parse saved filter state:', e);
      }
    }
    return null;
  };

  const initialState = loadInitialState();

  const [reportType, setReportType] = useState<ReportType>(initialState?.reportType ?? defaultReportState.reportType);
  const [reportGrouping, setReportGrouping] = useState<ReportGrouping>(initialState?.reportGrouping ?? defaultReportState.reportGrouping);
  const [reportCategories, setReportCategories] = useState<ReportCategories>(initialState?.reportCategories ?? defaultReportState.reportCategories);
  const [reportRangeUnit, setReportRangeUnit] = useState<ReportRangeUnit>(initialState?.reportRangeUnit ?? defaultReportState.reportRangeUnit);
  const [selectedBikeparkIDs, setSelectedBikeparkIDs] = useState<string[]>(initialState?.selectedBikeparkIDs ?? defaultReportState.selectedBikeparkIDs);
  const [selectedBikeparkDataSources, setSelectedBikeparkDataSources] = useState<BikeparkWithDataSource[]>(initialState?.selectedBikeparkDataSources ?? defaultReportState.bikeparkDataSources);
  const [datatype, setDatatype] = useState<ReportDatatype | undefined>(undefined);
  const [customStartDate, setCustomStartDate] = useState<string | undefined>(initialState?.customStartDate ?? defaultReportState.customStartDate);
  const [customEndDate, setCustomEndDate] = useState<string | undefined>(initialState?.customEndDate ?? defaultReportState.customEndDate);
  const [activePreset, setActivePreset] = useState<PeriodPreset | undefined>(initialState?.activePreset ?? defaultReportState.activePreset);
  const [fillups, setFillups] = useState(initialState?.fillups ?? defaultReportState.fillups);
  const [grouped, setGrouped] = useState(initialState?.grouped ?? defaultReportState.grouped);
  const [percBusy, setPercBusy] = useState("");
  const [percQuiet, setPercQuiet] = useState("");
  const [errorState, setErrorState] = useState<string | undefined>(undefined);
  const [warningState, setWarningState] = useState<string | undefined>(undefined);

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
    activePreset
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

  const previousStateRef = useRef<ReportState | null>(null);

  useEffect(() => {
    setSelectedBikeparkIDs(bikeparks.map(bikepark => bikepark.StallingsID as string));
  }, [bikeparks]);

  useEffect(() => {
    const newState: ReportState = currentReportState;

    // If state has changed:
    if (null === previousStateRef.current || JSON.stringify(newState) !== JSON.stringify(previousStateRef.current)) {

      // Auto set defaults for 'bezetting' report type
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
    onStateChange,
    bikeparks
  ]);

  useEffect(() => {
    checkInput();
  }, [reportRangeUnit, reportType, selectedBikeparkIDs, datatype, customStartDate, customEndDate, activePreset]);

  // Auto set preset "select" values if period changes
  useEffect(() => {
    const startDT = customStartDate ? new Date(customStartDate) : undefined;
    const endDT = customEndDate ? new Date(customEndDate) : undefined;
    if(! startDT || ! endDT) return;

    const DAY_IN_MS = 24 * 60 * 60 * 1000;
    const isValidPeriod = endDT >= startDT;
    const periodInDays = isValidPeriod ? Math.floor((endDT.getTime() - startDT.getTime()) / DAY_IN_MS) + 1 : 0;

    if(! isValidPeriod) return;

    const now = new Date();
    console.log('periodInDays', periodInDays);
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
  }

  const renderUnitSelect = () => {
    if (undefined === reportType) return null;

    if (showDetails === false) return null;

    const { startDT, endDT } = getStartEndDT(currentReportState, firstDate, lastDate);
    const DAY_IN_MS = 24 * 60 * 60 * 1000;
    const isValidPeriod = endDT >= startDT;
    const periodInDays = isValidPeriod ? Math.floor((endDT.getTime() - startDT.getTime()) / DAY_IN_MS) + 1 : 0;

    const isStallingsduurReport = ["stallingsduur"].includes(reportType);
    const isBezettingReport = ["bezetting"].includes(reportType);
    const showIntervalPeriods = !isStallingsduurReport && !isBezettingReport;

    const showCategorySection = ["bezetting"].includes(reportType);
    const showCategoryPerTypeKlant = ["stallingsduur"].includes(reportType);

    const showIntervalYear = showIntervalPeriods && true;
    const showIntervalQuarter = (showIntervalPeriods && isValidPeriod) ? periodInDays <= 1464 : false;
    const showIntervalMonth = (showIntervalPeriods && isValidPeriod) ? periodInDays <= 732 : false;
    const showIntervalWeek = (showIntervalPeriods && isValidPeriod) ? periodInDays <= 366 : false;
    const showIntervalDay = (showIntervalPeriods && isValidPeriod) ? periodInDays <= 90 : false;
    const showIntervalWeekday = showIntervalPeriods && ["stallingsduur"].includes(reportType);
    const showIntervalHour = ["bezetting"].includes(reportType) === true;
    const showIntervalBucket = isStallingsduurReport;

    const showBikeparkSelect = reportCategories !== "per_stalling";

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

        <FormLabel title="X-as">
          <select
            value={reportGrouping}
            onChange={(e) => setReportGrouping(e.target.value as ReportGrouping)}
            name="reportGrouping"
            id="reportGrouping"
            className={selectClasses}
            required
          >
            {showIntervalYear && <option value="per_year">Jaar</option>}
            {showIntervalMonth && <option value="per_month">Maand</option>}
            {showIntervalWeek && <option value="per_week">Week</option>}
            {showIntervalDay && <option value="per_day">Dag</option>}
            {showIntervalWeekday && <option value="per_weekday">Dag van de week</option>}
            {showIntervalHour && <option value="per_hour">Uur van de dag</option>}
            {showIntervalBucket && <option value="per_bucket">Stallingsduur</option>}
          </select>
        </FormLabel>

        <FormLabel title="Legenda">
          <select
            value={reportCategories}
            onChange={(e) => setReportCategories(e.target.value as ReportCategories)}
            name="reportCategories"
            id="reportCategories"
            className={selectClasses}
            required
          >
            {!isStallingsduurReport && !isBezettingReport && (
              <>
                <option value="none">Geen</option>
                <option value="per_stalling">Per stalling</option>
                <option value="per_weekday">Per dag van de week</option>
              </>
            )}
            {showCategorySection && <option value="per_section">Per sectie</option>}
            {showCategoryPerTypeKlant && <option value="per_type_klant">Per type klant</option>}
          </select>
        </FormLabel>
        {showBikeparkSelect && bikeparks.length > 1 &&
          <FormLabel title="Stallingen">
            <div className="w-96">
              <BikeparkSelect
                bikeparks={bikeparks}
                selectedBikeparkIDs={selectedBikeparkIDs}
                setSelectedBikeparkIDs={setSelectedBikeparkIDs}
              />
            </div>
          </FormLabel>
        }
        {showBikeparkSelect && reportType === 'bezetting' && bikeparks.length > 1 &&
          <FormLabel title="Databron per stalling">
            <div className="w-96">
              <BikeparkDataSourceSelect
                bikeparks={bikeparks}
                onSelectionChange={setSelectedBikeparkDataSources}
              />
            </div>
          </FormLabel>
        }
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

  // const renderFilterStatus = (): React.ReactNode => {
  //   let startDT: Date | undefined = undefined;
  //   let endDT: Date | undefined = undefined;

  //   if (undefined !== timerange) {
  //     const range = timerange;
  //     startDT = range.startDT;
  //     endDT = range.endDT;
  //   }

  //   return (
  //     <div className="flex flex-col space-y-2">
  //       <table className="border-2 border-gray-300 rounded-md">
  //         <thead>
  //           <tr>
  //             <th className="text-left">Variabele</th>
  //             <th className="text-left">Waarde</th>
  //           </tr>
  //         </thead>
  //         <tbody>
  //           <tr>
  //             <td>Rapportage</td>
  //             <td>{reportType}</td>
  //           </tr>
  //           <tr>
  //             <td>Tijdsperiode</td>
  //             <td>{reportRangeUnit}</td>
  //           </tr>
  //           <tr>
  //             <td>Aantal Stallingen</td>
  //             <td>{bikeparks.length}</td>
  //           </tr>
  //           <tr>
  //             <td>Start datum/tijd</td>
  //             <td>{startDT !== undefined ? startDT.toLocaleString() : "-"}</td>
  //           </tr>
  //           <tr>
  //             <td>eind datum/tijd</td>
  //             <td>{endDT !== undefined ? endDT.toLocaleString() : "-"}</td>
  //           </tr>
  //         </tbody>
  //       </table>
  //     </div>
  //   )
  // }

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
      activePreset
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
    activePreset
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