import React, { useState, useEffect, useRef } from "react";
import { type ReportType } from "../reports/ReportsFilter";
import { type AvailableDataDetailedResult } from "~/backend/services/reports/availableData";
import type { ReportComponentProps, BikeparkData, CsvExportType } from "./index";
import {
  convertToBikeparkData,
  downloadCsvExport,
  buttonbase,
  libase,
  csvDownloadKey,
  CsvDownloadSpinner,
} from "./index";

interface ExportSectionReportProps extends ReportComponentProps {
  reportType: ReportType;
  bikeparkData: BikeparkData[];
}

const ExportSectionReportComponent: React.FC<ExportSectionReportProps> = ({
  reportType,
  gemeenteID,
  firstDate,
  lastDate,
  bikeparks,
  bikeparkData: sharedBikeparkData,
}) => {
  const [errorState, setErrorState] = useState("");
  const [downloadError, setDownloadError] = useState("");
  const [downloadingKey, setDownloadingKey] = useState<string | null>(null);

  const [reportBikeparkData, setReportBikeparkData] = useState<BikeparkData[]>([]);
  const [loading, setLoading] = useState(false);

  const usesSharedData = reportType === "transacties_voltooid";
  const bikeparkData = usesSharedData ? sharedBikeparkData : reportBikeparkData;

  const csvExportType: CsvExportType | undefined =
    reportType === "transacties_voltooid"
      ? "transacties"
      : reportType === "stallingsduur"
        ? "stallingsduur"
        : reportType === "bezetting"
          ? "bezetting"
          : undefined;

  const showSectionReport = csvExportType !== undefined;

  const validBikeparkIDs = bikeparks.map(bp => bp.StallingsID).filter(bp => bp !== "" && bp !== undefined && bp !== null);
  const bikeparkIDsKey = validBikeparkIDs.join(",");
  const startDT = firstDate.getTime();
  const endDT = lastDate.getTime();
  const fetchKey = [reportType, bikeparkIDsKey, String(startDT), String(endDT)].join("|");
  const loadedFetchKeyRef = useRef<string | null>(null);

  useEffect(() => {
      if (usesSharedData) {
        return;
      }

      const fetchReportData = async () => {
        const showLoadingUI = loadedFetchKeyRef.current !== fetchKey;
        if (showLoadingUI) {
          setLoading(true);
        }

        try {
          if(validBikeparkIDs.length !== bikeparks.length) {
            console.warn("ExportSectionReportComponent: some bikeparks have no StallingsID. These are not shown.");
          }

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
            }),
          });
  
          if (!response.ok) {
            throw new Error(`Error: ${response.statusText}`);
          }
          const data = await response.json() as AvailableDataDetailedResult[] | false;
          if(data) {
            setReportBikeparkData(convertToBikeparkData(bikeparks,data));
            setErrorState("");
            loadedFetchKeyRef.current = fetchKey;
        } else {
            setErrorState("Unable to fetch report data");
          }
        } catch (error) {
          console.error(error);
          setErrorState("Unable to fetch report data");
        } finally {
          if (showLoadingUI) {
            setLoading(false);
          }
        }
      };
  
      if(showSectionReport) {
        fetchReportData();
      }
  }, [reportType, bikeparkIDsKey, startDT, endDT, showSectionReport, fetchKey, usesSharedData]);

  const downloadYear = async (gemeenteID: string, bikepark: BikeparkData | undefined, year: number) => {
    if (csvExportType === undefined || downloadingKey !== null) return;

    const key = csvDownloadKey(bikepark?.bikeparkID, year);
    try {
      setDownloadError("");
      setDownloadingKey(key);
      await downloadCsvExport({
        exportType: csvExportType,
        gemeenteID,
        stallingsID: bikepark?.bikeparkID,
        jaar: year,
      });
    } catch (error) {
      console.error(error);
      setDownloadError(error instanceof Error ? error.message : "Download mislukt");
    } finally {
      setDownloadingKey(null);
    }
  };

  const renderYearButtons = (gemeenteID: string | undefined, bikepark: BikeparkData | undefined, years: number[]) => {
      if(undefined === gemeenteID) {
        return null;
      }

      return (
          <div className="year-buttons flex gap-1 flex-wrap">
              {years.map(year => {
                  const key = csvDownloadKey(bikepark?.bikeparkID, year);
                  const isDownloading = downloadingKey === key;
                  return (
                      <button 
                          key={year} 
                          type="button"
                          className={`year-button ${buttonbase}`}
                          disabled={downloadingKey !== null}
                          aria-busy={isDownloading}
                          onClick={() => {void downloadYear(gemeenteID, bikepark, year)}}
                      >
                          {isDownloading && <CsvDownloadSpinner />}
                          {year}
                      </button>
                  );
              })}
          </div>
      );
  };

  // Get all unique years across all bikeparks
  const getYearsWithData = (): number[] => Array.from(
      new Set(
          bikeparkData.flatMap(bp => bp.monthsWithData.map(md => md.year))
      )
  ).sort((a, b) => a - b); // Sort ascending

  const getYearsWithDataForBikepark = (bp: BikeparkData): number[] => {
      const yearsSet = new Set<number>();
      bp.monthsWithData.forEach(md => yearsSet.add(md.year));
      return Array.from(yearsSet).sort((a, b) => a - b);
  }
  const allYears = getYearsWithData();

let exportTitle = "";
let showAllBikeparks = false;
let showIndividualBikeparks = false;
switch(reportType) {
  case "transacties_voltooid":
    exportTitle = "Aantal afgeronde transacties";
    showAllBikeparks = true;
    showIndividualBikeparks = true;
    break;
  case "stallingsduur":
    exportTitle = "Stallingsduur";
    showAllBikeparks = true;
    showIndividualBikeparks = false;
    break;
  case "bezetting":
    exportTitle = "Procentuele bezetting";
    showAllBikeparks = false;
    showIndividualBikeparks = true;
    break;
  default:
    exportTitle = "";
    showIndividualBikeparks = false;
    return <div className="text-center text-gray-500 mt-10 text-xl" >Export van dit type rapportage wordt nog niet ondersteund</div>;
}

if(!showSectionReport) {
  return (
    <>
      <h2 className="text-lg font-semibold text-gray-900">{ exportTitle }</h2>
      <div className="text-left text-gray-500 text-xl mt-2 mb-4" >Er is alleen export van ruwe data beschikbaar voor dit rapporttype</div>
    </>
  );
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

if(!showAllBikeparks && !showIndividualBikeparks) {
  return null;
}

return (
  <>
    <h2 className="text-lg font-semibold text-gray-900">{ exportTitle }</h2>
      {downloadError && <div style={{ color: "red", fontWeight: "bold" }}>{downloadError}</div>}
      <ul className="bikepark-list">
          {/* All parkings combined entry */}
          {showAllBikeparks && allYears.length > 0 && (
              <li className="bikepark-item">
                  <div className={`bikepark-name ${libase}`}>
                      Alle stallingen: {renderYearButtons(gemeenteID, undefined, allYears)}
                  </div>
                  
              </li>
          )}
          
          {/* Individual parking entries */}
          {showIndividualBikeparks && bikeparkData
              .filter(bp => bp.monthsWithData.length > 0)
              .map(bp => (
                  <li key={bp.bikeparkID} className="bikepark-item">
                      <div className={`bikepark-name ${libase}`}>
                      {bp.bikeparkTitle}: {renderYearButtons(gemeenteID, bp, getYearsWithDataForBikepark(bp))}
                      </div>
                  </li>
              ))
          }
      </ul>
    </>
  );
};

export default ExportSectionReportComponent;
