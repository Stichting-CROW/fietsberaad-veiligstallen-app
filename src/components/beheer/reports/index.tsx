import React, { useState, useEffect } from "react";
import ReportsFilterComponent, { ReportParams, ReportBikepark, ReportState } from "./ReportsFilter";
import { ReportData } from "~/backend/services/reports/ReportFunctions";
import { AvailableDataDetailedResult } from "~/backend/services/reports/availableData";
import { getStartEndDT } from "./ReportsDateFunctions";
import CollapsibleContent from '~/components/beheer/common/CollapsibleContent';
import GemeenteFilter from '~/components/beheer/common/GemeenteFilter';
import moment from 'moment';

import type { VSUserSecurityProfile } from "~/types/";
import type { VSContactGemeente } from "~/types/contacts";
import type { VSUserWithRoles } from "~/types/users";

import Chart from './Chart';
import { AppState } from "~/store/store";
import { useSelector } from "react-redux";
import { useSession } from "next-auth/react";
import { prisma } from "~/server/db";
import BikeparkDataSourceSelect, { BikeparkWithDataSource } from './BikeparkDataSourceSelect';
import { getXAxisTitle } from "~/backend/services/reports/ReportAxisFunctions";

interface ReportComponentProps {
  showAbonnementenRapporten: boolean;
  firstDate: Date;
  lastDate: Date;
  bikeparks: ReportBikepark[];
  error?: string;
  warning?: string;
  // gemeenten: VSContactGemeenteInLijst[];
  // users: VSUserWithRolesNew[];
}

const ReportComponent: React.FC<ReportComponentProps> = ({
  showAbonnementenRapporten,
  firstDate,
  lastDate,
  bikeparks,
  error,
  warning,
  // gemeenten,
  // users,
}) => {
  const { data: session } = useSession()

  const [errorState, setErrorState] = useState(error);
  const [warningState, setWarningState] = useState(warning);

  const [gemeenteInfo, setGemeenteInfo] = useState<VSContactGemeente | undefined>(undefined);

  const [reportData, setReportData] = useState<ReportData | undefined>(undefined);

  const [bikeparksWithData, setBikeparksWithData] = useState<ReportBikepark[]>([]);
  const [loading, setLoading] = useState(false);

  const [filterState, setFilterState] = useState<ReportState | undefined>(undefined);

  const handleFilterChange = (newState: ReportState) => {
    setFilterState(newState);
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

        let apiEndpoint: string = `/api/reports/${filterState.reportType}`;
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
        const apiEndpoint = "/api/database/availableDataPerBikepark";
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
          setBikeparksWithData(bikeparks.filter(bp => data.map(d => d.locationID).includes(bp.StallingsID)));
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

  return (
    <div className="noPrint w-full h-full" id="ReportComponent">
      <div className="flex flex-col space-y-4 p-4 h-full">

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
          <CollapsibleContent buttonText="Filteropties">
            <ReportsFilterComponent
              showAbonnementenRapporten={showAbonnementenRapporten}
              firstDate={firstDate}
              lastDate={lastDate}
              bikeparks={bikeparksWithData}
              onStateChange={handleFilterChange}
            />
          </CollapsibleContent>
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
                      type: 'datetime',
                      labels: {
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
                      position: 'right',
                      horizontalAlign: 'center',
                      floating: false,
                      offsetY: 25,
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
  );
};

export default ReportComponent;
