import type { NSLocation, NSOpeningHour } from "~/types/ns-connector";

export type NsBikeparkType = "bewaakt" | "geautomatiseerd" | "fietskluizen";

export type NsTypeMapping = {
  bikeparkType: NsBikeparkType;
  prefix: "bwt" | "aut" | "fkl";
};

const TYPE_BY_NAME: Record<string, NsTypeMapping> = {
  "Bemenste fietsenstalling": { bikeparkType: "bewaakt", prefix: "bwt" },
  "Zelfservice fietsenstalling": { bikeparkType: "geautomatiseerd", prefix: "aut" },
  Fietskluis: { bikeparkType: "fietskluizen", prefix: "fkl" },
};

export function typeMapping(facilityTypeName: string): NsTypeMapping {
  const mapped = TYPE_BY_NAME[facilityTypeName];
  if (!mapped) {
    throw new Error(`Unknown type '${facilityTypeName}' for NS locations in NsLocationConnector`);
  }
  return mapped;
}

export const STALLINGS_ID_MAX_LENGTH = 8;

/** ColdFusion `ListLast(uri, "-")`; numeric ids get `<prefix>-<id>`. */
export function externalIdFromUri(uri: string, prefix: string): string {
  let segment = uri.split("-").pop() ?? uri;
  if (/^\d+$/.test(segment)) {
    segment = `${prefix}-${segment}`;
  }
  // NS sometimes returns a compound segment (e.g. `Hbzm/Bzm001`) that exceeds StallingsID varchar(8).
  if (segment.includes("/")) {
    segment = segment.split("/").pop() ?? segment;
  }
  return segment;
}

export function validateStallingsId(stallingsId: string): void {
  if (stallingsId.length > STALLINGS_ID_MAX_LENGTH) {
    throw new Error(
      `StallingsID '${stallingsId}' is ${stallingsId.length} characters; maximum is ${STALLINGS_ID_MAX_LENGTH}`,
    );
  }
}

