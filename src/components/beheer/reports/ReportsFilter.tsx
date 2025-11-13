import React, { useState, useEffect, useRef, useImperativeHandle, forwardRef } from "react";
import BikeparkSelect from './BikeparkSelect';
import { getWeekNumber, getQuarter } from "./ReportsDateFunctions";
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

export const defaultReportState: ReportState = {
  reportType: "transacties_voltooid",
  reportCategories: "per_stalling",
  reportGrouping: "per_month",
  reportRangeUnit: "range_year",
  selectedBikeparkIDs: [],
  reportRangeYear: 2024,
  reportRangeValue: 1,
  fillups: false,
  grouped: "0",
  bikeparkDataSources: [],
  customStartDate: undefined,
  customEndDate: undefined,
  activePreset: undefined
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
  availableReports.push({ id: "transacties_voltooid", title: "Aantal afgeronde transacties" });
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
  reportRangeYear: number | "lastPeriod";
  reportRangeValue: number | "lastPeriod";
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

  // Load initial state from localStorage or use defaults
  const loadInitialState = () => {
    const savedState = localStorage.getItem(STORAGE_KEY);
    if (savedState) {
      try {
        const parsed = JSON.parse(savedState);
        return {
          reportType: parsed.reportType || "transacties_voltooid",
          reportGrouping: parsed.reportGrouping || "per_year",
          reportCategories: parsed.reportCategories || "per_stalling",
          reportRangeUnit: parsed.reportRangeUnit || "range_year",
          reportRangeYear: parsed.reportRangeYear || 2024,
          reportRangeValue: parsed.reportRangeValue || 2024,
          fillups: parsed.fillups || false,
          grouped: parsed.grouped || "0",
          selectedBikeparkIDs: parsed.selectedBikeparkIDs || [],
          selectedBikeparkDataSources: parsed.selectedBikeparkDataSources || [],
          customStartDate: parsed.customStartDate,
          customEndDate: parsed.customEndDate,
          activePreset: parsed.activePreset as PeriodPreset | undefined
        };
      } catch (e) {
        console.warn('Failed to parse saved filter state:', e);
      }
    }
    return null;
  };

  const initialState = loadInitialState();

  const [reportType, setReportType] = useState<ReportType>(initialState?.reportType || "transacties_voltooid");
  const [reportGrouping, setReportGrouping] = useState<ReportGrouping>(initialState?.reportGrouping || "per_year");
  const [reportCategories, setReportCategories] = useState<ReportCategories>(initialState?.reportCategories || "per_stalling");
  const [reportRangeUnit, setReportRangeUnit] = useState<ReportRangeUnit>(initialState?.reportRangeUnit || "range_year");
  const [selectedBikeparkIDs, setSelectedBikeparkIDs] = useState<string[]>(initialState?.selectedBikeparkIDs || []);
  const [selectedBikeparkDataSources, setSelectedBikeparkDataSources] = useState<BikeparkWithDataSource[]>(initialState?.selectedBikeparkDataSources || []);
  const [datatype, setDatatype] = useState<ReportDatatype | undefined>(undefined);
  const [reportRangeYear, setReportRangeYear] = useState<number | "lastPeriod">(initialState?.reportRangeYear || new Date().getFullYear());
  const [reportRangeValue, setReportRangeValue] = useState<number | "lastPeriod">(initialState?.reportRangeValue || new Date().getFullYear());
  const [customStartDate, setCustomStartDate] = useState<string | undefined>(initialState?.customStartDate);
  const [customEndDate, setCustomEndDate] = useState<string | undefined>(initialState?.customEndDate);
  const [activePreset, setActivePreset] = useState<PeriodPreset | undefined>(initialState?.activePreset);
  const [fillups, setFillups] = useState(initialState?.fillups || false);
  const [grouped, setGrouped] = useState(initialState?.grouped || "0");
  const [percBusy, setPercBusy] = useState("");
  const [percQuiet, setPercQuiet] = useState("");
  const [errorState, setErrorState] = useState<string | undefined>(undefined);
  const [warningState, setWarningState] = useState<string | undefined>(undefined);

  const normalizeDate = (date: Date) => {
    const normalized = new Date(date);
    normalized.setHours(0, 0, 0, 0);
    return normalized;
  };

  const applyCustomRangeInternal = (start: Date, end: Date, preset?: PeriodPreset) => {
    let normalizedStart = normalizeDate(start);
    let normalizedEnd = normalizeDate(end);

    if (normalizedStart > normalizedEnd) {
      const temp = normalizedStart;
      normalizedStart = normalizedEnd;
      normalizedEnd = temp;
    }

    normalizedStart.setHours(0, 0, 0, 0);
    normalizedEnd.setHours(23, 59, 59, 999);

    setReportRangeUnit("range_custom");
    setReportRangeYear(normalizedStart.getFullYear());
    setReportRangeValue(normalizedStart.getMonth());
    setCustomStartDate(normalizedStart.toISOString());
    setCustomEndDate(normalizedEnd.toISOString());
    setActivePreset(preset);
  };

  const applyPresetInternal = (preset: PeriodPreset) => {
    const now = new Date();

    switch (preset) {
      case "deze_week": {
        setReportRangeUnit("range_week");
        setReportRangeYear(now.getFullYear());
        setReportRangeValue(getWeekNumber(now));
        setCustomStartDate(undefined);
        setCustomEndDate(undefined);
        setActivePreset(preset);
        break;
      }
      case "deze_maand": {
        setReportRangeUnit("range_month");
        setReportRangeYear(now.getFullYear());
        setReportRangeValue(now.getMonth());
        setCustomStartDate(undefined);
        setCustomEndDate(undefined);
        setActivePreset(preset);
        break;
      }
      case "dit_kwartaal": {
        setReportRangeUnit("range_quarter");
        setReportRangeYear(now.getFullYear());
        setReportRangeValue(getQuarter(now));
        setCustomStartDate(undefined);
        setCustomEndDate(undefined);
        setActivePreset(preset);
        break;
      }
      case "dit_jaar": {
        setReportRangeUnit("range_year");
        setReportRangeYear(now.getFullYear());
        setReportRangeValue(1);
        setCustomStartDate(undefined);
        setCustomEndDate(undefined);
        setActivePreset(preset);
        break;
      }
      case "afgelopen_7_dagen": {
        const start = new Date(now);
        start.setDate(start.getDate() - 6);
        applyCustomRangeInternal(start, now, preset);
        break;
      }
      case "afgelopen_30_dagen": {
        const start = new Date(now);
        start.setDate(start.getDate() - 29);
        applyCustomRangeInternal(start, now, preset);
        break;
      }
      case "afgelopen_12_maanden": {
        const start = new Date(now);
        start.setDate(start.getDate() - 364);
        applyCustomRangeInternal(start, now, preset);
        break;
      }
      case "alles": {
        setReportRangeUnit("range_all");
        setCustomStartDate(undefined);
        setCustomEndDate(undefined);
        setActivePreset(preset);
        break;
      }
      default: {
        // Ensure preset state clears if unexpected input
        setActivePreset(undefined);
      }
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
    const newState: ReportState = {
      reportType,
      reportGrouping,
      reportCategories,
      reportRangeUnit,
      selectedBikeparkIDs,
      reportRangeYear,
      reportRangeValue,
      fillups,
      grouped,
      bikeparkDataSources: selectedBikeparkDataSources,
      customStartDate,
      customEndDate,
      activePreset
    };

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
              setReportRangeYear(2024);
              setReportRangeValue(1);
              setReportGrouping("per_month");
              return;
            }
            break;
          case "range_quarter":
            if (newState.reportGrouping === "per_year" || newState.reportGrouping === "per_quarter") {
              setReportRangeYear(2024);
              setReportRangeValue(1);
              setReportGrouping("per_month");
              return;
            }
            break;
          case "range_month":
            if (newState.reportGrouping === "per_year" || newState.reportGrouping === "per_quarter" || newState.reportGrouping === "per_month") {
              setReportRangeYear(2024);
              setReportRangeValue(0);
              setReportGrouping("per_week");
              return;
            }
            break;
          case "range_week":
            if (newState.reportGrouping === "per_year" || newState.reportGrouping === "per_quarter" || newState.reportGrouping === "per_month" || newState.reportGrouping === "per_week") {
              setReportRangeYear(2024);
              setReportRangeValue(1);
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
    reportRangeYear,
    reportRangeValue,
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
  }, [reportRangeUnit, reportType, selectedBikeparkIDs, reportRangeYear, reportRangeValue, datatype, customStartDate, customEndDate]);

  // useEffect(() => {
  // Filter out any selected bikeparks that are no longer in the bikeparks array
  // setSelectedBikeparkIDs((prevSelected) =>
  //   prevSelected.filter((id) => bikeparks.some((park) => park.StallingsID === id))
  // );
  // setSelectedBikeparkIDs(bikeparks.map((bikepark) => bikepark.StallingsID));
  // }, [bikeparks]);  

  const checkInput = () => {

    if (reportType === "downloads" && datatype === "bezettingsdata") {
      const endPeriod = new Date(reportRangeYear === "lastPeriod" ? new Date().getFullYear() : reportRangeYear, reportRangeValue === "lastPeriod" ? new Date().getMonth() : reportRangeValue, 1);
      if (endPeriod > new Date()) {
        setWarningState("Zeer recente bezettingsdata op basis van in- en uitchecks is onbetrouwbaar omdat deze nog niet gecorrigeerd zijn middels controlescans");
      }
    }

    return true;
  }

  const renderUnitSelect = () => {
    if (undefined === reportType) return null;

    if (showDetails === false) return null;


    const showCategorySection = ["bezetting"].includes(reportType);
    const showCategoryPerTypeKlant = ["stallingsduur"].includes(reportType);

    const showIntervalYear = reportRangeUnit === "range_all";
    const showIntervalMonthQuarter = showIntervalYear || ["range_year", "range_custom"].includes(reportRangeUnit);
    const showIntervalWeek = showIntervalMonthQuarter || ["range_month", "range_quarter", "range_custom"].includes(reportRangeUnit);
    const showIntervalHour = ["bezetting"].includes(reportType) === true;
    const showIntervalBucket = ["stallingsduur"].includes(reportType);

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

        <FormLabel title="Tijdsinterval">
          <select
            value={reportGrouping}
            onChange={(e) => setReportGrouping(e.target.value as ReportGrouping)}
            name="reportGrouping"
            id="reportGrouping"
            className={selectClasses}
            required
          >
            {showIntervalYear && <option value="per_year">Jaar</option>}
            {showIntervalMonthQuarter && <option value="per_month">Maand</option>}
            {showIntervalMonthQuarter && <option value="per_quarter">Kwartaal</option>}
            {showIntervalWeek && <option value="per_week">Week</option>}
            <option value="per_day">Dag</option>
            <option value="per_weekday">Dag van de week</option>
            {showIntervalHour && <option value="per_hour">Uur van de dag</option>}
            {showIntervalBucket && <option value="per_bucket">Stallingsduur</option>}
          </select>
        </FormLabel>

        <FormLabel title="Aggregatie">
          <select
            value={reportCategories}
            onChange={(e) => setReportCategories(e.target.value as ReportCategories)}
            name="reportCategories"
            id="reportCategories"
            className={selectClasses}
            required
          >
            <option value="none">Geen</option>
            <option value="per_stalling">Per stalling</option>
            <option value="per_weekday">Per dag van de week</option>
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
      reportRangeYear,
      reportRangeValue,
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
    reportRangeYear,
    reportRangeValue,
    fillups,
    grouped
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