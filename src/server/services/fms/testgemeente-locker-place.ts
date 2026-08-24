import { prisma } from "~/server/db";

export const TESTGEMEENTE_LOCKER_BIKEPARK_ID = "9933_003";
export const TESTGEMEENTE_LOCKER_SECTION_ID = "9933_003_1";

/** Tier B scenarios that need at least one fietsenstalling_plek on 9933_003_1. */
/** No Tier B scenario requires a configured locker plek (v4 locker writes are 410). */
export const LOCKER_API_SCENARIO_IDS = new Set<string>();

export type TestgemeenteLockerPlaceStatus = {
  bikeparkID: string;
  sectionID: string;
  stallingExists: boolean;
  sectionExists: boolean;
  plekCount: number;
  placeID: string;
  ready: boolean;
};

export function lockerPlaceConfigurationHint(): string {
  return [
    `Stalling ${TESTGEMEENTE_LOCKER_BIKEPARK_ID} (fietskluizen) moet sectie ${TESTGEMEENTE_LOCKER_SECTION_ID} hebben met minimaal één kluisplek (fietsenstalling_plek).`,
    "Voeg kluisplekken toe via stallingbeheer, of maak de testgemeente opnieuw aan (parkeersimulatie → testgemeente aanmaken; nieuwe testgemeentes krijgen plekken automatisch).",
  ].join(" ");
}

export function describeLockerPlaceProblem(status: TestgemeenteLockerPlaceStatus): string {
  if (!status.stallingExists) {
    return `Fietskluizen-stalling ${status.bikeparkID} ontbreekt in de database. Maak de testgemeente aan via parkeersimulatie (inclusief stallings 9933_001 t/m 9933_007). ${lockerPlaceConfigurationHint()}`;
  }
  if (!status.sectionExists) {
    return `Sectie ${status.sectionID} ontbreekt op stalling ${status.bikeparkID}. ${lockerPlaceConfigurationHint()}`;
  }
  if (status.plekCount === 0) {
    return `Geen kluisplekken (fietsenstalling_plek) op sectie ${status.sectionID}. ${lockerPlaceConfigurationHint()}`;
  }
  return lockerPlaceConfigurationHint();
}

export function lockerPlaceMissingError(status?: TestgemeenteLockerPlaceStatus): string {
  if (status) return describeLockerPlaceProblem(status);
  return `Geen kluisplek gevonden voor ${TESTGEMEENTE_LOCKER_BIKEPARK_ID}. ${lockerPlaceConfigurationHint()}`;
}

/**
 * Inspect locker configuration on the testgemeente fietskluizen stalling.
 * Does not create or modify data.
 */
export async function inspectTestgemeenteLockerPlace(): Promise<TestgemeenteLockerPlaceStatus> {
  const bikeparkID = TESTGEMEENTE_LOCKER_BIKEPARK_ID;
  const sectionID = TESTGEMEENTE_LOCKER_SECTION_ID;

  const stalling = await prisma.fietsenstallingen.findFirst({
    where: { StallingsID: bikeparkID },
    select: { ID: true },
  });

  const sectie = await prisma.fietsenstalling_sectie.findFirst({
    where: { externalId: sectionID },
    select: { sectieId: true },
  });

  if (!sectie) {
    return {
      bikeparkID,
      sectionID,
      stallingExists: !!stalling,
      sectionExists: false,
      plekCount: 0,
      placeID: "",
      ready: false,
    };
  }

  const plekCount = await prisma.fietsenstalling_plek.count({
    where: { sectie_id: BigInt(sectie.sectieId) },
  });

  const place = await prisma.fietsenstalling_plek.findFirst({
    where: { sectie_id: BigInt(sectie.sectieId) },
    select: { id: true },
    orderBy: { id: "asc" },
  });

  return {
    bikeparkID,
    sectionID,
    stallingExists: !!stalling,
    sectionExists: true,
    plekCount,
    placeID: place ? String(place.id) : "",
    ready: plekCount > 0 && !!place,
  };
}

/** Resolve the first locker plek on testgemeente fietskluizen (read-only). */
export async function resolveTestgemeenteLockerPlace(): Promise<{
  bikeparkID: string;
  sectionID: string;
  placeID: string;
}> {
  const status = await inspectTestgemeenteLockerPlace();
  return {
    bikeparkID: status.bikeparkID,
    sectionID: status.sectionID,
    placeID: status.placeID,
  };
}

export function assertLockerPlaceConfigured(
  placeID: string,
  status?: TestgemeenteLockerPlaceStatus
): void {
  if (!placeID) {
    throw new Error(lockerPlaceMissingError(status));
  }
}
