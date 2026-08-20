import React, { useState, useEffect } from "react";
import { type AvailableDataDetailedResult } from "~/backend/services/reports/availableData";

import type { BikeparkData, ReportComponentProps } from "./index";
import { convertToBikeparkData, downloadCsvExport, buttonbase } from "./index";

const ExportComponent: React.FC<ReportComponentProps> = ({
  gemeenteID,
  firstDate,
  lastDate,
  bikeparks,
}) => {
  const [errorState, setErrorState] = useState("");
  const [downloadError, setDownloadError] = useState("");
  const [bikeparkData, setBikeparkData] = useState<BikeparkData[]>([]);

  const reportType = "transacties_voltooid";

  const [loading, setLoading] = useState(false);

  const validBikeparkIDs = bikeparks.map(bp => bp.StallingsID).filter(bp => bp !== "" && bp !== undefined && bp !== null);

  useEffect(() => {
      const fetchReportData = async () => {    
          setLoading(true);

          if(validBikeparkIDs.length !== bikeparks.length) {
            console.warn("ExportSectionReportComponent: some bikeparks have no StallingsID. These are not shown.");
          }

          try {
            const apiEndpoint = "/api/protected/database/availableDataDetailed";

            const response = await fetch(apiEndpoint, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                reportType,
                bikeparkIDs: validBikeparkIDs,
                startDT: firstDate,
                endDT: lastDate,
                // Ruwe Data CSV comes from live transacties_view; hide months
                // that only still exist in the archive.
                ...(gemeenteID ? { gemeenteID, useLiveTransacties: true } : {}),
              }),
            });
    
            if (!response.ok) {
              throw new Error(`Error: ${response.statusText}`);
            }
            const data = await response.json() as AvailableDataDetailedResult[] | false;
            if(data) {
              setBikeparkData(convertToBikeparkData(bikeparks, data));
              setErrorState("");
          } else {
              setErrorState("Unable to fetch report data");
            }
          } catch (error) {
            console.error(error);
            setErrorState("Unable to fetch report data");
          } finally {
            setLoading(false);
          }
        };
    
        fetchReportData();
  }, [reportType, bikeparks, gemeenteID, firstDate, lastDate]);

  const getMonthName = (month: number): string => {
      return new Date(2000, month - 1, 1).toLocaleString('nl-NL', { month: 'short' });
  };

  const renderRawTransactionDataMonthButtons = (gemeenteID: string | undefined, bikepark: BikeparkData | undefined, year: number, availableMonths: number[]) => {
    if(undefined === gemeenteID) {
      return null;
    }

    return (
          <div className="month-buttons flex gap-1 ml-2">
              {availableMonths.map(month => (
                  <button
                      key={`${year}-${month}`}
                      className={`month-button ${buttonbase}`}                               
                      onClick={() => {void downloadRawTransactionsForMonth(gemeenteID, bikepark, year, month)}}
                  >
                      {getMonthName(month)}
                  </button>
              ))}
          </div>
      );
  };

  const downloadRawTransactionsForMonth = async (gemeenteID: string, bikepark: BikeparkData | undefined, year: number, month: number) => {
    if(undefined === bikepark) {
      // deze export is alleen per stalling beschikbaar
      return;
    }

    try {
      setDownloadError("");
      await downloadCsvExport({
        exportType: "ruwedata",
        gemeenteID,
        stallingsID: bikepark.bikeparkID,
        jaar: year,
        maand: month,
      });
    } catch (error) {
      console.error(error);
      setDownloadError(error instanceof Error ? error.message : "Download mislukt");
    }
  }

  if(undefined === gemeenteID || gemeenteID === "") {
    return null;
  }

  if(errorState) {
    return (
      <div className="flex flex-col space-y-2">
        {errorState && <div style={{ color: "red", fontWeight: "bold" }}>{errorState}</div>}
      </div>
    )
  }

  if(loading) {
    return <div className="spinner" style={{ margin: "auto" }}>
      <div className="loader"></div>
    </div>;
  }

  return (
    <>
      <h2 className="text-lg font-semibold text-gray-900">
          Alle Transacties (ruwe data)
      </h2>
      {downloadError && <div style={{ color: "red", fontWeight: "bold" }}>{downloadError}</div>}
      {bikeparkData.every(bp => bp.monthsWithData.length === 0) && (
        <div className="text-left text-gray-500 mt-2 mb-4">
          Geen ruwe transactiedata meer beschikbaar voor export (data is gearchiveerd).
        </div>
      )}
      <ul className="bikepark-list">
          {bikeparkData
              .filter(bp => bp.monthsWithData.length > 0)
              .sort((a, b) => a.bikeparkTitle.localeCompare(b.bikeparkTitle))
              .map(bp => {
                  const yearGroups = bp.monthsWithData.reduce((acc, { year, month }) => {
                      if (!acc[year]) acc[year] = [];
                      if(!acc[year].find(m => m === month)) {
                          acc[year].push(month);
                      }
                      return acc;
                  }, {} as Record<number, number[]>);

                  return (
                      <li key={bp.bikeparkID} className="bikepark-item">
                          <div className="bikepark-name text-base font-medium text-gray-800">
                              {bp.bikeparkTitle}
                          </div>
                          <ul className="year-list">
                              {Object.entries(yearGroups)
                                  .sort(([yearA], [yearB]) => Number(yearA) - Number(yearB))
                                  .map(([year, months]) => (
                                      <li key={year} className="year-item flex items-center">
                                          <div
                                              className="my-2 px-2 bg-white hover:bg-gray-50 transition-colors duration-150 
                                                        text-sm text-gray-700 font-bold flex items-baseline"
                                              onClick={() => {/* TODO: Handle year download */}}
                                          >
                                              {year}
                                              {renderRawTransactionDataMonthButtons(gemeenteID, bp, Number(year), months.sort((a, b) => a - b))}
                                              </div>
                                      </li>
                                  ))}
                          </ul>
                      </li>
                  );
              })}
        </ul>
    </>);
};

export default ExportComponent;
