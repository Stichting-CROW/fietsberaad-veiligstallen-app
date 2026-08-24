/**
 * Single source of truth for the CSV export filenames. The on-disk cache and
 * the Content-Disposition header both call this so the two can never drift.
 */

export type CsvExportType = "transacties" | "ruwedata" | "stallingsduur" | "bezetting";

export const CSV_EXPORT_TYPES: readonly CsvExportType[] = [
  "transacties",
  "ruwedata",
  "stallingsduur",
  "bezetting",
] as const;

export type CsvExportFilenameParams = {
  jaar: number;
  stallingsID?: string;
  maand?: number;
};

export const resolveCsvExportFilename = (
  exportType: CsvExportType,
  { jaar, stallingsID, maand }: CsvExportFilenameParams
): string => {
  switch (exportType) {
    case "transacties":
      return stallingsID
        ? `${jaar}_${stallingsID}_transacties.csv`
        : `${jaar}_alle_stallingen_transacties.csv`;
    case "ruwedata": {
      if (maand === undefined) {
        return stallingsID
          ? `${jaar}_${stallingsID}_ruwedata.csv`
          : `${jaar}_alle_stallingen_ruwedata.csv`;
      }
      const maandPadded = String(maand).padStart(2, "0");
      return stallingsID
        ? `${jaar}_${maandPadded}_${stallingsID}_ruwedata.csv`
        : `${jaar}_${maandPadded}_alle_stallingen_ruwedata.csv`;
    }
    case "stallingsduur":
      return `${jaar}_stallingsduur.csv`;
    case "bezetting":
      return `${jaar}_${stallingsID}_bezetting.csv`;
  }
};

/**
 * First instant after the reported range, used for the cache settling check.
 * Yearly exports close on 1 January of the next year; monthly ruwedata
 * exports close on the first day of the next month.
 */
export const getCsvExportPeriodEnd = (
  exportType: CsvExportType,
  { jaar, maand }: CsvExportFilenameParams
): string => {
  if (exportType === "ruwedata") {
    if (maand === undefined) {
      return `${jaar + 1}-01-01 00:00:00`;
    }
    if (!Number.isInteger(maand) || maand < 1 || maand > 12) {
      throw new Error(`Ongeldige maand voor periodend: ${maand}`);
    }
    if (maand === 12) return `${jaar + 1}-01-01 00:00:00`;
    return `${jaar}-${String(maand + 1).padStart(2, "0")}-01 00:00:00`;
  }

  return `${jaar + 1}-01-01 00:00:00`;
};
