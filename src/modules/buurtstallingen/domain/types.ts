export const OCCUPATION_STATUSES = ["FREE", "RESERVED", "PROPOSED", "OCCUPIED", "CANCELLED"] as const;
export type OccupationStatus = (typeof OCCUPATION_STATUSES)[number];

export const QUALIFICATIONS = ["NONE", "UNDER", "ABOVE"] as const;
export type Qualification = (typeof QUALIFICATIONS)[number];

/** New reservation or proposal, set by the Java engine. */
export const EXPIRY_RESERVATION_DAYS = 16;
/** Citizen or operator accepts a proposal. ColdFusion sends this clock. */
export const EXPIRY_ACCEPT_DAYS = 14;
/** Key return after cancelling an occupied place. */
export const EXPIRY_CANCEL_DAYS = 7;
export const WAITINGLIST_MAIL_MONTHS = 6;

export const ALLOWED_ACTIONS: Record<OccupationStatus, OccupationStatus[]> = {
  FREE: ["OCCUPIED", "RESERVED", "PROPOSED"],
  OCCUPIED: ["CANCELLED", "FREE"],
  RESERVED: ["OCCUPIED", "FREE"],
  PROPOSED: ["RESERVED", "FREE"],
  CANCELLED: ["FREE"],
};

/** FMS `fietstypen.ID`. The slot tables store this value minus one. */
export const BIKE_TYPES: Record<number, string> = {
  1: "Normale fiets",
  2: "Bromfiets",
  3: "Speciale fiets",
  4: "Elektrische fiets",
  5: "Motor",
  6: "Aangepaste fiets",
  7: "Bakfiets",
  8: "Tandem",
  9: "Racefiets",
  10: "Kinderfiets",
  11: "Brede fiets",
  12: "Takel",
  13: "Fatbike",
};

/** The column counts from 0. FMS ids, and this module, count from 1. */
export function bikeTypeFromStored(stored: number | null | undefined): number | null {
  if (stored === null || stored === undefined) return null;
  return stored + 1;
}

export function bikeTypeToStored(bikeTypeId: number): number {
  return bikeTypeId - 1;
}

export type Place = {
  id: string;
  title: string;
  bikeTypeIds: number[];
  occupation: Occupation | null;
};

export type Occupation = {
  id: string;
  accountId: string;
  status: Exclude<OccupationStatus, "FREE">;
  expiryDate: Date | null;
  bikeTypeId: number;
  placeId: string;
};

export type Section = {
  id: string;
  title: string;
  qualification: Qualification;
  places: Place[];
};

export type WaitingListEntry = {
  id: string;
  accountId: string;
  qualification: Qualification;
  bikeTypeIds: number[];
  sequenceNumber: number;
  creationDate: Date;
  mailingDate: Date;
};

export class DomainError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "DomainError";
  }
}
