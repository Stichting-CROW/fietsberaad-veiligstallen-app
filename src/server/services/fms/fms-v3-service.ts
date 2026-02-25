import { prisma } from "~/server/db";
import { buildOpeningHours } from "./fms-v3-openinghours";

export type CityCode = {
  citycode: string;
  name?: string;
};

export type CityWithLocations = CityCode & {
  locations: ColdFusionLocation[];
};

export type ColdFusionSection = {
  sectionid: string;
  name?: string;
  biketypes?: Array<{
    allowed: boolean;
    biketypeid: number;
    rates: Array<{ timespan: number; cost: number }>;
    capacity?: number;
  }>;
};

export type ColdFusionLocation = {
  biketypes?: ColdFusionSection["biketypes"];
  locationid: string;
  name?: string;
  lat?: string;
  long?: string;
  locationtype?: string;
  occupied?: number;
  free?: number;
  capacity?: number;
  occupationsource?: string;
  openinghours?: {
    opennow: boolean;
    periods: Array<Record<string, unknown>>;
    extrainfo?: string;
  };
  exploitantname?: string;
  exploitantcontact?: string;
  sections?: ColdFusionSection[];
  station?: boolean;
  city?: string;
  address?: string;
  /** Only when non-empty (BaseRestService setIfExists). */
  postalcode?: string;
  costsdescription?: string;
  description?: string;
  /** Array of service names (BaseRestService setIfExists). */
  services?: string[];
};

export type LocationSummary = {
  locationid: string;
  name?: string;
};

export type LocationDetail = LocationSummary & {
  capacity?: number;
  occupation?: number;
  locationtypeid?: number;
};

/** ColdFusion-compatible section (BaseRestService.getSection). */
/** ColdFusion-compatible section. capacity/occupation/free/occupationsource only when fields param passed. */
export type SectionSummary = {
  sectionid: string;
  name?: string;
  capacity?: number;
  occupation?: number;
  free?: number;
  occupationsource?: string;
  biketypes?: Array<{
    allowed: boolean;
    biketypeid: number;
    rates: Array<{ timespan: number; cost: number }>;
    capacity?: number;
  }>;
  places?: PlaceSummary[];
  rates?: Array<{ timespan: number; cost: number }>;
  maxsubscriptions?: number;
};

export type PlaceSummary = {
  placeid: number;
  sectionid: string;
  name?: string;
  status?: number;
};

export type SubscriptionTypeSummary = {
  subscriptiontypeid: number;
  name?: string;
  price?: number;
  tijdsduur?: number;
};

/** ColdFusion-compatible subscription type (id, duration, locationtype, biketypes, idtypes). */
export type ColdFusionSubscriptionType = {
  id: number;
  name?: string;
  price?: number;
  duration?: number;
  locationtype?: string;
  biketypes?: number[];
  idtypes?: number[];
};

/**
 * Maps idmiddelen (abonnementsvormen.idmiddelen) to idtypes array for ColdFusion-compatible API.
 * Mirrors TransactionGateway.passtype2integer() and Subscriptiontype.init() in ColdFusion:
 * - ColdFusion loops over getMeansOfIdentification() as comma-separated list
 * - Each item is passed to passtype2integer(); unknown values return 99
 * - Proper operation: ovchipmetcode = OV-chip + cijfercode would be [1, 2], but ColdFusion
 *   has no mapping for "ovchipmetcode" so it returns 99. We match old API exactly.
 */
function idmiddelenToIdTypes(idmiddelen: string | null | undefined): number[] {
  const passtype2integer = (passtype: string): number => {
    const p = passtype.toLowerCase().trim();
    if (p === "sleutelhanger") return 0;
    if (p === "ovchip") return 1;
    if (p === "cijfercode") return 2;
    if (p === "tijdelijk") return 3;
    if (p === "tmp_sleutelhanger") return 4;
    return 99; // unknown, matches ColdFusion convertStringPasstype2integer
  };
  if (!idmiddelen || !idmiddelen.trim()) return [0]; // default sleutelhanger when empty
  const items = idmiddelen.split(",").map((s) => s.trim()).filter(Boolean);
  return items.length > 0 ? items.map(passtype2integer) : [0];
}

type GetCitiesOptions = {
  fields?: string;
  depth?: number;
};

