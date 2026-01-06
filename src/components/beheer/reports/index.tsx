import React, { useState, useEffect } from "react";
import ReportsFilterComponent, {
  type ReportParams,
  type ReportBikepark,
  type ReportState,
  type ReportType,
  type PeriodPreset,
  type ReportsFilterHandle,
  getAvailableReports
} from "./ReportsFilter";
import { type SeriesLabel } from "./WeekdaySelect";
import { type ReportData } from "~/backend/services/reports/ReportFunctions";
import { type AvailableDataDetailedResult } from "~/backend/services/reports/availableData";
import { getStartEndDT } from "./ReportsDateFunctions";
import CollapsibleContent from '~/components/beheer/common/CollapsibleContent';
import moment from 'moment';

import type { VSUserSecurityProfile } from "~/types/securityprofile";
import type { VSContactGemeente } from "~/types/contacts";

import Chart from './Chart';
import PeriodSelector from "./PeriodSelector";
import { useSession } from "next-auth/react";
import { getXAxisFormatter, getTooltipFormatter } from "~/backend/services/reports/ReportAxisFunctions";
import { useRouter } from "next/router";

// Color palette for chart series - using a diverse set of colors
const CHART_COLORS = [
  '#008FFB', // Blue
  '#00E396', // Green
  '#FEB019', // Orange
  '#FF4560', // Red
  '#775DD0', // Purple
  '#3F51B5', // Indigo
  '#03A9F4', // Light Blue
  '#4CAF50', // Green
  '#FF9800', // Orange
  '#9C27B0', // Purple
  '#E91E63', // Pink
  '#00BCD4', // Cyan
  '#8BC34A', // Light Green
  '#FFC107', // Amber
  '#795548', // Brown
  '#607D8B', // Blue Grey
  '#9E9E9E', // Grey
  '#F44336', // Red
  '#2196F3', // Blue
  '#009688', // Teal
];

/**
 * Generates a consistent color for a series name using a hash function
 * This ensures the same series name always gets the same color
 */
const getColorForSeriesName = (name: string): string => {
  // Simple hash function to convert string to number
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    const char = name.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  
  // Use absolute value and modulo to get index in color array
  const colorIndex = Math.abs(hash) % CHART_COLORS.length;
  return CHART_COLORS[colorIndex] ?? CHART_COLORS[0]!;
};

// Normalize series name to a "color key" so related series can share a color
const getColorKeyForSeries = (name: string, reportType?: ReportType): string => {
  if (reportType === 'absolute_bezetting') {
    // For absolute_bezetting we have "<Title> - Capaciteit" and "<Title> - Bezetting"
    // -> strip the suffix so both series for the same stalling share the same color
    return name.replace(/ - (Capaciteit|Bezetting)$/i, '');
  }
  return name;
};

// Mapping between URL slugs and report types
export const CHART_TYPE_MAP: Record<string, ReportType> = {
  'afgeronde-transacties': 'transacties_voltooid',
  'procentuele-bezetting': 'bezetting',
  'absolute-bezetting': 'absolute_bezetting',
  'stallingsduur': 'stallingsduur',
};

export const REVERSE_CHART_TYPE_MAP: Record<ReportType, string> = {
  'transacties_voltooid': 'afgeronde-transacties',
  'bezetting': 'procentuele-bezetting',
  'absolute_bezetting': 'absolute-bezetting',
  'stallingsduur': 'stallingsduur',
  'inkomsten': 'inkomsten',
  'abonnementen': 'abonnementen',
  'abonnementen_lopend': 'abonnementen_lopend',
  'volmeldingen': 'volmeldingen',
  'gelijktijdig_vol': 'gelijktijdig_vol',
  'downloads': 'downloads',
};

interface ReportComponentProps {
  showAbonnementenRapporten: boolean;
  firstDate: Date;
  lastDate: Date;
  bikeparks: ReportBikepark[];
  error?: string;
  warning?: string;
  onDataLoaded?: (hasReportData: boolean) => void;
  initialReportType?: ReportType;
}