/** Matches stored MySQL TIME values read via `getUTCHours` in opening-hours.ts. */
export function parseNsTime(time: string): Date | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!m) return null;
  const hour = Number(m[1]);
  const minute = Number(m[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return new Date(Date.UTC(1970, 0, 1, hour, minute, 0, 0));
}

const DAY_OPEN_CLOSE: Record<number, { open: keyof OpeningHourFieldNames; close: keyof OpeningHourFieldNames }> = {
  1: { open: "Open_ma", close: "Dicht_ma" },
  2: { open: "Open_di", close: "Dicht_di" },
  3: { open: "Open_wo", close: "Dicht_wo" },
  4: { open: "Open_do", close: "Dicht_do" },
  5: { open: "Open_vr", close: "Dicht_vr" },
  6: { open: "Open_za", close: "Dicht_za" },
  7: { open: "Open_zo", close: "Dicht_zo" },
};

type OpeningHourFieldNames = {
  Open_ma: Date | null;
  Dicht_ma: Date | null;
  Open_di: Date | null;
  Dicht_di: Date | null;
  Open_wo: Date | null;
  Dicht_wo: Date | null;
  Open_do: Date | null;
  Dicht_do: Date | null;
  Open_vr: Date | null;
  Dicht_vr: Date | null;
  Open_za: Date | null;
  Dicht_za: Date | null;
  Open_zo: Date | null;
  Dicht_zo: Date | null;
};

export type NsOpeningHourUpdate = Partial<OpeningHourFieldNames>;

function readOpeningHours(location: NSLocation): NSOpeningHour[] {
  const raw = location as NSLocation & { openinghours?: NSOpeningHour[] };
  return raw.openingHours ?? raw.openinghours ?? [];
}

function readInfoImages(location: NSLocation): { link: { uri: string } }[] | undefined {
  const raw = location as NSLocation & { infoimages?: { link: { uri: string } }[] };
  return raw.infoImages ?? raw.infoimages;
}

export function buildOpeningHourFields(location: NSLocation): NsOpeningHourUpdate {
  const result: NsOpeningHourUpdate = {};
  for (const entry of readOpeningHours(location)) {
    const cols = DAY_OPEN_CLOSE[entry.dayOfWeek];
    if (!cols) continue;
    result[cols.open] = parseNsTime(entry.startTime);
    result[cols.close] = parseNsTime(entry.endTime);
  }
  return result;
}

export function resolveImageUri(location: NSLocation): string {
  const images = readInfoImages(location);
  if (images === undefined) {
    throw new Error("location.infoImages is missing");
  }
  if (images.length === 0) {
    return "";
  }
  return images[0]?.link?.uri ?? "";
}

export function buildLocationAddress(location: NSLocation): string {
  if (location.street) {
    if (location.houseNumber) {
      return `${location.street} ${location.houseNumber}`;
    }
    return location.street;
  }
  return "";
}

export type NsLocationUpdateFields = {
  Type: NsBikeparkType;
  FMS: boolean;
  Coordinaten: string;
  Title: string;
  Description: string;
  Image: string;
  Location: string;
  Postcode: string;
  Plaats: string;
  NotaVerwijssysteem: string;
  Tariefcode?: number;
  EditorModified: string;
  DateModified: Date;
} & NsOpeningHourUpdate;

export function buildLocationUpdateFields(
  location: NSLocation,
  mapping: NsTypeMapping,
  now: Date,
): NsLocationUpdateFields {
  const fields: NsLocationUpdateFields = {
    Type: mapping.bikeparkType,
    FMS: false,
    Coordinaten: `${location.lat},${location.lng}`,
    Title: location.name,
    Description: location.description ?? "",
    Image: resolveImageUri(location),
    Location: buildLocationAddress(location),
    Postcode: location.postalCode ?? "",
    Plaats: location.city ?? "",
    NotaVerwijssysteem: "",
    EditorModified: "NS-connector",
    DateModified: now,
    ...buildOpeningHourFields(location),
  };

  const regime = location.extra?.regime;
  if (regime !== undefined && regime !== null && regime !== "") {
    fields.NotaVerwijssysteem = regime;
    if (regime.toLowerCase() === "betaald") {
      fields.Tariefcode = 1;
    }
  } else {
    fields.NotaVerwijssysteem = "";
  }

  return fields;
}

export type NsLocationCreateFields = {
  ID: string;
  SiteID: string;
  ExploitantID: string | null;
  StallingsID: string;
  IsPopup: boolean;
  IsStationsstalling: boolean;
  Status: string;
  Beheerder: string;
  BeheerderContact: string;
  EditorCreated: string;
  DateCreated: Date;
  Capacity: number;
  Openingstijden: string;
  Verwijssysteem: boolean;
  VerwijssysteemOverzichten: boolean;
  BerekentStallingskosten: boolean;
  AantalReserveerbareKluizen: number;
  MaxStallingsduur: number;
  hasUniSectionPrices: boolean;
  hasUniBikeTypePrices: boolean;
};

export function buildLocationCreateFields(input: {
  id: string;
  councilId: string;
  exploitantId: string | null;
  stallingsId: string;
  now: Date;
}): NsLocationCreateFields {
  return {
    ID: input.id,
    SiteID: input.councilId,
    ExploitantID: input.exploitantId,
    StallingsID: input.stallingsId,
    IsPopup: false,
    IsStationsstalling: true,
    Status: "1",
    Beheerder: "NS Fiets",
    BeheerderContact: "www.nsfiets.nl",
    EditorCreated: "NS-connector",
    DateCreated: input.now,
    Capacity: 0,
    Openingstijden: "",
    Verwijssysteem: false,
    VerwijssysteemOverzichten: false,
    BerekentStallingskosten: false,
    AantalReserveerbareKluizen: 0,
    MaxStallingsduur: 0,
    hasUniSectionPrices: false,
    hasUniBikeTypePrices: false,
  };
}
