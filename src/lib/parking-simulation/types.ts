/**
 * Parking Management simulation types.
 * All simulation code lives in parking-simulation folders (see plan).
 */

/** Bike type ID for "unknown" category when stalling has no explicit capacity per type */
export const UNKNOWN_BIKETYPE_ID = 0;

/** Default simulation start date when not set (2025-01-01 00:00:00 UTC) */
export const DEFAULT_SIMULATION_START_DATE = new Date("2025-01-01T00:00:00.000Z");

export type BicyclePoolConfig = Array<{ biketypeID: number; count: number }>;

export type CostCalculationMode = "veiligstallen" | "simulation";
export type TariffTimespanUnit = "hours" | "minutes";

export type BicycleIdMethod = "barcode" | "rfid";
export type PassIdMethod = "barcode" | "rfid";

export interface BicycleIdentifier {
  method: BicycleIdMethod;
  value: string;
}

export interface PassIdentifier {
  method: PassIdMethod;
  value: string;
  idtype?: number;
}

export interface TariffRate {
  timespan: number;
  cost: number;
}

export interface SimulationSession {
  id: string;
  siteID: string;
  apiUsername?: string | null;
  apiPasswordEncrypted?: string | null;
  baseUrl?: string | null;
  defaultBiketypeID: number;
  defaultIdtype: number;
  simulationTimeOffsetSeconds?: number;
}

export interface SimulationBicycle {
  id: string;
  simulationConfigId: string;
  barcode: string;
  RFIDBike?: string | null;
  passID?: string | null;
  RFID?: string | null;
  biketypeID: number;
  status: string;
}

export interface SimulationOccupation {
  id: string;
  bicycleId: string;
  locationid: string;
  sectionid: string;
  placeId?: number | null;
  checkedIn: boolean;
  bicycle?: SimulationBicycle;
}
