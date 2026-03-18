/**
 * Hardcoded constant data for the testgemeente API.
 * IDs are generated at runtime; all other fields are constant.
 */

export const TESTGEMEENTE_NAME = "testgemeente API";

export const CONTACT = {
  ItemType: "organizations",
  CompanyName: TESTGEMEENTE_NAME,
  Status: "1",
  UrlName: "testgemeente-api",
  ZipID: "9933",
  ThemeColor1: "1f99d2",
  ThemeColor2: "96c11f",
} as const;

export const MODULES = {
  default: ["veiligstallen"] as const,
} as const;

export const FMS_PERMIT = {
  Permit: "operator",
  BikeparkID: null,
} as const;

import {
  type StallingEntry,
  STALLING_DATA_BY_TARGET,
  STALLINGS,
  STALLINGS_COUNT,
} from "./stalling-data-by-target.generated";

export { STALLING_DATA_BY_TARGET, STALLINGS, STALLINGS_COUNT };

export const COORDINATES = {
  centerLat: 50.260626985807875,
  centerLon: 4.912161314228516,
  radiusMeters: 250,
  stallingsCount: STALLINGS_COUNT,
} as const;

export const STALLING_BASE = {
  Postcode: "9933",
  Plaats: TESTGEMEENTE_NAME,
  Type: "bewaakt",
  FMS: true,
  Status: "1",
} as const;

export const SECTIES = (STALLINGS as StallingEntry[]).map((s: StallingEntry) => ({
  stallingsId: s.stallingsId,
  externalId: `${s.stallingsId}_1`,
  titel: "Sectie 1",
  kleur: "23B0D9",
  Bezetting: 0,
}));
