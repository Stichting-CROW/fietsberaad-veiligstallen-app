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

/**
 * Get bikepark (fietsenstalling) by external ID (StallingsID, e.g. "3500_001").
 */
export async function getBikeparkByExternalID(bikeparkID: string): Promise<BikeparkInfo | null> {
  const row = await prisma.fietsenstallingen.findFirst({
    where: { StallingsID: bikeparkID },
    select: {
      ID: true,
      StallingsID: true,
      SiteID: true,
      ExploitantID: true,
      BerekentStallingskosten: true,
      Type: true,
      hasUniSectionPrices: true,
      hasUniBikeTypePrices: true,
      contacts_fietsenstallingen_SiteIDTocontacts: {
        select: { ZipID: true },
      },
    },
  });
  if (!row) return null;
  return {
    ID: row.ID,
    StallingsID: row.StallingsID,
    SiteID: row.SiteID,
    ZipID: row.contacts_fietsenstallingen_SiteIDTocontacts?.ZipID ?? null,
    ExploitantID: row.ExploitantID,
    BerekentStallingskosten: row.BerekentStallingskosten,
    Type: row.Type,
    hasUniSectionPrices: row.hasUniSectionPrices,
    hasUniBikeTypePrices: row.hasUniBikeTypePrices,
  };
}

/**
 * Get section by external ID (e.g. "3500_001_1").
 * externalId on fietsenstalling_sectie matches sectionID from wachtrij.
 */
export async function getBikeparkSectionByExternalID(
  sectionID: string
): Promise<SectionInfo | null> {
  const row = await prisma.fietsenstalling_sectie.findFirst({
    where: { externalId: sectionID },
    select: {
      sectieId: true,
      externalId: true,
      fietsenstallingsId: true,
      isKluis: true,
    },
  });
  if (!row) return null;
  return {
    sectieId: row.sectieId,
    externalId: row.externalId,
    fietsenstallingsId: row.fietsenstallingsId,
    isKluis: row.isKluis,
  };
}

/**
 * Get place (locker) by ID and section. Validates the place belongs to the section.
 * For fietskluizen: placeID from wachtrij_transacties maps to fietsenstalling_plek.id.
 * status % 10 gives statuscode: 0=vrij, 1=bezet, 2=abonnement, 3=gereserveerd, 4=buiten werking.
 */
export async function getPlace(
  placeID: number,
  sectionExternalId: string
): Promise<PlaceInfo | null> {
  const section = await getBikeparkSectionByExternalID(sectionExternalId);
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