/** ColdFusion-compatible: returns cities with nested locations (depth >= 1). */
export async function getCities(
  options: GetCitiesOptions = {}
): Promise<CityWithLocations[]> {
  const { depth = 3 } = options;
  const councils = await prisma.contacts.findMany({
    where: {
      ItemType: "organizations",
      ZipID: { not: null },
      Status: "1",
    },
    select: { ID: true, ZipID: true, CompanyName: true },
  });

  const result: CityWithLocations[] = [];
  for (const council of councils) {
    if (!council.ZipID) continue;
    const city = await getCity(council.ZipID, options);
    if (city) result.push(city);
  }
  return result;
}

/** Old API order: locations, citycode, name */
function toCityWithLocationsOrder(c: CityWithLocations): CityWithLocations {
  return { locations: c.locations, citycode: c.citycode, name: c.name };
}

/** ColdFusion-compatible: returns single city with locations. */
export async function getCity(
  citycode: string,
  options: GetCitiesOptions = {}
): Promise<CityWithLocations | null> {
  const { depth = 3 } = options;
  const council = await prisma.contacts.findFirst({
    where: {
      ZipID: citycode,
      ItemType: "organizations",
      Status: "1",
    },
    select: { ZipID: true, CompanyName: true },
  });
  if (!council?.ZipID) return null;

  const locations =
    depth >= 1
      ? await getLocationsFull(citycode, { depth, cityName: council.CompanyName ?? undefined })
      : [];

  return toCityWithLocationsOrder({
    citycode: council.ZipID,
    name: council.CompanyName ?? undefined,
    locations,
  });
}

/** Flat list for backward compat / locations-only endpoint. */
export async function getCityCodes(): Promise<CityCode[]> {
  const rows = await prisma.contacts.findMany({
    where: {
      ItemType: "organizations",
      ZipID: { not: null },
      Status: "1",
    },
    select: { ZipID: true, CompanyName: true },
  });
  return rows
    .filter((r) => r.ZipID)
    .map((r) => ({
      citycode: r.ZipID!,
      name: r.CompanyName ?? undefined,
    }));
}

/** ColdFusion-compatible: full location objects for a city. */
async function getLocationsFull(
  citycode: string,
  options: { depth?: number; cityName?: string } = {}
): Promise<ColdFusionLocation[]> {
  const { depth = 3, cityName } = options;
  const includeSections = depth >= 2;

  const rows = await prisma.fietsenstallingen.findMany({
    where: {
      contacts_fietsenstallingen_SiteIDTocontacts: {
        ZipID: citycode,
        ItemType: "organizations",
      },
      StallingsID: { not: null },
      Status: "1",
      Title: { not: "Systeemstalling" },
    },
    /* Council.cfc bikeparks: where="Title != 'Systeemstalling'" orderby="title asc" */
    orderBy: { Title: "asc" },
    select: {
      StallingsID: true,
      Title: true,
      Coordinaten: true,
      Type: true,
      Capacity: true,
      IsStationsstalling: true,
      BronBezettingsdata: true,
      Location: true,
      Postcode: true,
      Plaats: true,
      Description: true,
      OmschrijvingTarieven: true,
      Url: true,
      Beheerder: true,
      BeheerderContact: true,
      ExtraServices: true,
      Openingstijden: true,
      fietsenstallingen_services: {
        select: { services: { select: { Name: true } } },
      },
      Open_zo: true,
      Dicht_zo: true,
      Open_ma: true,
      Dicht_ma: true,
      Open_di: true,
      Dicht_di: true,
      Open_wo: true,
      Dicht_wo: true,
      Open_do: true,
      Dicht_do: true,
      Open_vr: true,
      Dicht_vr: true,
      Open_za: true,
      Dicht_za: true,
      fietsenstalling_secties: {
        /* ColdFusion getBikeparkSections has no isactief filter */
        select: {
          sectieId: true,
          Bezetting: true,
          secties_fietstype: { select: { Capaciteit: true } },
        },
      },
    },
  });

  const result: ColdFusionLocation[] = [];
  for (const r of rows) {
    const locationid = r.StallingsID;
    const sections = includeSections && locationid
      ? await getSections(citycode, locationid, depth - 1)
      : [];
    const ocf = await computeOccupiedCapacityFree(r as LocationRow);
    result.push(
      buildColdFusionLocation(r as LocationRow, sections as ColdFusionSection[], cityName, ocf, includeSections)
    );
  }
  return result;
}

