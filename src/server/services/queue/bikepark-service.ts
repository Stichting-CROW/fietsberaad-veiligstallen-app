/**
 * Bikepark lookups for queue processor.
 * Mirrors ColdFusion BikeparkServiceImpl: getBikeparkByExternalID, getBikeparkSectionByExternalID, getPlace.
 */

import { prisma } from "~/server/db";

export type BikeparkInfo = {
  ID: string;
  StallingsID: string | null;
  SiteID: string | null;
  ZipID: string | null;
  ExploitantID: string | null;
  /** contacts.DayBeginsAt for the stalling's organisation. Null when the contact has none. */
  dayBeginsAt: Date | null;
  BerekentStallingskosten: boolean;
  Type: string | null;
  hasUniSectionPrices: boolean;
  hasUniBikeTypePrices: boolean;
};

export type SectionInfo = {
  sectieId: number;
  externalId: string | null;
  fietsenstallingsId: string | null;
  isKluis: boolean;
};

export type PlaceInfo = {
  id: bigint;
  sectie_id: bigint | null;
  status: number | null;
};

/** Known stallings for one queue batch. A null value means the id was looked up and is missing. */
export type BikeparkBatch = Map<string, BikeparkInfo | null>;
/** Known sections for one queue batch. A null value means the id was looked up and is missing. */
export type SectionBatch = Map<string, SectionInfo | null>;

const bikeparkSelect = {
  ID: true,
  StallingsID: true,
  SiteID: true,
  ExploitantID: true,
  BerekentStallingskosten: true,
  Type: true,
  hasUniSectionPrices: true,
  hasUniBikeTypePrices: true,
  contacts_fietsenstallingen_SiteIDTocontacts: {
    select: { ZipID: true, DayBeginsAt: true },
  },
} as const;

const sectionSelect = {
  sectieId: true,
  externalId: true,
  fietsenstallingsId: true,
  isKluis: true,
} as const;

type BikeparkRow = {
  ID: string;
  StallingsID: string | null;
  SiteID: string | null;
  ExploitantID: string | null;
  BerekentStallingskosten: boolean;
  Type: string | null;
  hasUniSectionPrices: boolean;
  hasUniBikeTypePrices: boolean;
  contacts_fietsenstallingen_SiteIDTocontacts: { ZipID: string | null; DayBeginsAt: Date } | null;
};

function mapBikepark(row: BikeparkRow): BikeparkInfo {
  return {
    ID: row.ID,
    StallingsID: row.StallingsID,
    SiteID: row.SiteID,
    ZipID: row.contacts_fietsenstallingen_SiteIDTocontacts?.ZipID ?? null,
    ExploitantID: row.ExploitantID,
    dayBeginsAt: row.contacts_fietsenstallingen_SiteIDTocontacts?.DayBeginsAt ?? null,
    BerekentStallingskosten: row.BerekentStallingskosten,
    Type: row.Type,
    hasUniSectionPrices: row.hasUniSectionPrices,
    hasUniBikeTypePrices: row.hasUniBikeTypePrices,
  };
}

function uniqueIds(ids: Iterable<string>): string[] {
  return [...new Set([...ids].map((id) => id.trim()).filter((id) => id.length > 0))];
}

/**
 * One query for every distinct StallingsID in a queue batch.
 * Ids that do not exist are stored as null so the row loop does not look them up again.
 */
export async function loadBikeparksByStallingsID(ids: Iterable<string>): Promise<BikeparkBatch> {
  const unique = uniqueIds(ids);
  const map: BikeparkBatch = new Map();
  if (unique.length === 0) return map;
  const rows = await prisma.fietsenstallingen.findMany({
    where: { StallingsID: { in: unique } },
    select: bikeparkSelect,
  });
  for (const row of rows) {
    if (row.StallingsID) map.set(row.StallingsID, mapBikepark(row));
  }
  for (const id of unique) {
    if (!map.has(id)) map.set(id, null);
  }
  return map;
}

/** One query for every distinct section external id in a queue batch. */
export async function loadSectionsByExternalID(ids: Iterable<string>): Promise<SectionBatch> {
  const unique = uniqueIds(ids);
  const map: SectionBatch = new Map();
  if (unique.length === 0) return map;
  const rows = await prisma.fietsenstalling_sectie.findMany({
    where: { externalId: { in: unique } },
    select: sectionSelect,
  });
  for (const row of rows) {
    if (row.externalId) map.set(row.externalId, row);
  }
  for (const id of unique) {
    if (!map.has(id)) map.set(id, null);
  }
  return map;
}

/**
 * Get bikepark (fietsenstalling) by external ID (StallingsID, e.g. "3500_001").
 * Pass a batch map from loadBikeparksByStallingsID to skip the query.
 */
export async function getBikeparkByExternalID(
  bikeparkID: string,
  prefetched?: BikeparkBatch
): Promise<BikeparkInfo | null> {
  if (prefetched?.has(bikeparkID)) return prefetched.get(bikeparkID) ?? null;
  const row = await prisma.fietsenstallingen.findFirst({
    where: { StallingsID: bikeparkID },
    select: bikeparkSelect,
  });
  if (!row) return null;
  return mapBikepark(row);
}

/**
 * Get section by external ID (e.g. "3500_001_1").
 * externalId on fietsenstalling_sectie matches sectionID from wachtrij.
 */
export async function getBikeparkSectionByExternalID(
  sectionID: string,
  prefetched?: SectionBatch
): Promise<SectionInfo | null> {
  if (prefetched?.has(sectionID)) return prefetched.get(sectionID) ?? null;
  const row = await prisma.fietsenstalling_sectie.findFirst({
    where: { externalId: sectionID },
    select: sectionSelect,
  });
  if (!row) return null;
  return row;
}

/**
 * Get place (locker) by ID and section. Validates the place belongs to the section.
 * For fietskluizen: placeID from wachtrij_transacties maps to fietsenstalling_plek.id.
 * status % 10 gives statuscode: 0=vrij, 1=bezet, 2=abonnement, 3=gereserveerd, 4=buiten werking.
 */
export async function getPlace(
  placeID: number,
  sectionExternalId: string,
  sections?: SectionBatch
): Promise<PlaceInfo | null> {
  const section = await getBikeparkSectionByExternalID(sectionExternalId, sections);
  if (!section) return null;

  const place = await prisma.fietsenstalling_plek.findFirst({
    where: {
      id: BigInt(placeID),
      sectie_id: BigInt(section.sectieId),
    },
    select: {
      id: true,
      sectie_id: true,
      status: true,
    },
  });
  if (!place) return null;
  return {
    id: place.id,
    sectie_id: place.sectie_id,
    status: place.status,
  };
}

/** One query for every place/section pair a managed batch needs to validate. */
export async function findPlacesInSections(
  pairs: { placeId: number; sectieId: number }[]
): Promise<Set<string>> {
  const unique = new Map<string, { placeId: number; sectieId: number }>();
  for (const pair of pairs) {
    unique.set(`${pair.placeId}:${pair.sectieId}`, pair);
  }
  const wanted = [...unique.values()];
  if (wanted.length === 0) return new Set();
  const rows = await prisma.fietsenstalling_plek.findMany({
    where: {
      OR: wanted.map((pair) => ({
        id: BigInt(pair.placeId),
        sectie_id: BigInt(pair.sectieId),
      })),
    },
    select: { id: true, sectie_id: true },
  });
  return new Set(rows.map((row) => `${row.id}:${row.sectie_id ?? ""}`));
}
