import React, { useState } from "react";

import type { BikeparkData, ReportComponentProps } from "./index";
import {
  downloadCsvExport,
  buttonbase,
  csvDownloadKey,
  CsvDownloadSpinner,
} from "./index";

interface ExportSectionRawDataProps extends ReportComponentProps {
  bikeparkData: BikeparkData[];
}

const ExportSectionRawData: React.FC<ExportSectionRawDataProps> = ({
  gemeenteID,
  bikeparkData,
}) => {
  const [downloadError, setDownloadError] = useState("");
  const [downloadingKey, setDownloadingKey] = useState<string | null>(null);

  const getMonthName = (month: number): string => {
      return new Date(2000, month - 1, 1).toLocaleString('nl-NL', { month: 'short' });
  };

  const renderRawTransactionDataMonthButtons = (gemeenteID: string | undefined, bikepark: BikeparkData | undefined, year: number, availableMonths: number[]) => {
    if(undefined === gemeenteID) {
      return null;
    }

    return (
          <div className="month-buttons flex gap-1 ml-2">
              {availableMonths.map(month => {
                  const key = csvDownloadKey(bikepark?.bikeparkID, year, month);
                  const isDownloading = downloadingKey === key;
                  return (
                      <button
                          key={`${year}-${month}`}
                          type="button"
                          className={`month-button ${buttonbase}`}
                          disabled={downloadingKey !== null}
                          aria-busy={isDownloading}
                          onClick={() => {void downloadRawTransactionsForMonth(gemeenteID, bikepark, year, month)}}
                      >
                          {isDownloading && <CsvDownloadSpinner />}
                          {getMonthName(month)}
                      </button>
                  );
              })}
          </div>
      );
  };

  const downloadRawTransactionsForYear = async (gemeenteID: string, bikepark: BikeparkData | undefined, year: number) => {
    if(undefined === bikepark || downloadingKey !== null) {
      return;
    }

    const key = csvDownloadKey(bikepark.bikeparkID, year);
    try {
      setDownloadError("");
      setDownloadingKey(key);
      await downloadCsvExport({
        exportType: "ruwedata",
        gemeenteID,
        stallingsID: bikepark.bikeparkID,
        jaar: year,
      });
    } catch (error) {
      console.error(error);
      setDownloadError(error instanceof Error ? error.message : "Download mislukt");
    } finally {
      setDownloadingKey(null);
    }
  };

  const downloadRawTransactionsForMonth = async (gemeenteID: string, bikepark: BikeparkData | undefined, year: number, month: number) => {
    if(undefined === bikepark || downloadingKey !== null) {
      // deze export is alleen per stalling beschikbaar
      return;
    }

    const key = csvDownloadKey(bikepark.bikeparkID, year, month);
    try {
      setDownloadError("");
      setDownloadingKey(key);
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
    } finally {
      setDownloadingKey(null);
    }
  }

  if(undefined === gemeenteID || gemeenteID === "") {
    return null;
  }

  return (
    <>
      <h2 className="text-lg font-semibold text-gray-900">
          Alle transacties (ruwe data)
      </h2>
      {downloadError && <div style={{ color: "red", fontWeight: "bold" }}>{downloadError}</div>}
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
                                  .map(([year, months]) => {
                                      const yearNum = Number(year);
                                      const yearKey = csvDownloadKey(bp.bikeparkID, yearNum);
                                      const isDownloadingYear = downloadingKey === yearKey;
                                      return (
                                      <li key={year} className="year-item flex items-center">
                                          <div className="my-2 px-2 bg-white text-sm text-gray-700 font-bold flex items-baseline">
                                              <button
                                                  type="button"
                                                  className={`year-button ${buttonbase} font-bold`}
                                                  disabled={downloadingKey !== null}
                                                  aria-busy={isDownloadingYear}
                                                  title="Download volledig jaar"
                                                  onClick={() => {void downloadRawTransactionsForYear(gemeenteID, bp, yearNum)}}
                                              >
                                                  {isDownloadingYear && <CsvDownloadSpinner />}
                                                  {year}
                                              </button>
                                              {renderRawTransactionDataMonthButtons(gemeenteID, bp, yearNum, months.sort((a, b) => a - b))}
                                              </div>
                                      </li>
                                  );
                                  })}
                          </ul>
                      </li>
                  );
              })}
        </ul>
    </>);
};

export default ExportSectionRawData;
