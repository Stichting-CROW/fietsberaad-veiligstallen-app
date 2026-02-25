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
  };
  exploitantcontact?: string;
  sections?: ColdFusionSection[];
  station?: boolean;
  city?: string;
  address?: string;
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
      Plaats: true,
      Url: true,
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
      contacts_fietsenstallingen_ExploitantIDTocontacts: {
        select: { URL: true },
      },
      fietsenstalling_secties: {
        where: { isactief: true },
        select: { Bezetting: true, capaciteit: true },
      },
    },
  });

  const result: ColdFusionLocation[] = [];
  for (const r of rows) {
    const locationid = r.StallingsID;
    const sections = includeSections && locationid
      ? await getSections(citycode, locationid, depth - 1)
      : [];
    result.push(buildColdFusionLocation(r as LocationRow, sections as ColdFusionSection[], cityName));
  }
  return result;
}

type LocationRow = {
  StallingsID: string | null;
  Title: string | null;
  Coordinaten: string | null;
  Type: string | null;
  Capacity: number | null;
  IsStationsstalling: boolean | null;
  BronBezettingsdata: string | null;
  Location?: string | null;
  Plaats?: string | null;
  Url?: string | null;
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
  contacts_fietsenstallingen_ExploitantIDTocontacts?: { URL: string | null } | null;
  fietsenstalling_secties:
    | { Bezetting: number; capaciteit: number | null }[]
    | {
        externalId: string | null;
        titel: string | null;
        Bezetting: number;
        capaciteit: number | null;
        secties_fietstype: {
          BikeTypeID: number;
          Toegestaan: boolean | null;
          Capaciteit: number | null;
        }[];
      }[];
};

function buildColdFusionLocation(
  row: LocationRow,
  sections: ColdFusionSection[],
  cityName?: string
): ColdFusionLocation {
  const secties = row.fietsenstalling_secties as { Bezetting: number; capaciteit: number | null }[];
  const totalBezetting = secties.reduce((s, x) => s + (x.Bezetting ?? 0), 0);
  const totalCapacity =
    (secties.reduce((s, x) => s + (x.capaciteit ?? 0), 0) || row.Capacity) ?? 0;
  const free = Math.max(0, totalCapacity - totalBezetting);

  const [lat, long] = parseCoordinaten(row.Coordinaten);
  const longFormatted = long ? (long.startsWith(" ") ? long : ` ${long}`) : undefined;

  const openinghours = buildOpeningHours({
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

  const exploitantcontact =
    row.contacts_fietsenstallingen_ExploitantIDTocontacts?.URL ?? row.Url ?? undefined;

  const loc: ColdFusionLocation = {
    locationid: row.StallingsID!,
    name: row.Title ?? undefined,
    locationtype: row.Type ?? undefined,
    occupationsource: row.BronBezettingsdata ?? "FMS",
    openinghours,
    station: row.IsStationsstalling ?? false,
    ...(lat && { lat }),
    ...(longFormatted && { long: longFormatted }),
    ...(totalCapacity > 0 && {
      occupied: totalBezetting,
      free,
      capacity: totalCapacity,
    }),
    ...(exploitantcontact && { exploitantcontact }),
    ...(sections.length > 0 && { sections: sections.map(toSectionForLocation) }),
    ...(cityName && { city: cityName }),
    ...(row.Location && { address: row.Location }),
  };
  if (sections.length === 1 && sections[0]?.biketypes) {
    loc.biketypes = sections[0].biketypes;
  }
  return toColdFusionLocationOrder(loc);
}

/** Sections inside a location: old API only has sectionid and name (biketypes are at location level). */
function toSectionForLocation(s: ColdFusionSection): { sectionid: string; name?: string } {
  return {
    sectionid: (s as { sectionid?: string }).sectionid ?? "",
    name: (s as { name?: string }).name,
  };
}

/** Old API order: biketypes first (when single section), then address, capacity, city, exploitantcontact, free, lat, locationid, locationtype, long, name, occupied, occupationsource, openinghours, sections, station */
function toColdFusionLocationOrder(loc: ColdFusionLocation): ColdFusionLocation {
  const order = [
    "biketypes",
    "address",
    "capacity",
    "city",
    "exploitantcontact",
    "free",
    "lat",
    "locationid",
    "locationtype",
    "long",
    "name",
    "occupied",
    "occupationsource",
    "openinghours",
    "sections",
    "station",
  ];
  const out: Record<string, unknown> = {};
  for (const k of order) {
    const v = (loc as Record<string, unknown>)[k];
    if (v !== undefined) out[k] = v;
  }
  return out as ColdFusionLocation;
}

function parseCoordinaten(s: string | null): [string | undefined, string | undefined] {
  if (!s || typeof s !== "string") return [undefined, undefined];
  const parts = s.split(/[,\s]+/).filter(Boolean);
  if (parts.length >= 2) return [parts[0]!, parts[1]!];
  return [undefined, undefined];
}

export async function getLocations(citycode: string): Promise<ColdFusionLocation[]> {
  return getLocationsFull(citycode);
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
      Plaats: true,
      Url: true,
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
      contacts_fietsenstallingen_ExploitantIDTocontacts: {
        select: { URL: true },
      },
      fietsenstalling_secties: {
        where: { isactief: true },
        select: {
          externalId: true,
          titel: true,
          Bezetting: true,
          capaciteit: true,
        },
      },
    },
  });
  if (!stalling?.StallingsID) return null;
  const sections = await getSections(citycode, locationid, depth);
  /* Old API: single-section location returns section structure (sectionid, name, biketypes) at root, not full location. */
  if (sections.length === 1 && sections[0]?.biketypes) {
    const s = sections[0];
    return { sectionid: s.sectionid ?? "", name: s.name, biketypes: s.biketypes } as unknown as ColdFusionLocation;
  }
  return buildColdFusionLocation(
    stalling as LocationRow,
    sections as ColdFusionSection[],
    council?.CompanyName ?? undefined
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
      isactief: true,
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

/** Key order to match ColdFusion getSection insertion order: maxsubscriptions, sectionid, name, biketypes, places, rates. */
function toSectionOrder(obj: Record<string, unknown>): Record<string, unknown> {
  const order = ["maxsubscriptions", "sectionid", "name", "biketypes", "places", "rates"];
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
