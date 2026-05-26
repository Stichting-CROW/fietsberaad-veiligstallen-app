/**
 * ColdFusion BaseRestService `fields` query parameter (see docs/analyse-api/fms-v3-fields-query-werkelijk-gedrag.md).
 */

import type {
  CityWithLocations,
  ColdFusionLocation,
  ColdFusionSection,
  SectionSummary,
} from "./fms-v3-service";

export type FieldsParam = string | undefined;

export function parseFieldsQuery(
  raw: string | string[] | undefined
): FieldsParam {
  if (raw == null) return undefined;
  const s = Array.isArray(raw) ? raw[0] : raw;
  if (s === undefined || s === "") return undefined;
  return s;
}

export function fieldsWantsAll(fields: FieldsParam): boolean {
  return fields === "*";
}

function fieldsTokens(fields: string): string[] {
  return fields
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** ColdFusion ListFindNoCase: comma list, case-insensitive token match. */
export function fieldsHas(fields: FieldsParam, names: string[]): boolean {
  if (!fields || fields.trim() === "") return false;
  if (fieldsWantsAll(fields)) return true;
  const list = fieldsTokens(fields).map((t) => t.toLowerCase());
  return names.some((n) => list.includes(n.toLowerCase()));
}

/** ColdFusion FindNoCase on full fields string (e.g. openinghours subtree). */
export function fieldsHasSubstring(fields: FieldsParam, substr: string): boolean {
  if (!fields) return false;
  if (fieldsWantsAll(fields)) return true;
  return fields.toLowerCase().includes(substr.toLowerCase());
}

/** ColdFusion ListFind (case-sensitive list item). Used for location.services and openinghours.extrainfo. */
export function fieldsHasListFind(fields: FieldsParam, item: string): boolean {
  if (!fields) return false;
  if (fieldsWantsAll(fields)) return true;
  return fieldsTokens(fields).includes(item);
}

export function wantsLocationOccupationBundle(fields: FieldsParam): boolean {
  return fieldsHas(fields, [
    "location.free",
    "free",
    "location.occupied",
    "occupied",
    "location.occupation",
    "occupation",
  ]);
}

export function wantsLocationCapacityExplicit(fields: FieldsParam): boolean {
  return fieldsHas(fields, ["location.capacity"]);
}

export function wantsSectionOccupationBundle(fields: FieldsParam): boolean {
  return fieldsHas(fields, [
    "section.occupied",
    "occupied",
    "section.occupation",
    "occupation",
  ]);
}

/** Section list under location: CF getSections does not pass fields to getSection — strip section occupancy. */
export function filterSectionEmbeddedInLocation(
  section: ColdFusionSection
): ColdFusionSection {
  const { capacity, occupation, free, occupationsource, ...rest } =
    section as ColdFusionSection & {
      capacity?: number;
      occupation?: number;
      free?: number;
      occupationsource?: string;
    };
  void capacity;
  void occupation;
  void free;
  void occupationsource;
  return rest;
}

export function filterCity(
  city: CityWithLocations,
  fields: FieldsParam,
  depth: number
): CityWithLocations {
  const out: Record<string, unknown> = { citycode: city.citycode };
  if (fieldsHas(fields, ["city.name"]) && city.name != null) {
    out.name = city.name;
  }
  if (depth >= 1 && city.locations) {
    out.locations = city.locations.map((loc) =>
      filterLocation(loc, fields, depth - 1, { embeddedInCity: true })
    );
  }
  return out as CityWithLocations;
}

type FilterLocationOptions = {
  /** When true, omit sections unless fields requests them (citycodes list without *). */
  embeddedInCity?: boolean;
};

export function filterLocation(
  loc: ColdFusionLocation,
  fields: FieldsParam,
  depth: number,
  options: FilterLocationOptions = {}
): ColdFusionLocation {
  const out: ColdFusionLocation = { locationid: loc.locationid };

  if (fieldsHas(fields, ["location.name"]) && loc.name != null) {
    out.name = loc.name;
  }
  if (fieldsHas(fields, ["location.lat"]) && loc.lat != null) {
    out.lat = loc.lat;
  }
  if (fieldsHas(fields, ["location.long"]) && loc.long != null) {
    out.long = loc.long;
  }
  if (
    fieldsHas(fields, ["location.exploitantname"]) &&
    loc.exploitantname != null
  ) {
    out.exploitantname = loc.exploitantname;
  }
  if (
    fieldsHas(fields, ["location.exploitantcontact"]) &&
    loc.exploitantcontact != null
  ) {
    out.exploitantcontact = loc.exploitantcontact;
  }
  if (fieldsHas(fields, ["location.address"]) && loc.address != null) {
    out.address = loc.address;
  }
  if (fieldsHas(fields, ["location.postalcode"]) && loc.postalcode != null) {
    out.postalcode = loc.postalcode;
  }
  if (fieldsHas(fields, ["location.city"]) && loc.city != null) {
    out.city = loc.city;
  }
  if (
    fieldsHas(fields, ["location.costsdescription"]) &&
    loc.costsdescription != null
  ) {
    out.costsdescription = loc.costsdescription;
  }
  if (
    fieldsHas(fields, ["location.thirdpartyreservationsurl"]) &&
    loc.thirdpartyreservationsurl != null
  ) {
    out.thirdpartyreservationsurl = loc.thirdpartyreservationsurl;
  }
  if (fieldsHas(fields, ["location.description"]) && loc.description != null) {
    out.description = loc.description;
  }
  if (
    fieldsHas(fields, [
      "location.locationtype",
      "location.type",
    ]) &&
    loc.locationtype != null
  ) {
    out.locationtype = loc.locationtype;
  }
  if (fieldsHas(fields, ["location.station"]) && loc.station != null) {
    out.station = loc.station;
  }

  const occBundle = wantsLocationOccupationBundle(fields);
  if (occBundle) {
    if (loc.occupied != null) out.occupied = loc.occupied;
    if (loc.free != null) out.free = loc.free;
    if (loc.occupationsource !== undefined) {
      out.occupationsource = loc.occupationsource;
    }
    if (loc.capacity != null) out.capacity = loc.capacity;
  }

  if (
    !("capacity" in out) &&
    wantsLocationCapacityExplicit(fields) &&
    loc.capacity != null
  ) {
    out.capacity = loc.capacity;
  }

  if (fieldsHas(fields, ["location.subscriptiontypes"]) && loc.subscriptiontypes) {
    out.subscriptiontypes = loc.subscriptiontypes;
  }

  if (fieldsHasSubstring(fields, "location.openinghours") && loc.openinghours) {
    out.openinghours = filterOpeningHours(loc.openinghours, fields);
  }

  if (
    (fieldsWantsAll(fields) || fieldsHasListFind(fields, "location.services")) &&
    loc.services != null
  ) {
    out.services = loc.services;
  }

  if (
    depth > 1 &&
    fieldsHas(fields, ["location.sections"]) &&
    loc.sections != null
  ) {
    out.sections = loc.sections.map(filterSectionEmbeddedInLocation);
  }

  return out;
}

function filterOpeningHours(
  oh: NonNullable<ColdFusionLocation["openinghours"]>,
  fields: FieldsParam
): NonNullable<ColdFusionLocation["openinghours"]> {
  const out: Partial<NonNullable<ColdFusionLocation["openinghours"]>> = {};

  if (
    fieldsHas(fields, [
      "location.openinghours",
      "location.openinghours.opennow",
    ])
  ) {
    out.opennow = oh.opennow;
  }

  if (
    fieldsHas(fields, [
      "location.openinghours",
      "location.openinghours.periods",
    ]) &&
    oh.periods != null
  ) {
    out.periods = oh.periods;
  }

  if (
    (fieldsWantsAll(fields) ||
      fieldsHasListFind(fields, "location.openinghours") ||
      fieldsHasListFind(fields, "location.openinghours.extrainfo")) &&
    oh.extrainfo != null
  ) {
    out.extrainfo = oh.extrainfo;
  }

  return out as NonNullable<ColdFusionLocation["openinghours"]>;
}

/** Standalone section endpoint: CF REST getSection has no fields arg — never include occupation bundle. */
export function filterSectionForApi(
  section: SectionSummary,
  fields: FieldsParam,
  /** True only when fields was passed to getSection (not used by current CF REST). */
  applyOccupationFromFields = false
): SectionSummary {
  const out: SectionSummary = {
    sectionid: section.sectionid,
    name: section.name,
  };
  if (section.maxsubscriptions != null) {
    out.maxsubscriptions = section.maxsubscriptions;
  }
  if (section.biketypes != null) out.biketypes = section.biketypes;
  if (section.places != null) out.places = section.places;
  if (section.rates != null) out.rates = section.rates;

  if (
    applyOccupationFromFields &&
    fields != null &&
    fields.trim() !== "" &&
    wantsSectionOccupationBundle(fields)
  ) {
    if (section.capacity != null) out.capacity = section.capacity;
    if (section.occupation != null) out.occupation = section.occupation;
    if (section.free != null) out.free = section.free;
    if (section.occupationsource != null) {
      out.occupationsource = section.occupationsource;
    }
  }

  return out;
}

/** Whether citycodes aggregate should use minimal location shape (locationid only). */
export function useMinimalCitycodesLocationShape(fields: FieldsParam): boolean {
  return !fieldsWantsAll(fields) && (fields == null || fields.trim() === "");
}
