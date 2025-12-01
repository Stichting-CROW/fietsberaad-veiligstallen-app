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
import { getXAxisFormatter } from "~/backend/services/reports/ReportAxisFunctions";

interface ReportComponentProps {
  showAbonnementenRapporten: boolean;
  firstDate: Date;
  lastDate: Date;
  bikeparks: ReportBikepark[];
  error?: string;
  warning?: string;
  onDataLoaded?: (hasReportData: boolean) => void;
}

const ReportComponent: React.FC<ReportComponentProps> = ({
  showAbonnementenRapporten,
  firstDate,
  lastDate,
  bikeparks,
  error,
  warning,
  onDataLoaded,
}) => {
  const { data: session } = useSession()

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
  const [selectedReportType, setSelectedReportType] = useState<ReportType | undefined>(undefined);
  const filterComponentRef = React.useRef<ReportsFilterHandle>(null);

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

      setLoading(true);
      try {
        const { startDT, endDT } = getStartEndDT(filterState, firstDate, lastDate);

        const apiEndpoint = `/api/reports/${filterState.reportType}`;
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
              bikeparkIDs: filterState.selectedBikeparkIDs,
              bikeparkDataSources: filterState.bikeparkDataSources,
              startDT,
              endDT,
              fillups: filterState.fillups,
              dayBeginsAt: gemeenteInfo?.DayBeginsAt
            }
          }),
          signal: abortController.signal
        });

        if (!response.ok) {
          throw new Error(`Error: ${response.statusText}`);
        }
        const data = await response.json();
        setReportData(data);
        setErrorState("");
        
        const hasReportData = data.series.some((series: any) => series.data.length > 0);
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

    // Get start date and end date from filterState
    const { startDT, endDT } = getStartEndDT(filterState, firstDate, lastDate);

    const abortController = new AbortController();

    const fetchBikeparksWithData = async () => {
      if (undefined === filterState) {
        return;
      }

      // Only fetch bikeparks with data if the report type is 'bezetting'
      // if (filterState.reportType !== 'bezetting') {
      //   return;
      // }

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
        } else {
          setErrorState("Unable to fetch list of bikeparks with data");
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

  const showReportParams = false; // used for debugging / testing

  const handleReportTypeClick = (reportId: ReportType) => {
    if (reportId === selectedReportType) {
      return;
    }
    setSelectedReportType(reportId);
  };

  return (
    <div className="noPrint w-full h-full flex flex-col" id="ReportComponent">
      <div className="flex w-full mb-4">
        {selectedReportType && (
          <div className="flex-1 mb-4">
            <h2 className="text-2xl font-semibold text-gray-900">
              {availableReports.find(r => r.id === selectedReportType)?.title || selectedReportType}
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
      <div className="flex w-full flex-1 flex-col md:flex-row">
        <aside className="hidden md:flex md:w-64 md:flex-col md:gap-4 md:md:mr-6 md:py-6">
          <nav className="flex flex-col gap-1">
            {availableReports.map((report) => {
              const isActive = report.id === selectedReportType;
              return (
                <button
                  key={report.id}
                  type="button"
                  onClick={() => handleReportTypeClick(report.id as ReportType)}
                  className={`rounded-md px-4 py-2 text-left transition focus:outline-none focus:ring-2 focus:ring-blue-200 ${
                    isActive
                      ? "bg-blue-50 text-blue-700 font-semibold"
                      : "text-gray-600 hover:bg-gray-100"
                  }`}
                >
                  {report.title}
                </button>
              );
            })}
          </nav>
        </aside>
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
                <Chart
                  type={filterState?.reportType === 'stallingsduur' ? 'bar' : "line"}
                  options={{
                    chart: {
                      id: `line-chart-${Math.random()}`,//https://github.com/apexcharts/react-apexcharts/issues/349#issuecomment-966461811
                      stacked: filterState?.reportType === 'stallingsduur' ? true : false,
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
                    },
                    xaxis: {
                      type: 'categories',
                      labels: {
                        formatter: getXAxisFormatter(filterState?.reportGrouping || 'per_hour'),
                        datetimeUTC: false
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
                      shared: true,
                      intersect: false,
                      followCursor: true,
                      // x: {
                      //   format: 'dd MMM yyyy HH:mm'
                      // },
                      // y: {
                      //   formatter: (value: number) => value.toFixed(2)
                      // }
                    }
                  }}
                  series={reportData.series}
                />
              </div>
            ) : (
              <div className="flex items-center justify-center h-full">
                No data available yet
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