type SectionForOccupied = {
  sectieId: number;
  Bezetting: number;
  secties_fietstype?: Array<{ Capaciteit: number | null }>;
};

type LocationRow = {
  StallingsID: string | null;
  Title: string | null;
  Coordinaten: string | null;
  Type: string | null;
  Capacity: number | null;
  IsStationsstalling: boolean | null;
  BronBezettingsdata: string | null;
  Location?: string | null;
  Postcode?: string | null;
  Plaats?: string | null;
  Description?: string | null;
  OmschrijvingTarieven?: string | null;
  Url?: string | null;
  Beheerder?: string | null;
  BeheerderContact?: string | null;
  ExtraServices?: string | null;
  Openingstijden?: string | null;
  fietsenstallingen_services?: Array<{ services: { Name: string } | null }>;
  Open_zo?: Date | null;
  Dicht_zo?: Date | null;
  Open_ma?: Date | null;
  Dicht_ma?: Date | null;
  Open_di?: Date | null;
  Dicht_di?: Date | null;
  Open_wo?: Date | null;
  Dicht_wo?: Date | null;
  Open_do?: Date | null;
  Dicht_do?: Date | null;
  Open_vr?: Date | null;
  Dicht_vr?: Date | null;
  Open_za?: Date | null;
  Dicht_za?: Date | null;
  fietsenstalling_secties: SectionForOccupied[];
};

/** BaseRestService setIfExists: only add field when value has Len > 0. */
function setIfExistsValue(v: string | null | undefined): v is string {
  return v != null && typeof v === "string" && v.length > 0;
}

