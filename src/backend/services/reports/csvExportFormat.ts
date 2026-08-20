/**
 * Formatting primitives that reproduce the ColdFusion CSV output of
 * broncode/cflib/nl/fietsberaad/util/reports_csv.cfc and its
 * DataTypeConvert.cfc helper byte for byte.
 */

export const CSV_DELIMITER = ";";
export const CSV_ENCLOSED = '"';
export const CRLF = "\r\n";
export const LF = "\n";

/**
 * ColdFusion writes the reports in two different ways, which produces two
 * different line ending patterns:
 *
 * - "append": StructToCsv(action="append") trims the CSV fragment and hands it
 *   to fileWriteLine(), which terminates every write with the platform line
 *   separator (LF on the Linux report server). The header therefore keeps the
 *   CRLF that QueryToCsv added, while every row is terminated with LF.
 * - "write": the fragments are concatenated untrimmed (so all CRLF are kept)
 *   and written with cffile action="write", which appends one extra newline.
 */
export type CfCsvWriteMode = "append" | "write";

/** CF dayOfWeekAsString(): 1 = Sunday, locale "Dutch (Standard)". */
export const DUTCH_WEEKDAY_NAMES = [
  "",
  "zondag",
  "maandag",
  "dinsdag",
  "woensdag",
  "donderdag",
  "vrijdag",
  "zaterdag",
] as const;

/** CF monthAsString(): 1 = januari, locale "Dutch (Standard)". */
export const DUTCH_MONTH_NAMES = [
  "",
  "januari",
  "februari",
  "maart",
  "april",
  "mei",
  "juni",
  "juli",
  "augustus",
  "september",
  "oktober",
  "november",
  "december",
] as const;

export const dutchWeekdayName = (dayOfWeek: number | null | undefined): string =>
  dayOfWeek && dayOfWeek >= 1 && dayOfWeek <= 7 ? DUTCH_WEEKDAY_NAMES[dayOfWeek]! : "";

export const dutchMonthName = (month: number | null | undefined): string =>
  month && month >= 1 && month <= 12 ? DUTCH_MONTH_NAMES[month]! : "";

/** CF numberFormat(value, "00"). */
export const twoDigits = (value: number | null | undefined): string => {
  if (value === null || value === undefined) return "";
  return String(value).padStart(2, "0");
};

/**
 * CF LSNumberFormat(value, "0.0", "Dutch (Standard)") for a ratio expressed as
 * numerator/denominator * 100. Uses exact integer arithmetic plus the HALF_EVEN
 * rounding of java.text.DecimalFormat, so values exactly halfway between two
 * tenths round to the even tenth just like ColdFusion does.
 */
export const dutchPercentageOneDecimal = (
  numerator: number | null | undefined,
  denominator: number | null | undefined
): string => {
  if (
    numerator === null ||
    numerator === undefined ||
    denominator === null ||
    denominator === undefined ||
    denominator === 0
  ) {
    // CF divides by zero / by an empty string, catches the error and falls back to "0,0"
    return "0,0";
  }

  const scaled = numerator * 1000; // (numerator / denominator) * 100 * 10
  const truncated = Math.floor(scaled / denominator);
  const remainder = scaled - truncated * denominator;

  let tenths = truncated;
  if (remainder * 2 > denominator) {
    tenths = truncated + 1;
  } else if (remainder * 2 === denominator && truncated % 2 !== 0) {
    tenths = truncated + 1;
  }

  const whole = Math.trunc(tenths / 10);
  const decimal = Math.abs(tenths % 10);
  return `${whole},${decimal}`;
};

/**
 * QueryToCsv() writes empty values for null and stringifies everything else.
 * Note that it does not escape embedded quotes; that behaviour is kept so the
 * output stays identical to the ColdFusion files.
 */
export const cfCsvCell = (value: unknown): string => {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "true" : "false";
  return String(value);
};

export const cfCsvRow = (values: unknown[]): string =>
  values
    .map((value) => `${CSV_ENCLOSED}${cfCsvCell(value)}${CSV_ENCLOSED}`)
    .join(CSV_DELIMITER);

/**
 * Assembles a complete CSV file. Headers are trimmed like QueryToCsv does with
 * its headerList, and empty result sets produce an empty file because
 * ColdFusion skips writing entirely when the query returned no records.
 */
export const assembleCfCsv = (
  headers: string[],
  rows: unknown[][],
  mode: CfCsvWriteMode
): string => {
  if (rows.length === 0) return "";

  const headerLine = cfCsvRow(headers.map((header) => header.trim()));
  const rowTerminator = mode === "append" ? LF : CRLF;

  let csv = headerLine + CRLF;
  for (const row of rows) {
    csv += cfCsvRow(row) + rowTerminator;
  }
  if (mode === "write") {
    csv += LF;
  }

  return csv;
};
