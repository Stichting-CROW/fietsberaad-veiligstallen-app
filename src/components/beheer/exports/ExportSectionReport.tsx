import React, { useState, useEffect } from "react";
import { type ReportType } from "../reports/ReportsFilter";
import { type AvailableDataDetailedResult } from "~/backend/services/reports/availableData";
import type { ReportComponentProps, BikeparkData, CsvExportType } from "./index";
import { convertToBikeparkData, downloadCsvExport, buttonbase, libase } from "./index";

interface ExportSectionReportProps extends ReportComponentProps {
  reportType: ReportType
}

const ExportSectionReportComponent: React.FC<ExportSectionReportProps> = ({
  reportType,
  gemeenteID,
  firstDate,
  lastDate,
  bikeparks,
}) => {
  const [errorState, setErrorState] = useState("");
  const [downloadError, setDownloadError] = useState("");

  const [bikeparkData, setBikeparkData] = useState<BikeparkData[]>([]);

  const [loading, setLoading] = useState(false);
  const [counter, setCounter] = useState(0);

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
  
  useEffect(() => {
      const fetchReportData = async () => {
        setLoading(true);

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
              // Afgeronde Transacties CSV comes from live transacties_view; hide
              // years that only still exist in the archive.
              ...(reportType === "transacties_voltooid" && gemeenteID
                ? { gemeenteID, useLiveTransacties: true }
                : {}),
            }),
          });
  
          if (!response.ok) {
            throw new Error(`Error: ${response.statusText}`);
          }
          const data = await response.json() as AvailableDataDetailedResult[] | false;
          if(data) {
            setBikeparkData(convertToBikeparkData(bikeparks,data));
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
  
      if(showSectionReport) {
        fetchReportData();
      }
  }, [reportType, bikeparks, counter, gemeenteID, firstDate, lastDate]);

  const downloadYear = async (gemeenteID: string, bikepark: BikeparkData | undefined, year: number) => {
    if (csvExportType === undefined) return;

    try {
      setDownloadError("");
      await downloadCsvExport({
        exportType: csvExportType,
        gemeenteID,
        stallingsID: bikepark?.bikeparkID,
        jaar: year,
      });
    } catch (error) {
      console.error(error);
      setDownloadError(error instanceof Error ? error.message : "Download mislukt");
    }
  };

  const renderYearButtons = (gemeenteID: string | undefined, bikepark: BikeparkData | undefined, years: number[]) => {
      if(undefined === gemeenteID) {
        return null;
      }

      return (
          <div className="year-buttons flex gap-1 flex-wrap">
              {years.map(year => (
                  <button 
                      key={year} 
                      className={`year-button ${buttonbase}`}
                      onClick={() => {void downloadYear(gemeenteID, bikepark, year)}}
                  >
                      {year}
                  </button>
              ))}
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
    exportTitle = "Aantal Afgeronde Transacties";
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
      {reportType === "transacties_voltooid" && allYears.length === 0 && (
        <div className="text-left text-gray-500 mt-2 mb-4">
          Geen afgeronde transacties meer beschikbaar voor export (data is gearchiveerd).
        </div>
      )}
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