const ReportComponent: React.FC<ReportComponentProps> = ({
  showAbonnementenRapporten,
  firstDate,
  lastDate,
  bikeparks,
  error,
  warning,
  onDataLoaded,
  initialReportType,
}) => {
  const { data: session } = useSession()
  const router = useRouter()

  const [errorState, setErrorState] = useState(error);
  const [warningState, setWarningState] = useState(warning);

  const [gemeenteInfo, setGemeenteInfo] = useState<VSContactGemeente | undefined>(undefined);

  const [reportData, setReportData] = useState<ReportData | undefined>(undefined);

  const [bikeparksWithData, setBikeparksWithData] = useState<ReportBikepark[]>([]);
  const [loading, setLoading] = useState(false);

  const [filterState, setFilterState] = useState<ReportState | undefined>(undefined);
  const availableReports = React.useMemo(
    () => getAvailableReports(showAbonnementenRapporten),
    [showAbonnementenRapporten]
  );
  const [selectedReportType, setSelectedReportType] = useState<ReportType | undefined>(initialReportType);
  const filterComponentRef = React.useRef<ReportsFilterHandle>(null);

  const selectedReportTitle = React.useMemo(() => {
    if (!selectedReportType) return '';
    return (
      availableReports.find(r => r.id === selectedReportType)?.title ||
      reportData?.title ||
      ''
    );
  }, [availableReports, selectedReportType, reportData?.title]);

  // Update selectedReportType when initialReportType changes (e.g., from URL)
  useEffect(() => {
    if (initialReportType) {
      setSelectedReportType(initialReportType);
    }
  }, [initialReportType]);

  const handlePresetSelect = React.useCallback((preset: PeriodPreset) => {
    filterComponentRef.current?.applyPreset(preset);
  }, []);

  const handleCustomRangeChange = React.useCallback((start: Date, end: Date) => {
    filterComponentRef.current?.applyCustomRange(start, end);
  }, []);

  const handleFilterChange = (newState: ReportState) => {
    setFilterState(newState);
    setSelectedReportType(newState.reportType);
  };

  useEffect(() => {
    const abortController = new AbortController();

    const fetchReportData = async () => {
      if (undefined === filterState) {
        return;
      }

      if (filterState.reportType === "absolute_bezetting") {
        const { startDT, endDT } = getStartEndDT(filterState, firstDate, lastDate);
        const DAY_IN_MS = 24 * 60 * 60 * 1000;
        const isValidPeriod = endDT >= startDT;
        const periodInDays = isValidPeriod ? Math.floor((endDT.getTime() - startDT.getTime()) / DAY_IN_MS) + 1 : 0;
        const MAX_DAYS_ABSOLUTE_BEZETTING = 14;

        if (!isValidPeriod || periodInDays > MAX_DAYS_ABSOLUTE_BEZETTING) {
          setReportData(undefined);
          setWarningState(`Absolute bezetting is alleen beschikbaar als je maximaal ${MAX_DAYS_ABSOLUTE_BEZETTING} dagen selecteert.`);
          onDataLoaded && onDataLoaded(false);
          return;
        }
      }

      setLoading(true);
      try {
        const { startDT, endDT } = getStartEndDT(filterState, firstDate, lastDate);

        const apiEndpoint = `/api/reports/${filterState.reportType}`;
        
        // For bezetting report, derive bikeparkIDs from bikeparkDataSources if selectedBikeparkIDs is empty
        let bikeparkIDs = filterState.selectedBikeparkIDs;
        if (filterState.reportType === 'bezetting' && (!bikeparkIDs || bikeparkIDs.length === 0) && filterState.bikeparkDataSources && filterState.bikeparkDataSources.length > 0) {
          bikeparkIDs = filterState.bikeparkDataSources.map(bp => bp.StallingsID);
        }
        
        const response = await fetch(apiEndpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            reportParams: {
              reportType: filterState.reportType,
              reportCategories: filterState.reportCategories,
              reportGrouping: filterState.reportGrouping,
              reportRangeUnit: filterState.reportRangeUnit,
              bikeparkIDs: bikeparkIDs,
              bikeparkDataSources: filterState.bikeparkDataSources,
              startDT,
              endDT,
              fillups: filterState.fillups,
              source: filterState.source,
              dayBeginsAt: gemeenteInfo?.DayBeginsAt
            }
          }),
          signal: abortController.signal
        });

        if (!response.ok) {
          throw new Error(`Error: ${response.statusText}`);
        }
        const data = await response.json();

        // Validate shape before using it
        if (!data || !Array.isArray(data.series)) {
          setReportData(undefined);
          setErrorState("Geen geldige rapportdata ontvangen");
          onDataLoaded && onDataLoaded(false);
          return;
        }

        setReportData(data);
        setErrorState("");
        setWarningState("");
        
        const hasReportData = data.series.some((series: any) => Array.isArray(series.data) && series.data.length > 0);
        onDataLoaded && onDataLoaded(hasReportData);
      } catch (error) {
        if (error instanceof Error && error.name !== 'AbortError') {
          console.error(error);
          setErrorState("Unable to fetch report data");
          setReportData(undefined);
        }
      } finally {
        if (!abortController.signal.aborted) {
          setLoading(false);
        }
      }
    };

    fetchReportData();

    return () => {
      abortController.abort();
    };
  }, [
    filterState,
    gemeenteInfo?.DayBeginsAt
  ]);

  useEffect(() => {
    // Only check waht bikeparks have data if a start and end time are set
    if (!filterState) return;

    // Skip API call for report types that don't support availableDataPerBikepark
    // getSQLPerBikepark only supports: "inkomsten", "stallingsduur", "transacties_voltooid", "bezetting", "absolute_bezetting"
    const supportedReportTypes = ["inkomsten", "stallingsduur", "transacties_voltooid", "bezetting", "absolute_bezetting"];
    if (filterState.reportType && !supportedReportTypes.includes(filterState.reportType)) {
      // For unsupported types, use all bikeparks directly
      setBikeparksWithData(bikeparks);
      setErrorState(""); // Clear any previous error
      return;
    }

    // Get start date and end date from filterState
    const { startDT, endDT } = getStartEndDT(filterState, firstDate, lastDate);

    const abortController = new AbortController();

    const fetchBikeparksWithData = async () => {
      if (undefined === filterState) {
        return;
      }

      try {
        const apiEndpoint = "/api/protected/database/availableDataPerBikepark";
        const response = await fetch(apiEndpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            reportType: filterState.reportType,
            bikeparkIDs: bikeparks.filter(bp => bp.StallingsID !==  null).map(bp => bp.StallingsID),
            startDT: startDT,
            endDT: endDT
          }),
          signal: abortController.signal
        });

        if (!response.ok) {
          throw new Error(`Error: ${response.statusText}`);
        }
        const data = await response.json() as AvailableDataDetailedResult[] | false;
        if (data) {
          setBikeparksWithData(bikeparks.filter(bp => data.map(d => d.locationID).includes(bp.StallingsID||"")));
          setErrorState(""); // Clear error on success
        } else {
          // API returned false - this is expected for unsupported report types
          // Don't set error, just use all bikeparks
          setBikeparksWithData(bikeparks);
          setErrorState("");
        }
      } catch (error) {
        if (error instanceof Error && error.name !== 'AbortError') {
          console.error(error);
          setErrorState("Unable to fetch list of bikeparks with data");
          setBikeparksWithData([]);
        }
      } finally {
        if (!abortController.signal.aborted) {
          // setLoading(false);
        }
      }
    };

    fetchBikeparksWithData();

    return () => {
      abortController.abort();
    };
  }, [filterState?.reportType, bikeparks.length]);

  const profile = session?.user?.securityProfile as VSUserSecurityProfile | undefined;
  const selectedGemeenteID = session?.user?.activeContactId || "";

  useEffect(() => {
    // Do API call to get gemeente inffo based on selectedGemeenteID
    const fetchGemeenteInfo = async () => {
      const response = await fetch(`/api/contacts?ID=${selectedGemeenteID}`);
      const data = await response.json();
      setGemeenteInfo(data);
    };
    fetchGemeenteInfo();
  }, [selectedGemeenteID]);

  const renderReportParams = (params: ReportParams) => {
    const formatValue = (value: any) => {
      if (Array.isArray(value)) {
        return value.join(', ');
      }
      return value instanceof Date ? value.toLocaleString() : value;
    };

    return (
      <table className="min-w-full border-collapse border border-gray-300">
        <thead>
          <tr>
            <th className="border border-gray-300 px-4 py-2">Parameter</th>
            <th className="border border-gray-300 px-4 py-2">Value</th>
          </tr>
        </thead>
        <tbody>
          {Object.entries(params).map(([key, value]) => (
            <tr key={key}>
              <td className="border border-gray-300 px-4 py-2">{key}</td>
              <td className="border border-gray-300 px-4 py-2">{formatValue(value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  const handleReportTypeClick = (reportId: ReportType) => {
    if (reportId === selectedReportType) {
      return;
    }
    setSelectedReportType(reportId);
    
    // Navigate to the new URL path
    const chartTypeSlug = REVERSE_CHART_TYPE_MAP[reportId];
    if (chartTypeSlug) {
      router.push(`/beheer/report/${chartTypeSlug}`);
    }
  };

  return (
    <div className="noPrint w-full h-full flex flex-col container mx-auto" id="ReportComponent">
      <div className="flex w-full mb-4">
        {selectedReportType && (
          <div className="flex-1 mb-4">
            <h2 className="text-2xl font-semibold text-gray-900">
              {selectedReportTitle}
            </h2>
          </div>
        )}
        <div className="flex-1 flex-none flex justify-end">
          <PeriodSelector
            firstDate={firstDate}
            lastDate={lastDate}
            currentState={filterState}
            onSelectPreset={handlePresetSelect}
            onCustomRangeChange={handleCustomRangeChange}
          />
        </div>
      </div>
      <div className="flex w-full flex-1 flex-col">
        <div className="flex-1 overflow-y-auto p-2 md:p-6 bg-white rounded-md border border-gray-300">
          <div className="flex flex-col space-y-2 h-full">

            {/* <div className="flex-none">
              <GemeenteFilter
                gemeenten={gemeenten}
                users={users}
                onFilterChange={setFilteredGemeenten}
                showStallingenFilter={true}
                showUsersFilter={true}
                showExploitantenFilter={true}
              />
            </div> */}

            <div className="flex-none">
              <ReportsFilterComponent
                ref={filterComponentRef}
                showAbonnementenRapporten={showAbonnementenRapporten}
                firstDate={firstDate}
                lastDate={lastDate}
                bikeparks={bikeparksWithData}
                activeReportType={selectedReportType}
                onStateChange={handleFilterChange}
              />
            </div>

            <div className="flex-none flex flex-col space-y-2">
              {errorState && <div style={{ color: "red", fontWeight: "bold" }}>{errorState}</div>}
              {warningState && <div style={{ color: "orange", fontWeight: "bold" }}>{warningState}</div>}
            </div>

            {loading ? (
              <div className="flex-grow flex items-center justify-center">
                <div className="spinner">
                  <div className="loader"></div>
                </div>
              </div>
            ) : (
              <div className="flex-grow min-h-0">
                {reportData ? (
                  <div className="w-full h-full">
                    {(() => {
                        const shouldRenderAbsoluteBezettingChart = (() => {
                          if (filterState?.reportType !== "absolute_bezetting") return true;
                          const { startDT, endDT } = getStartEndDT(filterState, firstDate, lastDate);
                          const DAY_IN_MS = 24 * 60 * 60 * 1000;
                          const isValidPeriod = endDT >= startDT;
                          const periodInDays = isValidPeriod ? Math.floor((endDT.getTime() - startDT.getTime()) / DAY_IN_MS) + 1 : 0;
                          const MAX_DAYS_ABSOLUTE_BEZETTING = 14;
                          return isValidPeriod && periodInDays <= MAX_DAYS_ABSOLUTE_BEZETTING;
                        })();

                        if (!shouldRenderAbsoluteBezettingChart) {
                          return (
                            <div className="p-4 border border-orange-300 bg-orange-50 text-orange-800 rounded">
                              De absolute bezetting grafiek wordt alleen getoond als je maximaal 14 dagen selecteert.
                            </div>
                          );
                        }

                        const filteredSeries = reportData.series
                          .filter(series => {
                            // For bezetting reports, filter by selectedSeries
                            if (filterState?.reportType === 'bezetting' && filterState?.selectedSeries) {
                              return filterState.selectedSeries.includes(series.name as SeriesLabel);
                            }
                            return true;
                          })
                          .map(series => ({
                            ...series,
                            color: getColorForSeriesName(
                              getColorKeyForSeries(series.name, filterState?.reportType)
                            )
                          }));

                        return (
                          <Chart
                            type={filterState?.reportType === 'stallingsduur' ? 'bar' : "line"}
                            options={{
                              chart: {
                                id: `line-chart-${Math.random()}`,//https://github.com/apexcharts/react-apexcharts/issues/349#issuecomment-966461811
                                stacked: false,
                                zoom: {
                                  enabled: false
                                },
                                // toolbar: {
                                //   show: true
                                // },
                                toolbar: {
                                  show: true,
                                  tools: {
                                    download: '<img src="https://dashboarddeelmobiliteit.nl/components/StatsPage/icon-download-to-csv.svg" class="ico-download" width="20">',
                                    selection: true,
                                    zoom: true,
                                    zoomin: true,
                                    zoomout: true,
                                    pan: true,
                                    reset: '<img src="/static/icons/reset.png" width="20">',
                                    customIcons: []
                                  },
                                  export: {
                                    csv: {
                                      filename: `${moment().format('YYYY-MM-DD HH_mm')} VeiligStallen ${filterState?.reportType}`,
                                    },
                                    svg: {
                                      filename: `${moment().format('YYYY-MM-DD HH_mm')} VeiligStallen ${filterState?.reportType}`,
                                    },
                                    png: {
                                      filename: `${moment().format('YYYY-MM-DD HH_mm')} VeiligStallen ${filterState?.reportType}`,
                                    }
                                  },
                                  autoSelected: 'zoom'
                                },
                                animations: {
                                  enabled: false
                                }
                              },
                              colors: reportData.series.map(series =>
                                getColorForSeriesName(
                                  getColorKeyForSeries(series.name, filterState?.reportType)
                                )
                              ),
                              responsive: [{
                                breakpoint: undefined,
                                options: {},
                              }],
                              dataLabels: {
                                enabled: false,
                              },
                              stroke: {
                                curve: 'straight',
                                width: 3,
                                dashArray: 0
                              },
                              title: {
                                text: reportData.title || '',
                                align: 'left'
                              },
                              grid: {
                                borderColor: '#e7e7e7',
                                row: {
                                  colors: ['#f3f3f3', 'transparent'],
                                  opacity: 0.5
                                },
                              },
                              markers: {
                                size: 4,
                                hover: {
                                  size: 6
                                }
                              },
                              // Cap x-axis ticks to keep labels readable, especially for long ranges.
                              // (ApexCharts will skip labels; data is unaffected.)
                              xaxis: {
                                // Responsive-ish tick cap based on viewport width. This runs only on the client.
                                ...(typeof window !== 'undefined'
                                  ? {
                                      tickAmount: Math.min(
                                        reportData.options?.xaxis?.categories?.length ?? 0,
                                        window.innerWidth < 768 ? 10 : 30
                                      )
                                    }
                                  : {}),
                                // Respect backend-provided axis type/categories; fallback to categories.
                                ...(reportData.options?.xaxis || { type: 'categories' }),
                                labels: {
                                  // In category mode the label is already the category string; don't treat it as a timestamp.
                                  formatter:
                                    (reportData.options?.xaxis?.type === 'category' ||
                                      reportData.options?.xaxis?.type === 'categories')
                                      ? ((v: string | number) => String(v))
                                      : getXAxisFormatter(filterState?.reportGrouping || 'per_hour'),
                                  datetimeUTC: false,
                                  rotate: -45,
                                  trim: true,
                                  hideOverlappingLabels: true
                                },
                                title: {
                                  text: reportData.options?.xaxis?.title?.text || 'Time',
                                  align: 'left'
                                }
                              },
                              yaxis: reportData.options?.yaxis || {
                                title: {
                                  text: 'Aantal afgeronde transacties'
                                },
                              },
                              legend: {
                                position: 'top',
                                horizontalAlign: 'center',
                                floating: false,
                                // offsetY: 25,
                              },
                              tooltip: {
                                enabled: true,
                                shared: filteredSeries.length <= 5,
                                intersect: filteredSeries.length > 5,
                                followCursor: true,
                                x: {
                                  // Note: ApexCharts can pass the category *index* as `value` in category mode.
                                  // Map index -> label using the known categories to keep tooltip titles correct.
                                  formatter: (value: string | number, opts?: any) => {
                                    const cats = reportData.options?.xaxis?.categories ?? [];
                                      const idx = opts?.dataPointIndex ?? opts?.index;
                                      if (typeof idx === 'number' && cats[idx] !== undefined) {
                                        return String(cats[idx]);
                                      }
                                      if (typeof value === 'number' && cats[value] !== undefined) {
                                        return String(cats[value]);
                                      }
                                    return getTooltipFormatter(filterState?.reportGrouping || 'per_hour')(value, opts);
                                  }
                                },
                                // y: {
                                //   formatter: (value: number) => value.toFixed(2)
                                // }
                              }
                            }}
                            series={filteredSeries}
                          />
                        );
                      })()}
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-full">
                    Geen data beschikbaar
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ReportComponent;