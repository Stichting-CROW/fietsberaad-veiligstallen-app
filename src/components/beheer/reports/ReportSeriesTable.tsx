import React from "react";
import { type ReportSeriesData } from "~/backend/services/reports/ReportFunctions";
import { type ReportCategories } from "./ReportsFilter";

const formatRounded = (value: number) =>
  Math.round(value).toLocaleString("nl-NL");

const getRowLabelColumnTitle = (reportCategories?: ReportCategories): string => {
  switch (reportCategories) {
    case "per_section":
      return "Sectie";
    case "per_type_klant":
      return "Type klant";
    case "per_weekday":
      return "Weekdag";
    case "none":
      return "Totaal";
    default:
      return "Stalling";
  }
};

interface ReportSeriesTableProps {
  series: ReportSeriesData[];
  categories: string[];
  reportCategories?: ReportCategories;
  csvFilename?: string;
}

const CSV_DELIMITER = ",";

const csvCell = (value: string | number): string =>
  String(value).split(CSV_DELIMITER).join("");

/** Same layout as the ApexCharts toolbar CSV export. */
const buildSeriesCsv = (
  series: ReportSeriesData[],
  categories: string[],
): string => {
  const header = [
    "category",
    ...series.map((s, index) => csvCell(s.name) || `series-${index}`),
  ];
  const lines = [header.join(CSV_DELIMITER)];

  categories.forEach((label, index) => {
    const cells = [
      csvCell(label),
      ...series.map((s) => {
        const value = s.data[index];
        return value === undefined || value === null || Number.isNaN(value)
          ? ""
          : csvCell(value);
      }),
    ];
    lines.push(cells.join(CSV_DELIMITER));
  });

  return lines.join("\n");
};

const downloadSeriesCsv = (
  series: ReportSeriesData[],
  categories: string[],
  filename: string,
) => {
  const blob = new Blob([buildSeriesCsv(series, categories)], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};

/**
 * Tabular view of chart series (parity with CF reportsUtility.showTable).
 * Values are derived from the same series data as the chart; no extra API fields.
 */
const ReportSeriesTable: React.FC<ReportSeriesTableProps> = ({
  series,
  categories,
  reportCategories,
  csvFilename,
}) => {
  if (series.length === 0 || categories.length === 0) {
    return null;
  }

  const rowLabel = getRowLabelColumnTitle(reportCategories);
  const periodCount = categories.length;

  const rows = series.map((s) => {
    const periodValues = s.data.slice(0, periodCount).map((v) => Number(v) || 0);
    while (periodValues.length < periodCount) {
      periodValues.push(0);
    }
    const total = periodValues.reduce((sum, v) => sum + v, 0);
    const average =
      periodCount > 0 ? Math.trunc(total / periodCount) : 0;
    return { name: s.name, periodValues, total, average };
  });

  const columnTotals = categories.map((_, colIndex) =>
    rows.reduce((sum, row) => sum + row.periodValues[colIndex]!, 0)
  );
  const totalOfTotals = rows.reduce((sum, row) => sum + row.total, 0);
  const totalOfAverages = rows.reduce((sum, row) => sum + row.average, 0);
  const rowCount = rows.length;

  const columnAverages = columnTotals.map((t) =>
    rowCount > 0 ? Math.trunc(t / rowCount) : 0
  );
  const averageOfTotals =
    rowCount > 0 ? Math.trunc(totalOfTotals / rowCount) : 0;
  const averageOfAverages =
    rowCount > 0 ? Math.trunc(totalOfAverages / rowCount) : 0;

  const footerTotals = [...columnTotals, totalOfTotals, totalOfAverages];
  const footerAverages = [...columnAverages, averageOfTotals, averageOfAverages];

  const colSpan = 1 + periodCount + 2;

  return (
    <div>
      {csvFilename && (
        <div className="flex justify-end">
          <button
            type="button"
            title="Download CSV"
            aria-label="Download CSV"
            className="inline-flex items-center justify-center rounded p-1 hover:bg-gray-100"
            onClick={() => downloadSeriesCsv(series, categories, csvFilename)}
          >
            <img
              src="https://dashboarddeelmobiliteit.nl/components/StatsPage/icon-download-to-csv.svg"
              className="ico-download"
              width={20}
              height={20}
              alt=""
            />
          </button>
        </div>
      )}
      <div className="mt-2 overflow-x-auto overflow-y-hidden">
      <table
        width="100%"
        border={0}
        cellSpacing={1}
        cellPadding={0}
        className="TBL_data TBL_reports"
        id="results"
      >
        <thead>
          <tr>
            <th style={{ width: 50 }}>{rowLabel}</th>
            {categories.map((label, i) => (
              <th key={`${i}-${label}`}>{label}</th>
            ))}
            <th style={{ width: 50 }}>Tot.</th>
            <th style={{ width: 50 }}>Gem.</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.name}>
              <td className="_label lineRight">{row.name}</td>
              {row.periodValues.map((value, i) => (
                <td key={i} className="data numeric">
                  {formatRounded(value)}
                </td>
              ))}
              <td className="_label numeric">{formatRounded(row.total)}</td>
              <td className="_label numeric">{formatRounded(row.average)}</td>
            </tr>
          ))}
          <tr>
            <td colSpan={colSpan} className="line_single" />
          </tr>
          <tr>
            <td className="lineRight">Totaal</td>
            {footerTotals.map((value, i) => (
              <td key={i} className="numeric">
                {formatRounded(value)}
              </td>
            ))}
          </tr>
          <tr>
            <td className="lineRight">Gemiddeld</td>
            {footerAverages.map((value, i) => (
              <td key={i} className="numeric">
                {formatRounded(value)}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
      <p className="text-sm text-gray-500 mt-2">Cijfers in de tabel zijn afgerond</p>
      </div>
    </div>
  );
};

export default ReportSeriesTable;
