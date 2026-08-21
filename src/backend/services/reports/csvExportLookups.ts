import { prisma } from "~/server/db";

/**
 * Database lookups used by the CSV report exports, mirroring the helper
 * functions of broncode/cflib/nl/fietsberaad/util/reports_csv.cfc.
 */
export class CsvExportLookups {
  private stallingsNamen = new Map<string, string>();
  private sectieNamen = new Map<string, string>();
  private bikeTypeNamen = new Map<string, string>();

  /** CF getStallingsNaam(): returns "?" when the stalling does not exist. */
  async getStallingsNaam(stallingsID: string | null | undefined): Promise<string> {
    if (!stallingsID) return "?";

    const cached = this.stallingsNamen.get(stallingsID);
    if (cached !== undefined) return cached;

    const rows = await prisma.$queryRaw<{ Title: string | null }[]>`
      SELECT Title FROM fietsenstallingen WHERE StallingsID = ${stallingsID} LIMIT 1
    `;

    const naam = rows.length === 0 ? "?" : rows[0]!.Title ?? "";
    this.stallingsNamen.set(stallingsID, naam);
    return naam;
  }

  async getSectieNaam(sectieID: string | null | undefined): Promise<string> {
    if (!sectieID) return "";

    const cached = this.sectieNamen.get(sectieID);
    if (cached !== undefined) return cached;

    const rows = await prisma.$queryRaw<{ titel: string | null }[]>`
      SELECT titel FROM fietsenstalling_sectie WHERE externalId = ${sectieID} LIMIT 1
    `;

    const naam = rows.length === 0 ? "" : rows[0]!.titel ?? "";
    this.sectieNamen.set(sectieID, naam);
    return naam;
  }

  async getBikeTypeName(bikeTypeID: number | null | undefined): Promise<string> {
    if (bikeTypeID === null || bikeTypeID === undefined) return "";

    const key = String(bikeTypeID);
    const cached = this.bikeTypeNamen.get(key);
    if (cached !== undefined) return cached;

    const rows = await prisma.$queryRaw<{ Name: string | null }[]>`
      SELECT Name FROM fietstypen WHERE ID = ${bikeTypeID} LIMIT 1
    `;

    const naam = rows.length === 0 ? "" : rows[0]!.Name ?? "";
    this.bikeTypeNamen.set(key, naam);
    return naam;
  }
}

export type GemeenteExportContext = {
  gemeenteID: string;
  zipID: string;
  /**
   * Minutes after midnight at which the reporting day starts for this gemeente
   * (contacts.DayBeginsAt), as CF getTimeShiftInMinutes() computes it.
   */
  timeShiftInMinutes: number;
};

export class GemeenteNotFoundError extends Error {
  constructor(gemeenteID: string) {
    super(`Gemeente ${gemeenteID} niet gevonden`);
    this.name = "GemeenteNotFoundError";
  }
}

/**
 * Resolves the zipID and day-start offset in one query. The offset is computed
 * in SQL so the TIME column never has to pass through a JS Date, which would
 * introduce timezone drift.
 */
export const getGemeenteExportContext = async (
  gemeenteID: string
): Promise<GemeenteExportContext> => {
  const rows = await prisma.$queryRaw<
    { ZipID: string | null; timeShiftInMinutes: number | bigint | null }[]
  >`
    SELECT ZipID, (TIME_TO_SEC(DayBeginsAt) DIV 60) AS timeShiftInMinutes
    FROM contacts
    WHERE ID = ${gemeenteID}
    LIMIT 1
  `;

  const row = rows[0];
  if (!row) {
    throw new GemeenteNotFoundError(gemeenteID);
  }

  return {
    gemeenteID,
    zipID: row.ZipID ?? "",
    timeShiftInMinutes: Number(row.timeShiftInMinutes ?? 0),
  };
};

/**
 * MySQL server time as `YYYY-MM-DD HH:MM:SS`. Used instead of the Node clock
 * so period-settling checks stay in sync with the database timezone (and with
 * the stallingsduur export's "quarter fully passed" filter).
 */
export const getDatabaseNow = async (): Promise<string> => {
  const rows = await prisma.$queryRaw<{ now: string }[]>`
    SELECT DATE_FORMAT(NOW(), '%Y-%m-%d %H:%i:%s') AS now
  `;
  return rows[0]?.now ?? "";
};
