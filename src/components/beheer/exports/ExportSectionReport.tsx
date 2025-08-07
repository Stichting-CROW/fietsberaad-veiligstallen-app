import React, { useState, useEffect } from "react";
import { type ReportType } from "../reports/ReportsFilter";
import { type AvailableDataDetailedResult } from "~/backend/services/reports/availableData";
import type { ReportComponentProps, BikeparkData } from "./index";
import { convertToBikeparkData, buttonbase, libase } from "./index";
import moment from "moment";

interface ExportSectionReportProps extends ReportComponentProps {
  reportType: ReportType
}

const ExportSectionReportComponent: React.FC<ExportSectionReportProps> = ({
  reportType,
  gemeenteID,
  gemeenteName,
  firstDate,
  lastDate,
  bikeparks,
}) => {
  const [errorState, setErrorState] = useState("");

  const [bikeparkData, setBikeparkData] = useState<BikeparkData[]>([]);

  const [loading, setLoading] = useState(false);
  const [counter, setCounter] = useState(0);

  // section report is not always available in the coldfusion fms: bezetting does not have a report
  const showSectionReport = reportType === "transacties_voltooid" || reportType === "stallingsduur";

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
              endDT: lastDate
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
  }, [reportType, bikeparks, counter]);

  const downloadYearForReportType = (reportType: ReportType, gemeenteID: string, gemeenteName: string, bikepark: BikeparkData | undefined, year: number) => {
    const timestamp = moment().format("YYYYMMDDHHmmss"); 
    const link = document.createElement("a");
    link.target = "_blank";

    // const test = ""

    switch(reportType) {
      case "transacties_voltooid":
        if(undefined === bikepark) {
          link.href = `https://static.veiligstallen.nl/reports/${gemeenteID}/${year}_alle_stallingen_transacties.csv?${timestamp}`;
          link.download = `${gemeenteName}-alle-stallingen-${year}.xlsx`;
        } else {
          link.href = `https://static.veiligstallen.nl/reports/${gemeenteID}/${bikepark.bikeparkID}/${year}_${bikepark.bikeparkTitle.replace(/ /g, "_")}_transacties.csv?${timestamp}`;
          link.download = `${gemeenteName}-${bikepark.bikeparkTitle}-${year}.xlsx`;
        }
        break;
      case "stallingsduur":
        if(undefined === bikepark) {
          link.href = `https://static.veiligstallen.nl/reports/${gemeenteID}/${year}_stallingsduur.csv?${timestamp}`;
          link.download = `${gemeenteName}-alle-stallingen-stallingsduur-${year}.xlsx`;
        } else {
          link.href = `https://static.veiligstallen.nl/reports/${gemeenteID}/${bikepark.bikeparkID}/${year}_${bikepark.bikeparkTitle.replace(/ /g, "_")}_stallingsduur.csv?${timestamp}`;
          link.download = `${gemeenteName}-${bikepark.bikeparkTitle}-stallingsduur-${year}.xlsx`;
        }
        break;
      case "bezetting":
        if(undefined === bikepark) {
          link.href = `https://static.veiligstallen.nl/reports/${gemeenteID}/${year}_bezetting.csv?${timestamp}`;
          link.download = `${gemeenteName}-alle-stallingen-bezetting-${year}.xlsx`;
        } else {
          link.href = `https://static.veiligstallen.nl/reports/${gemeenteID}/${bikepark.bikeparkID}/${year}_${bikepark.bikeparkTitle.replace(/ /g, "_")}_bezetting.csv?${timestamp}`;
          link.download = `${gemeenteName}-${bikepark.bikeparkTitle}-bezetting-${year}.xlsx`;
        }
        break;
    }

    // console.log("old: ", test);
    // console.log("new: ", link.href);
    // console.log("same: ", test === link.href);

    link.click();
  }

  const renderYearButtonsForReportType = (reportType: ReportType, gemeenteID: string | undefined, bikepark: BikeparkData | undefined, years: number[]) => {
      if(undefined === gemeenteID) {
        return null;
      }

      return (
          <div className="year-buttons flex gap-1 flex-wrap">
              {years.map(year => (
                  <button 
                      key={year} 
                      className={`year-button ${buttonbase}`}
                      onClick={() => {downloadYearForReportType(reportType, gemeenteID, gemeenteName || "", bikepark, year)}}
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
    exportTitle = "Bezettingsdata";
    showAllBikeparks = false;
    showIndividualBikeparks = false;
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
      <ul className="bikepark-list">
          {/* All parkings combined entry */}
          {showAllBikeparks && allYears.length > 0 && (
              <li className="bikepark-item">
                  <div className={`bikepark-name ${libase}`}>
                      Alle stallingen: {renderYearButtonsForReportType(reportType, gemeenteID, undefined, allYears)}
                  </div>
                  
              </li>
          )}
          
          {/* Individual parking entries */}
          {showIndividualBikeparks && bikeparkData
              .filter(bp => bp.monthsWithData.length > 0)
              .map(bp => {
                  const bikepark = bikeparks.find(park => park.id === bp.bikeparkID);
                  return (
                      <li key={bp.bikeparkID} className="bikepark-item">
                          <div className={`bikepark-name ${libase}`}>
                          {bp.bikeparkTitle}: {renderYearButtonsForReportType(reportType, gemeenteID, bp, getYearsWithDataForBikepark(bp))}
                          </div>
                      </li>
                  );
              })
          }
      </ul>
    </>
  );
};

export default ExportSectionReportComponent;
