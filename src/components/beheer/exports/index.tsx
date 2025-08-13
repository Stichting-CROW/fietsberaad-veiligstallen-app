import React, { useState, useEffect } from "react";
import { type ReportBikepark, type ReportType, getAvailableReports } from "../reports/ReportsFilter";
import { type AvailableDataDetailedResult } from "~/backend/services/reports/availableData";
import ExportSectionReport from "./ExportSectionReport";
import ExportSectionRawData from "./ExportSectionRawData";
import moment from "moment";

export type MonthData = {
  year: number;
  month: number;
}

export type BikeparkData = {
  bikeparkID: string;
  bikeparkTitle: string;
  monthsWithData: MonthData[];
}

export interface ReportComponentProps {
  gemeenteID: string | undefined;
  gemeenteName: string | undefined;
  firstDate: Date;
  lastDate: Date;
  bikeparks: ReportBikepark[];
}

export const buttonbase = "px-2 py-1 bg-white border border-gray-300 rounded hover:bg-gray-200 transition-colors duration-150 text-xs font-medium text-gray-700 flex items-center ml-1";
export const libase="text-base font-medium text-gray-800 mb-2 flex flex-row"

export const convertToBikeparkData = (bikeparks: ReportBikepark[], data: AvailableDataDetailedResult[]): BikeparkData[] => {
  // change this to map/reduce
  const bikeparkData: BikeparkData[] = [];
  data.forEach(d => {
      const [yearstr, monthstr]  = d.yearmonth.split("-");
      if(!yearstr || !monthstr) {
          console.error("ExportComponent: no year or month: ", d);
          return;
      }

      const year = parseInt(yearstr);
      const month = parseInt(monthstr);

      let bikepark = bikeparkData.find(bp => bp.bikeparkID === d.locationID);
      if(!bikepark) {
          const info = bikeparks.find(bp => bp.StallingsID === d.locationID);
          bikepark = {
              bikeparkID: d.locationID, 
              bikeparkTitle: info?.Title || "unknown",
              monthsWithData: []
          }
          bikeparkData.push(bikepark);
      }
      
      if(bikepark && year && month) {
          if(!bikepark.monthsWithData.find(md => md.year === year && md.month === month)) { 
              bikepark.monthsWithData.push({year, month});
          }
      }
  });

  return bikeparkData;
}


const ExportComponent: React.FC<ReportComponentProps> = ({
  gemeenteID,
  gemeenteName,
  firstDate,
  lastDate,
  bikeparks,
}) => {
  const [reportType, setReportType] = useState<ReportType>("transacties_voltooid");

  const renderReportTypeSelect = () => {
    const availableReports = getAvailableReports(false);
    return (
      <div className="form-group row flex flex-row">
        <label htmlFor="report" className="col-xs-3 col-sm-2 col-form-label font-bold mr-5">Export</label>
        <div className="col-sm-10 col-md-6 border-2 border-gray-300 rounded-md">
          <select
            className="form-control"
            name="report"
            id="report"
            value={reportType}
            onChange={(e) => setReportType(e.target.value as ReportType)}
            required
          > {availableReports.map((report) => (
            <option key={report.id} value={report.id}>{report.title}</option>
          ))}
          </select>
        </div>
      </div>
    )
  }

  if(undefined === gemeenteID || gemeenteID === "") {
    return <div className="text-center text-gray-500 mt-10 text-xl" >Selecteer een gemeente om rapportages te bekijken</div>;
  }

  return (
      <div className="noPrint w-full" id="ExportComponent">
        <div className="flex flex-col space-y-4 p-4">
          {renderReportTypeSelect()}

          <div className="max-w-7xl">
              <ExportSectionReport reportType={reportType} bikeparks={bikeparks} gemeenteID={gemeenteID} gemeenteName={gemeenteName || ""} firstDate={firstDate} lastDate={lastDate} /> 
              <ExportSectionRawData bikeparks={bikeparks} gemeenteID={gemeenteID} gemeenteName={gemeenteName || ""} firstDate={firstDate} lastDate={lastDate} />
          </div>
      </div>
    </div>
  );
};

export default ExportComponent;