/** ColdFusion-compatible: capacity from secties_fietstype.Capaciteit; occupied from locker statuses (fietskluizen) or Bezetting; bulkreservations subtracted from capacity. */
async function computeOccupiedCapacityFree(
  row: LocationRow
): Promise<{ occupied: number; capacity: number; free: number; includeCapacity: boolean }> {
  const secties = row.fietsenstalling_secties;
  if (!secties?.length) {
    const fallback = row.Capacity ?? 0;
    return {
      occupied: 0,
      capacity: fallback,
      free: Math.max(0, fallback),
      includeCapacity: fallback > 0,
    };
  }

  const sectieIds = secties.map((s) => s.sectieId);
  if (sectieIds.length === 0) {
    const fallback = row.Capacity ?? 0;
    return {
      occupied: 0,
      capacity: fallback,
      free: Math.max(0, fallback),
      includeCapacity: fallback > 0,
    };
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayEnd = new Date(today);
  todayEnd.setDate(todayEnd.getDate() + 1);

  // Bulkreservations for today (BikeparkSection.getBulkreservationForDate): SectieID only (ColdFusion uses ORM relation fkcolumn="SectieID").
  // SectionExternalID is a denormalized helper column, not used for lookup.
  const exceptedIds = (
    await prisma.bulkreserveringuitzondering.findMany({
      where: { datum: { gte: today, lt: todayEnd } },
      select: { BulkreservationID: true },
    })
  )
    .map((e) => e.BulkreservationID)
    .filter((id): id is number => id != null);

  const bulkreservations = await prisma.bulkreservering.findMany({
    where: {
      SectieID: { in: sectieIds },
      Startdatumtijd: { gte: today, lt: todayEnd },
      Einddatumtijd: { gte: new Date() },
      ...(exceptedIds.length > 0 && { ID: { notIn: exceptedIds } }),
    },
    select: { SectieID: true, Aantal: true },
    orderBy: { Startdatumtijd: "asc" },
  });
  // ColdFusion getBulkreservationForDate returns first match per section
  const bulkBySectie = new Map<number, number>();
  for (const b of bulkreservations) {
    if (b.SectieID != null && !bulkBySectie.has(b.SectieID)) {
      bulkBySectie.set(b.SectieID, b.Aantal ?? 0);
    }
  }

  // Sections with places (lockers): BikeparkSection.hasPlace() = has fietsenstalling_plek rows
  const sectionsWithPlaces = await prisma.fietsenstalling_plek.findMany({
    where: { sectie_id: { in: sectieIds.map((id) => BigInt(id)) } },
    select: { sectie_id: true },
    distinct: ["sectie_id"],
  });
  const hasPlacesSet = new Set(sectionsWithPlaces.map((p) => Number(p.sectie_id!)));

  // ColdFusion BikeparkSection.getOccupiedPlaces(): loop places, count where place.getCurrentStatus() neq place.FREE.
  // Place.getCurrentStatus(): if getStatus() eq "" then setStatus(calculateStatus()), return getStatus() MOD 10.
  // calculateStatus(): when getBikeParked() is not null, returns OCCUPIED. getBikeParked() = getQOpenTransactionByPlaceID(placeID=getID()).
  // TransactionGateway.getQOpenTransactionByPlaceID: transacties WHERE PlaceID = place.id AND Date_checkout IS NULL.
  // So occupied = (status set and (status MOD 10) != 0) OR (transacties PlaceID=place.id, Date_checkout null).
  const [openTxByPlaceId, allLockerPlaces] = await Promise.all([
    prisma.transacties.findMany({
      where: { Date_checkout: null, PlaceID: { not: null } },
      select: { PlaceID: true },
      distinct: ["PlaceID"],
    }),
    prisma.fietsenstalling_plek.findMany({
      where: { sectie_id: { in: sectieIds.map((id) => BigInt(id)) } },
      select: { id: true, sectie_id: true, status: true },
    }),
  ]);
  const openTxPlaceIdSet = new Set(openTxByPlaceId.map((r) => Number(r.PlaceID!)).filter(Boolean));
  const occupiedBySectie = new Map<number, number>();
  for (const p of allLockerPlaces) {
    if (p.sectie_id == null) continue;
    const sid = Number(p.sectie_id);
    const occupiedByStatus = p.status != null && p.status % 10 !== 0;
    const occupiedByOpenTx = openTxPlaceIdSet.has(Number(p.id));
    if (occupiedByStatus || occupiedByOpenTx) {
      occupiedBySectie.set(sid, (occupiedBySectie.get(sid) ?? 0) + 1);
    }
  }

  let totalCapacityRaw = 0;
  let totalCapacityNetto = 0;
  let totalOccupied = 0;

  for (const s of secties) {
    const sectionCapacity = (s.secties_fietstype ?? []).reduce(
      (sum, sf) => sum + (sf.Capaciteit ?? 0),
      0
    );
    const bulk = bulkBySectie.get(s.sectieId) ?? 0;
    const netto = Math.max(0, sectionCapacity - bulk);

    const hasPlaces = hasPlacesSet.has(s.sectieId);
    const sectionOccupied = hasPlaces
      ? occupiedBySectie.get(s.sectieId) ?? 0
      : s.Bezetting ?? 0;

    totalCapacityRaw += sectionCapacity;
    totalCapacityNetto += netto;
    totalOccupied += sectionOccupied;
  }

  // ColdFusion always uses getNettoCapacity() when we have sections - it never falls back to fietsenstallingen.Capacity.
  // When secties_fietstype is empty, section.getCapacity() = 0, so getNettoCapacity() = 0 (e.g. 3500_142).
  const capacity = totalCapacityNetto;
  // ColdFusion getFreePlaces = getCapacity() - getOccupiedPlaces(). Bikepark.getCapacity() returns
  // variables.capacity (fietsenstallingen.Capacity) when set and numeric, else calculateCapacity().
  const capacityForFree =
    row.Capacity != null && typeof row.Capacity === "number" && !Number.isNaN(row.Capacity)
      ? row.Capacity
      : totalCapacityRaw;
  const free = Math.max(0, capacityForFree - totalOccupied);
  // ColdFusion only sets capacity when getCapacity() > 0; include when we have section/row capacity
  const includeCapacity = totalCapacityRaw > 0 || (row.Capacity != null && row.Capacity > 0);
  return {
    occupied: totalOccupied,
    capacity,
    free,
    includeCapacity,
  };
}

function buildColdFusionLocation(
  row: LocationRow,
  sections: ColdFusionSection[],
  cityName: string | undefined,
  ocf: { occupied: number; capacity: number; free: number; includeCapacity: boolean },
  includeSections = true
): ColdFusionLocation {
  const { occupied: totalOccupied, capacity: totalCapacity, free, includeCapacity } = ocf;

  const [lat, long] = parseCoordinaten(row.Coordinaten);

  const openinghoursBase = buildOpeningHours({
    Open_zo: row.Open_zo,
    Dicht_zo: row.Dicht_zo,
    Open_ma: row.Open_ma,
    Dicht_ma: row.Dicht_ma,
    Open_di: row.Open_di,
    Dicht_di: row.Dicht_di,
    Open_wo: row.Open_wo,
    Dicht_wo: row.Dicht_wo,
    Open_do: row.Open_do,
    Dicht_do: row.Dicht_do,
    Open_vr: row.Open_vr,
    Dicht_vr: row.Dicht_vr,
    Open_za: row.Open_za,
    Dicht_za: row.Dicht_za,
  });
  const openinghours =
    setIfExistsValue(row.Openingstijden) && row.Openingstijden
      ? { ...openinghoursBase, extrainfo: row.Openingstijden }
      : openinghoursBase;

  // exploitantname: Beheerder (BaseRestService bikepark.getManager())
  // exploitantcontact: BeheerderContact (BaseRestService bikepark.getManagerContact())
  const exploitantname = setIfExistsValue(row.Beheerder) ? row.Beheerder! : undefined;
  const exploitantcontact = setIfExistsValue(row.BeheerderContact) ? row.BeheerderContact! : undefined;

  // getAllServices: fietsenstallingen_services.services.Name + ExtraServices (comma-separated list)
  const servicesFromTable =
    row.fietsenstallingen_services?.map((fs) => fs.services?.Name).filter((n): n is string => !!n?.trim()) ?? [];
  const servicesFromExtra = (row.ExtraServices ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const allServices = [...servicesFromTable, ...servicesFromExtra];
  const services = allServices.length > 0 ? allServices : undefined;

  const loc: ColdFusionLocation = {
    locationid: row.StallingsID!,
    name: row.Title ?? undefined,
    locationtype: row.Type ?? undefined,
    occupationsource: row.BronBezettingsdata ?? "FMS",
    openinghours,
    station: row.IsStationsstalling ?? false,
    ...(lat && { lat }),
    ...(long && { long }),
    // ColdFusion always sets occupied, free; capacity only when getCapacity() > 0 (can be 0 when getNettoCapacity=0)
    occupied: totalOccupied,
    free,
    ...(includeCapacity && { capacity: totalCapacity }),
    ...(exploitantname && { exploitantname }),
    ...(exploitantcontact && { exploitantcontact }),
    // ColdFusion sets sections only when depth > 1 (can be [])
    ...(includeSections && { sections }),
    ...(services && { services }),
    ...((cityName ?? row.Plaats) && { city: cityName ?? row.Plaats ?? undefined }),
    ...(row.Location && { address: row.Location }),
    ...(setIfExistsValue(row.Postcode) && { postalcode: row.Postcode! }),
    ...(setIfExistsValue(row.OmschrijvingTarieven) && { costsdescription: row.OmschrijvingTarieven! }),
    ...(setIfExistsValue(row.Description) && { description: row.Description! }),
  };
  return toColdFusionLocationOrder(loc);
}

/** Old API format for locations/{locationid} single-section: section data only, not full location. */
export type LocationDetailSingleSection = {
  sectionid: string;
  name?: string;
  biketypes: NonNullable<ColdFusionSection["biketypes"]>;
};

/** Converts location to old API format for single-location endpoint.
 * - Single section: returns { sectionid, name, biketypes } only (not full location object).
 * - Multi-section: returns full location with sections array (each section: sectionid, name only; no biketypes in sections).
 */
export function toLocationDetailFormat(loc: ColdFusionLocation): LocationDetailSingleSection | ColdFusionLocation {
  const sections = loc.sections ?? [];

  if (sections.length === 1) {
    const section = sections[0]!;
    return {
      sectionid: section.sectionid,
      name: section.name,
      biketypes: section.biketypes ?? [],
    };
  }

  if (sections.length > 1) {
    const sectionsStripped = sections.map((s) => ({ sectionid: s.sectionid, name: s.name }));
    return toColdFusionLocationOrder({ ...loc, sections: sectionsStripped });
  }

  return {
    sectionid: loc.locationid,
    name: loc.name,
    biketypes: [],
  };
}

/** Key order for each location in citycodes/{citycode}/locations array. Matches old API observed order. */
function toColdFusionLocationOrder(loc: ColdFusionLocation): ColdFusionLocation {
  const order = [
    "occupied",
    "exploitantname",
    "exploitantcontact",
    "locationtype",
    "long",
    "sections",
    "station",
    "occupationsource",
    "lat",
    "name",
    "free",
    "city",
    "capacity",
    "address",
    "postalcode",
    "costsdescription",
    "description",
    "locationid",
    "openinghours",
    "services",
  ];
  const out: Record<string, unknown> = {};
  for (const k of order) {
    const v = (loc as Record<string, unknown>)[k];
    if (v !== undefined) out[k] = v;
  }
  return out as ColdFusionLocation;
}

/**
 * Parse Coordinaten to [lat, long] matching ColdFusion ListFirst/ListLast semantics.
 * BaseRestService.cfc: lat = ListFirst(getCoordinates()), long = ListLast(getCoordinates()).
 * ColdFusion uses comma as delimiter and does NOT trim, so "51.469650, 5.473466" yields
 * lat="51.469650", long=" 5.473466" (leading space preserved).
 */
function parseCoordinaten(s: string | null): [string | undefined, string | undefined] {
  if (!s || typeof s !== "string") return [undefined, undefined];
  const parts = s.split(",");
  const lat = parts[0];
  const long = parts[parts.length - 1];
  if (lat !== undefined && long !== undefined && lat !== "" && long !== "")
    return [lat, long];
  return [undefined, undefined];
}

export async function getLocations(
  citycode: string,
  options: { depth?: number; fields?: string } = {}
): Promise<ColdFusionLocation[]> {
  return getLocationsFull(citycode, options);
}

export async function getLocation(
  citycode: string,
  locationid: string,
  depth = 2
): Promise<ColdFusionLocation | null> {
  const council = await prisma.contacts.findFirst({
    where: { ZipID: citycode, ItemType: "organizations" },
    select: { CompanyName: true },
  });
  const stalling = await prisma.fietsenstallingen.findFirst({
    where: {
      StallingsID: locationid,
      contacts_fietsenstallingen_SiteIDTocontacts: {
        ZipID: citycode,
        ItemType: "organizations",
      },
      Status: "1",
    },
    select: {
      StallingsID: true,
      Title: true,
      Coordinaten: true,
      Type: true,
      Capacity: true,
      IsStationsstalling: true,
      BronBezettingsdata: true,
      Location: true,
      Postcode: true,
      Plaats: true,
      Description: true,
      OmschrijvingTarieven: true,
      Url: true,
      Beheerder: true,
      BeheerderContact: true,
      ExtraServices: true,
      Openingstijden: true,
      fietsenstallingen_services: {
        select: { services: { select: { Name: true } } },
      },
      Open_zo: true,
      Dicht_zo: true,
      Open_ma: true,
      Dicht_ma: true,
      Open_di: true,
      Dicht_di: true,
      Open_wo: true,
      Dicht_wo: true,
      Open_do: true,
      Dicht_do: true,
      Open_vr: true,
      Dicht_vr: true,
      Open_za: true,
      Dicht_za: true,
      fietsenstalling_secties: {
        /* ColdFusion getBikeparkSections has no isactief filter */
        select: {
          sectieId: true,
          Bezetting: true,
          secties_fietstype: { select: { Capaciteit: true } },
        },
      },
    },
  });
  if (!stalling?.StallingsID) return null;
  const sections = await getSections(citycode, locationid, depth);
  const ocf = await computeOccupiedCapacityFree(stalling as LocationRow);
  return buildColdFusionLocation(
    stalling as LocationRow,
    sections as ColdFusionSection[],
    council?.CompanyName ?? undefined,
    ocf
  );
}

export async function getSections(
  citycode: string,
  locationid: string,
  depth = 2
): Promise<SectionSummary[]> {
  const secties = await prisma.fietsenstalling_sectie.findMany({
    where: {
      fietsenstalling: {
        StallingsID: locationid,
        contacts_fietsenstallingen_SiteIDTocontacts: {
          ZipID: citycode,
          ItemType: "organizations",
        },
        Status: "1",
      },
      /* ColdFusion getBikeparkSections has no isactief filter */
    },
    select: { externalId: true },
  });
  const result: SectionSummary[] = [];
  for (const s of secties) {
    const sectionid = s.externalId ?? "";
    if (sectionid) {
      const section = await getSection(citycode, locationid, sectionid, depth - 1);
      if (section) result.push(section);
    }
  }
  return result;
}

export async function getSection(
  citycode: string,
  locationid: string,
  sectionid: string,
  depth = 2
): Promise<SectionSummary | null> {
  const sectie = await prisma.fietsenstalling_sectie.findFirst({
    where: {
      externalId: sectionid,
      fietsenstalling: {
        StallingsID: locationid,
        contacts_fietsenstallingen_SiteIDTocontacts: {
          ZipID: citycode,
          ItemType: "organizations",
        },
        Status: "1",
      },
    },
    include: {
      fietsenstalling: {
        select: {
          BronBezettingsdata: true,
          hasUniBikeTypePrices: true,
          Type: true,
          AantalReserveerbareKluizen: true,
        },
      },
      secties_fietstype: {
        include: { fietstype: { select: { ID: true } } },
      },
    },
  });
  if (!sectie) return null;

  const stalling = sectie.fietsenstalling;

  const data: Record<string, unknown> = {};
  data.sectionid = sectie.externalId ?? "";
  data.name = sectie.titel;
  /* ColdFusion: maxsubscriptions only when Type eq "fietskluizen"; capacity/occupation/free/occupationsource only when fields; places when depth>1 and hasPlace; rates when hasUniBiketypePrices */

  if (stalling?.Type === "fietskluizen" && stalling.AantalReserveerbareKluizen != null) {
    data.maxsubscriptions = stalling.AantalReserveerbareKluizen;
  }

  if (sectie.secties_fietstype.length > 0) {
    const sectionBikeTypeIds = sectie.secties_fietstype.map((sf) => sf.SectionBiketypeID);
    const tariefregels = await prisma.tariefregels.findMany({
      where: { sectionBikeTypeID: { in: sectionBikeTypeIds } },
      orderBy: { index: "asc" },
    });
    const tariefBySbt = new Map<number, typeof tariefregels>();
    for (const t of tariefregels) {
      if (t.sectionBikeTypeID != null) {
        const arr = tariefBySbt.get(t.sectionBikeTypeID) ?? [];
        arr.push(t);
        tariefBySbt.set(t.sectionBikeTypeID, arr);
      }
    }

    data.biketypes = sectie.secties_fietstype.map((sf) => {
      const tr = tariefBySbt.get(sf.SectionBiketypeID);
      const rates = tr ? tr.map((t) => ({ timespan: t.tijdsspanne ?? 0, cost: Number(t.kosten ?? 0) })) : [];
      const allowed = sf.Toegestaan ?? false;
      const out: { allowed: boolean; biketypeid: number; rates: Array<{ timespan: number; cost: number }>; capacity?: number } = {
        allowed,
        biketypeid: sf.BikeTypeID ?? 0,
        rates,
      };
      if (allowed && sf.Capaciteit != null && sf.Capaciteit > 0) {
        out.capacity = sf.Capaciteit;
      }
      return out;
    });
  }

  if (depth > 1) {
    const places = await getPlaces(citycode, locationid, sectionid);
    if (places.length > 0) data.places = places;
  }

  if (stalling?.hasUniBikeTypePrices) {
    const sectieTariefregels = await prisma.tariefregels.findMany({
      where: { sectieID: sectie.sectieId, sectionBikeTypeID: null },
      orderBy: { index: "asc" },
    });
    const kostenperioden = await prisma.fietsenstalling_sectie_kostenperioden.findMany({
      where: { sectieId: sectie.sectieId },
      orderBy: { index: "asc" },
    });
    const rates =
      sectieTariefregels.length > 0
        ? sectieTariefregels.map((t) => ({ timespan: t.tijdsspanne ?? 0, cost: Number(t.kosten ?? 0) }))
        : kostenperioden.map((kp) => ({
            timespan: parseFloat(kp.tijdsspanne ?? "0") || 0,
            cost: parseFloat(kp.kosten ?? "0") || 0,
          }));
    if (rates.length > 0) data.rates = rates;
  }

  return toSectionOrder(data) as SectionSummary;
}

/** Key order for sections inside location. Matches old API: biketypes, sectionid, name, then optional maxsubscriptions, places, rates. */
function toSectionOrder(obj: Record<string, unknown>): Record<string, unknown> {
  const order = ["biketypes", "sectionid", "name", "maxsubscriptions", "places", "rates"];
  const out: Record<string, unknown> = {};
  for (const k of order) {
    if (k in obj && obj[k] !== undefined) out[k] = obj[k];
  }
  return out;
}

export async function getPlaces(
  citycode: string,
  locationid: string,
  sectionid: string
): Promise<PlaceSummary[]> {
  const sectie = await prisma.fietsenstalling_sectie.findFirst({
    where: {
      externalId: sectionid,
      fietsenstalling: {
        StallingsID: locationid,
        contacts_fietsenstallingen_SiteIDTocontacts: {
          ZipID: citycode,
          ItemType: "organizations",
        },
        Status: "1",
      },
    },
    select: { sectieId: true },
  });
  if (!sectie) return [];

  const plekken = await prisma.fietsenstalling_plek.findMany({
    where: { sectie_id: BigInt(sectie.sectieId) },
    select: { id: true, titel: true, status: true },
  });
  return plekken.map((p) => ({
    placeid: Number(p.id),
    sectionid,
    name: p.titel ?? undefined,
    status: p.status ?? undefined,
  }));
}

export async function getSubscriptionTypes(
  citycode: string,
  locationid: string
): Promise<ColdFusionSubscriptionType[]> {
  const stalling = await prisma.fietsenstallingen.findFirst({
    where: {
      StallingsID: locationid,
      contacts_fietsenstallingen_SiteIDTocontacts: {
        ZipID: citycode,
        ItemType: "organizations",
      },
      Status: "1",
    },
    select: { ID: true, Type: true },
  });
  if (!stalling) return [];

  const links = await prisma.abonnementsvorm_fietsenstalling.findMany({
    where: { BikeparkID: stalling.ID },
    include: {
      abonnementsvormen: {
        select: {
          ID: true,
          naam: true,
          prijs: true,
          tijdsduur: true,
          isActief: true,
          bikeparkTypeID: true,
          idmiddelen: true,
        },
      },
    },
  });

  const subscriptionIds = links
    .filter((l) => l.abonnementsvormen?.isActief !== false)
    .filter((l) => {
      const bt = l.abonnementsvormen?.bikeparkTypeID;
      return !bt || bt === stalling.Type;
    })
    .map((l) => l.SubscriptiontypeID);

  const bikeTypeLinks =
    subscriptionIds.length > 0
      ? await prisma.abonnementsvorm_fietstype.groupBy({
          by: ["SubscriptiontypeID", "BikeTypeID"],
          where: { SubscriptiontypeID: { in: subscriptionIds } },
        })
      : [];

  const biketypesBySub = bikeTypeLinks.reduce(
    (acc, link) => {
      const arr = acc.get(link.SubscriptiontypeID) ?? [];
      if (!arr.includes(link.BikeTypeID)) arr.push(link.BikeTypeID);
      acc.set(link.SubscriptiontypeID, arr);
      return acc;
    },
    new Map<number, number[]>()
  );

  return links
    .filter((l) => l.abonnementsvormen?.isActief !== false)
    .filter((l) => {
      const bt = l.abonnementsvormen?.bikeparkTypeID;
      return !bt || bt === stalling.Type;
    })
    .map((l) => {
      const av = l.abonnementsvormen!;
      const biketypes = biketypesBySub.get(l.SubscriptiontypeID) ?? [];
      return {
        id: av.ID,
        name: av.naam ?? undefined,
        price: av.prijs ? Number(av.prijs) : undefined,
        duration: av.tijdsduur ?? undefined,
        locationtype: (av.bikeparkTypeID ?? stalling.Type) ?? undefined,
        biketypes: [...new Set(biketypes)].sort((a, b) => a - b),
        idtypes: idmiddelenToIdTypes(av.idmiddelen),
      };
    });
}
