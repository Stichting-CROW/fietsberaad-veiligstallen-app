import { prisma } from "~/server/db";
import { buildOpeningHours } from "./fms-v3-openinghours";

const FMS_TIMING = false;

/** In-memory cache for citycodes/{citycode}. 0 = no caching. Disabled in development. 30 min in prod (matches ColdFusion getCities). */
const CACHE_CITYCODES_DURATION_MINUTES =
  process.env.NODE_ENV === "development" ? 0 : 30;
const cityCache = new Map<string, { data: CityWithLocations; expires: number }>();

function getCityCacheKey(citycode: string, depth: number): string {
  return `city:${citycode}:d:${depth}`;
}

const CITY_CACHE_TTL_MS =
  CACHE_CITYCODES_DURATION_MINUTES > 0 ? CACHE_CITYCODES_DURATION_MINUTES * 60 * 1000 : 0;

function timeStart(label: string): number {
  return FMS_TIMING ? performance.now() : 0;
}
function timeEnd(label: string, start: number) {
  if (FMS_TIMING && start) {
    console.log(`[FMS timing] ${label}: ${(performance.now() - start).toFixed(0)}ms`);
  }
}

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

/** ColdFusion-compatible place format: datelaststatusupdate, statuscode, name, id. statuscode = status % 10 (0=vrij, 1=bezet, 2=abonnement, 3=gereserveerd, 4=buiten werking). */
export type PlaceSummary = {
  datelaststatusupdate: string;
  statuscode: number;
  name?: string;
  id: number;
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
  /** Use true for V3 citycodes list: omits exploitantname, sections, station, city, address, postalcode from locations. */
  forV3Citycodes?: boolean;
};

/** ColdFusion-compatible: returns cities with nested locations (depth >= 1). */
export async function getCities(
  options: GetCitiesOptions = {}
): Promise<CityWithLocations[]> {
  const { depth = 3 } = options;
  // ColdFusion: getCouncilsWithBikeparks() - councils with active bikeparks, ORDER BY companyName
  const councils = await prisma.contacts.findMany({
    where: {
      ID: { not: "1" },
      ItemType: "organizations",
      ZipID: { not: null },
      Status: "1",
      fietsenstallingen_fietsenstallingen_SiteIDTocontacts: {
        some: {
          Status: "1",
          StallingsID: { not: null },
          Title: { not: "Systeemstalling" },
        },
      },
    },
    orderBy: { CompanyName: "asc" },
    select: { ID: true, ZipID: true, CompanyName: true },
  });

  const result: CityWithLocations[] = [];
  for (const council of councils) {
    if (!council.ZipID) continue;
    const city = await getCity(council.ZipID, { ...options, forV3Citycodes: true });
    if (city) result.push(city);
  }
  return result;
}

/** Old API order: locations, citycode, name */
function toCityWithLocationsOrder(c: CityWithLocations): CityWithLocations {
  return { locations: c.locations, citycode: c.citycode, name: c.name };
}

/** ColdFusion-compatible: returns single city with locations. Cached when CACHE_CITYCODES_DURATION_MINUTES > 0. */
export async function getCity(
  citycode: string,
  options: GetCitiesOptions = {}
): Promise<CityWithLocations | null> {
  const { depth = 3 } = options;
  if (CITY_CACHE_TTL_MS > 0) {
    const cacheKey = getCityCacheKey(citycode, depth);
    const cached = cityCache.get(cacheKey);
    if (cached && cached.expires > Date.now()) {
      return cached.data;
    }
  }

  const t0 = timeStart("getCity total");
  const tCouncil = timeStart("getCity council");
  const council = await prisma.contacts.findFirst({
    where: {
      ZipID: citycode,
      ItemType: "organizations",
      Status: "1",
    },
    select: { ZipID: true, CompanyName: true },
  });
  timeEnd("getCity council", tCouncil);
  if (!council?.ZipID) return null;

  const tLoc = timeStart("getCity getLocationsFull");
  const locations =
    depth >= 1
      ? await getLocationsFull(citycode, {
          depth,
          forV3Citycodes: options.forV3Citycodes ?? false,
        })
      : [];

  timeEnd("getCity getLocationsFull", tLoc);
  timeEnd("getCity total", t0);
  const result = toCityWithLocationsOrder({
    citycode: council.ZipID,
    name: council.CompanyName ?? undefined,
    locations,
  });
  if (CITY_CACHE_TTL_MS > 0) {
    cityCache.set(getCityCacheKey(citycode, depth), {
      data: result,
      expires: Date.now() + CITY_CACHE_TTL_MS,
    });
  }
  return result;
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

/** All IDs for full-dataset API comparison test. Matches getCities/getLocations/getSections filters. */
export type FullDatasetIds = {
  cities: Array<{ citycode: string }>;
  locations: Array<{ citycode: string; locationid: string; locationtype?: string }>;
  sections: Array<{ citycode: string; locationid: string; sectionid: string; locationtype?: string }>;
};

export async function getFullDatasetIds(options?: { citycode?: string }): Promise<FullDatasetIds> {
  const councils = await prisma.contacts.findMany({
    where: {
      ID: { not: "1" },
      ItemType: "organizations",
      ZipID: { not: null },
      Status: "1",
      ...(options?.citycode && { ZipID: options.citycode }),
      fietsenstallingen_fietsenstallingen_SiteIDTocontacts: {
        some: {
          Status: "1",
          StallingsID: { not: null },
          Title: { not: "Systeemstalling" },
        },
      },
    },
    select: { ZipID: true },
  });
  const cities = councils.filter((c) => c.ZipID).map((c) => ({ citycode: c.ZipID! }));

  const locations: Array<{ citycode: string; locationid: string; locationtype?: string }> = [];
  const sections: Array<{ citycode: string; locationid: string; sectionid: string; locationtype?: string }> = [];

  for (const { citycode } of cities) {
    const locRows = await prisma.fietsenstallingen.findMany({
      where: {
        contacts_fietsenstallingen_SiteIDTocontacts: {
          ZipID: citycode,
          ItemType: "organizations",
        },
        StallingsID: { not: null },
        Status: "1",
        Title: { not: "Systeemstalling" },
      },
      select: {
        StallingsID: true,
        Type: true,
        fietsenstalling_secties: { select: { externalId: true } },
      },
    });
    for (const row of locRows) {
      if (row.StallingsID) {
        const locationtype = row.Type ?? undefined;
        locations.push({ citycode, locationid: row.StallingsID, locationtype });
        for (const s of row.fietsenstalling_secties) {
          if (s.externalId) {
            sections.push({ citycode, locationid: row.StallingsID, sectionid: s.externalId, locationtype });
          }
        }
      }
    }
  }
  return { cities, locations, sections };
}

/** ColdFusion-compatible: full location objects for a city. Uses single query + bulk fetches, assembles in memory. */
async function getLocationsFull(
  citycode: string,
  options: { depth?: number; limit?: number; forV3Citycodes?: boolean; omitSections?: boolean } = {}
): Promise<ColdFusionLocation[]> {
  const t0 = timeStart("getLocationsFull total");
  const { depth = 3, limit, forV3Citycodes = false, omitSections = false } = options;
  const includeSections = depth >= 2 && !omitSections;

  const tFind = timeStart("getLocationsFull findMany locations");
  const rows = await prisma.fietsenstallingen.findMany({
    ...(limit != null && { take: limit }),
    where: {
      contacts_fietsenstallingen_SiteIDTocontacts: {
        ZipID: citycode,
        ItemType: "organizations",
      },
      StallingsID: { not: null },
      Status: "1", // ColdFusion: getActiveBikeparks() filters by isActive() = Status eq "1"
      Title: { not: "Systeemstalling" },
    },
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
      hasUniBikeTypePrices: true,
      AantalReserveerbareKluizen: true,
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
        select: {
          sectieId: true,
          externalId: true,
          titel: true,
          Bezetting: true,
          secties_fietstype: {
            select: {
              SectionBiketypeID: true,
              Toegestaan: true,
              BikeTypeID: true,
              Capaciteit: true,
            },
          },
        },
      },
    },
  });
  timeEnd("getLocationsFull findMany locations", tFind);

  const tBulk = timeStart("getLocationsFull bulk sections+ocf");
  const [sectionsForRows, ocfResults] = await Promise.all([
    includeSections
      ? assembleSectionsFromRows(rows as LocationRowWithSections[], depth)
      : Promise.resolve(rows.map(() => [] as ColdFusionSection[])),
    computeOccupiedCapacityFreeBatch(rows as LocationRow[]),
  ]);
  timeEnd("getLocationsFull bulk sections+ocf", tBulk);

  const result: ColdFusionLocation[] = [];
  for (let i = 0; i < rows.length; i++) {
    result.push(
      buildColdFusionLocation(
        rows[i] as LocationRow,
        sectionsForRows[i] ?? [],
        ocfResults[i]!,
        includeSections,
        forV3Citycodes
      )
    );
  }
  // citycodes list: order by locationid (old API uses this for getCities). citycodes/{citycode}: order by name (title asc).
  if (forV3Citycodes) {
    result.sort((a, b) => (a.locationid ?? "").localeCompare(b.locationid ?? "", undefined, { numeric: true }));
  } else {
    result.sort((a, b) =>
      (a.name ?? "").localeCompare(b.name ?? "", undefined, { sensitivity: "accent" })
    );
  }
  timeEnd("getLocationsFull total", t0);
  return result;
}

type SectionForOccupied = {
  sectieId: number;
  Bezetting: number;
  secties_fietstype?: Array<{ Capaciteit: number | null; Toegestaan?: boolean | null }>;
};

type SectieForAssembly = SectionForOccupied & {
  externalId: string | null;
  titel: string;
  secties_fietstype?: Array<{
    Capaciteit: number | null;
    SectionBiketypeID: number;
    Toegestaan: boolean | null;
    BikeTypeID: number | null;
  }>;
};

type LocationRowWithSections = Omit<LocationRow, "fietsenstalling_secties"> & {
  fietsenstalling_secties: SectieForAssembly[];
  hasUniBikeTypePrices?: boolean | null;
  AantalReserveerbareKluizen?: number | null;
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

/** Assembles sections in memory from pre-joined rows. Bulk-fetches tariefregels and kostenperioden. */
async function assembleSectionsFromRows(
  rows: LocationRowWithSections[],
  depth: number
): Promise<ColdFusionSection[][]> {
  const allSectionBikeTypeIds: number[] = [];
  const uniSectieIds: number[] = [];
  for (const row of rows) {
    for (const s of row.fietsenstalling_secties ?? []) {
      for (const sf of s.secties_fietstype ?? []) {
        if (sf.SectionBiketypeID) allSectionBikeTypeIds.push(sf.SectionBiketypeID);
      }
      if (row.hasUniBikeTypePrices && s.sectieId) uniSectieIds.push(s.sectieId);
    }
  }

  const [tariefregelsBySbt, uniTariefregels, kostenperioden] = await Promise.all([
    allSectionBikeTypeIds.length > 0
      ? prisma.tariefregels.findMany({
          where: { sectionBikeTypeID: { in: allSectionBikeTypeIds } },
          orderBy: { index: "asc" },
        })
      : Promise.resolve([]),
    uniSectieIds.length > 0
      ? prisma.tariefregels.findMany({
          where: { sectieID: { in: uniSectieIds }, sectionBikeTypeID: null },
          orderBy: { index: "asc" },
        })
      : Promise.resolve([]),
    uniSectieIds.length > 0
      ? prisma.fietsenstalling_sectie_kostenperioden.findMany({
          where: { sectieId: { in: uniSectieIds } },
          orderBy: { index: "asc" },
        })
      : Promise.resolve([]),
  ]);

  const tariefBySbt = new Map<number, typeof tariefregelsBySbt>();
  for (const t of tariefregelsBySbt) {
    if (t.sectionBikeTypeID != null) {
      const arr = tariefBySbt.get(t.sectionBikeTypeID) ?? [];
      arr.push(t);
      tariefBySbt.set(t.sectionBikeTypeID, arr);
    }
  }
  const tariefByUniSectie = new Map<number, typeof uniTariefregels>();
  for (const t of uniTariefregels) {
    if (t.sectieID != null) {
      const arr = tariefByUniSectie.get(t.sectieID) ?? [];
      arr.push(t);
      tariefByUniSectie.set(t.sectieID, arr);
    }
  }
  const kostenBySectie = new Map<number, typeof kostenperioden>();
  for (const kp of kostenperioden) {
    if (kp.sectieId != null) {
      const arr = kostenBySectie.get(kp.sectieId) ?? [];
      arr.push(kp);
      kostenBySectie.set(kp.sectieId, arr);
    }
  }

  return rows.map((row) => {
    const secties = row.fietsenstalling_secties ?? [];
    return secties
      .filter((s) => s.externalId)
      .map((s) => {
        const data: Record<string, unknown> = {
          sectionid: s.externalId ?? "",
          name: s.titel,
        };
        if (row.Type === "fietskluizen" && row.AantalReserveerbareKluizen != null) {
          data.maxsubscriptions = row.AantalReserveerbareKluizen;
        }
        type SfRow = { SectionBiketypeID: number; Toegestaan: boolean | null; BikeTypeID: number | null; Capaciteit: number | null };
        const sft = (s.secties_fietstype ?? []) as SfRow[];
        if (sft.length > 0) {
          const mapped = sft.map((sf) => {
            const tr = tariefBySbt.get(sf.SectionBiketypeID);
            const rates = tr ? tr.map((t) => ({ timespan: t.tijdsspanne ?? 0, cost: Number(t.kosten ?? 0) })) : [];
            const allowed = sf.Toegestaan ?? false;
            const out: { allowed: boolean; biketypeid: number; rates: Array<{ timespan: number; cost: number }>; capacity?: number } = {
              allowed,
              biketypeid: sf.BikeTypeID ?? 0,
              rates,
            };
            if (allowed && sf.Capaciteit != null && sf.Capaciteit > 0) out.capacity = sf.Capaciteit;
            return out;
          });
          data.biketypes = mapped.sort((a, b) => a.biketypeid - b.biketypeid);
        }
        if (row.hasUniBikeTypePrices && s.sectieId) {
          const sectieTr = tariefByUniSectie.get(s.sectieId);
          const sectieKp = kostenBySectie.get(s.sectieId);
          const rates =
            sectieTr && sectieTr.length > 0
              ? sectieTr.map((t) => ({ timespan: t.tijdsspanne ?? 0, cost: Number(t.kosten ?? 0) }))
              : (sectieKp ?? []).map((kp) => ({
                  timespan: parseFloat(kp.tijdsspanne ?? "0") || 0,
                  cost: parseFloat(kp.kosten ?? "0") || 0,
                }));
          if (rates.length > 0) data.rates = rates;
        }
        return toSectionOrder(data) as ColdFusionSection;
      });
  });
}

type OcfResult = { occupied: number; capacity: number; free: number; includeCapacity: boolean };

/** Batched: runs shared queries once for all rows. Used by getLocationsFull. */
async function computeOccupiedCapacityFreeBatch(rows: LocationRow[]): Promise<OcfResult[]> {
  const allSectieIds = new Set<number>();
  for (const row of rows) {
    for (const s of row.fietsenstalling_secties ?? []) {
      allSectieIds.add(s.sectieId);
    }
  }
  const sectieIds = Array.from(allSectieIds);

  if (sectieIds.length === 0) {
    return rows.map((row) => {
      const fallback = row.Capacity ?? 0;
      return { occupied: 0, capacity: fallback, free: Math.max(0, fallback), includeCapacity: fallback > 0 };
    });
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayEnd = new Date(today);
  todayEnd.setDate(todayEnd.getDate() + 1);
  const sectieIdsBigInt = sectieIds.map((id) => BigInt(id));

  const exceptedIds = (
    await prisma.bulkreserveringuitzondering.findMany({
      where: { datum: { gte: today, lt: todayEnd } },
      select: { BulkreservationID: true },
    })
  )
    .map((e) => e.BulkreservationID)
    .filter((id): id is number => id != null);

  const [bulkreservations, allLockerPlaces] = await Promise.all([
    prisma.bulkreservering.findMany({
      where: {
        SectieID: { in: sectieIds },
        Startdatumtijd: { gte: today, lt: todayEnd },
        Einddatumtijd: { gte: new Date() },
        ...(exceptedIds.length > 0 && { ID: { notIn: exceptedIds } }),
      },
      select: { SectieID: true, Aantal: true },
      orderBy: { Startdatumtijd: "asc" },
    }),
    prisma.fietsenstalling_plek.findMany({
      where: { sectie_id: { in: sectieIdsBigInt } },
      select: { id: true, sectie_id: true, status: true },
    }),
  ]);

  const bulkBySectie = new Map<number, number>();
  for (const b of bulkreservations) {
    if (b.SectieID != null && !bulkBySectie.has(b.SectieID)) {
      bulkBySectie.set(b.SectieID, b.Aantal ?? 0);
    }
  }

  const hasPlacesSet = new Set(allLockerPlaces.map((p) => Number(p.sectie_id!)).filter(Boolean));
  const placeIds = allLockerPlaces.map((p) => p.id).filter((id): id is bigint => id != null);
  const openTxByPlaceId =
    placeIds.length > 0
      ? await prisma.transacties.findMany({
          where: { Date_checkout: null, PlaceID: { in: placeIds } },
          select: { PlaceID: true },
          distinct: ["PlaceID"],
        })
      : [];
  const openTxPlaceIdSet = new Set(
    openTxByPlaceId.map((r) => r.PlaceID).filter((id): id is bigint => id != null)
  );

  const occupiedBySectie = new Map<number, number>();
  for (const p of allLockerPlaces) {
    if (p.sectie_id == null) continue;
    const sid = Number(p.sectie_id);
    const occupiedByStatus = p.status != null && p.status % 10 !== 0;
    const occupiedByOpenTx = p.status == null && p.id != null && openTxPlaceIdSet.has(p.id);
    if (occupiedByStatus || occupiedByOpenTx) {
      occupiedBySectie.set(sid, (occupiedBySectie.get(sid) ?? 0) + 1);
    }
  }

  return rows.map((row) => computeOcfForRow(row, bulkBySectie, hasPlacesSet, occupiedBySectie));
}

function computeOcfForRow(
  row: LocationRow,
  bulkBySectie: Map<number, number>,
  hasPlacesSet: Set<number>,
  occupiedBySectie: Map<number, number>
): OcfResult {
  const secties = row.fietsenstalling_secties ?? [];
  if (!secties.length) {
    const fallback = row.Capacity ?? 0;
    return { occupied: 0, capacity: fallback, free: Math.max(0, fallback), includeCapacity: fallback > 0 };
  }

  let totalCapacityRaw = 0;
  let totalCapacityNetto = 0;
  let totalOccupied = 0;

  for (const s of secties) {
    // ColdFusion BikeparkSection.getCapacity(): sum of all sectionBikeTypes.Capaciteit (no Toegestaan filter).
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

  // ColdFusion: capacity = getNettoCapacity() (always sections minus bulk); free = getCapacity() - occupied.
  // getCapacity() returns fietsenstallingen.Capacity when set, else calculateCapacity() from sections.
  // capacity is NEVER from fietsenstallingen.Capacity - only free uses it when set.
  const capVal = row.Capacity != null ? Number(row.Capacity) : NaN;
  const stallingCapacitySet = !Number.isNaN(capVal) && capVal > 0;
  const capacity = totalCapacityNetto; // always getNettoCapacity()
  const capacityForFree = stallingCapacitySet ? capVal : totalCapacityRaw;
  const free = Math.max(0, capacityForFree - totalOccupied);
  const includeCapacity = totalCapacityRaw > 0 || (row.Capacity != null && row.Capacity > 0);
  return { occupied: totalOccupied, capacity, free, includeCapacity };
}

/** ColdFusion-compatible: capacity from secties_fietstype.Capaciteit; occupied from locker statuses (fietskluizen) or Bezetting; bulkreservations subtracted from capacity. */
async function computeOccupiedCapacityFree(row: LocationRow): Promise<OcfResult> {
  const [result] = await computeOccupiedCapacityFreeBatch([row]);
  return result!;
}

function buildColdFusionLocation(
  row: LocationRow,
  sections: ColdFusionSection[],
  ocf: { occupied: number; capacity: number; free: number; includeCapacity: boolean },
  includeSections = true,
  forV3Citycodes = false
): ColdFusionLocation {
  const { occupied: totalOccupied, capacity: totalCapacity, free, includeCapacity } = ocf;

  const [lat, long] = parseCoordinaten(row.Coordinaten);

  const openinghoursBase = buildOpeningHours(
    {
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
    },
    { locationType: row.Type }
  );
  // ColdFusion key order: opennow, periods, extrainfo (when present). V3 citycodes list: omit extrainfo.
  const openinghours =
    setIfExistsValue(row.Openingstijden) && row.Openingstijden
      ? { opennow: openinghoursBase.opennow, periods: openinghoursBase.periods, ...(!forV3Citycodes && { extrainfo: row.Openingstijden }) }
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
    ...(lat && { lat }),
    ...(long && { long }),
    // ColdFusion: occupied and free always; capacity only when getCapacity() > 0
    occupied: totalOccupied,
    free,
    ...(includeCapacity && { capacity: totalCapacity }),
    ...(!forV3Citycodes && { station: row.IsStationsstalling ?? false }),
    ...(!forV3Citycodes && exploitantname && { exploitantname }),
    ...(!forV3Citycodes && exploitantcontact && { exploitantcontact }),
    // ColdFusion sets sections only when depth > 1 (can be []). Omit for citycodes (org) response.
    ...(!forV3Citycodes && includeSections && { sections }),
    ...(!forV3Citycodes && services && { services }),
    ...(!forV3Citycodes && setIfExistsValue(row.Plaats) && { city: row.Plaats! }),
    ...(!forV3Citycodes && row.Location && { address: row.Location }),
    ...(!forV3Citycodes && setIfExistsValue(row.Postcode) && { postalcode: row.Postcode! }),
    ...(!forV3Citycodes && setIfExistsValue(row.OmschrijvingTarieven) && { costsdescription: row.OmschrijvingTarieven! }),
    ...(!forV3Citycodes && setIfExistsValue(row.Description) && { description: row.Description! }),
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

/** Key order for each location. Matches old API (locations list and locations/{id}). */
function toColdFusionLocationOrder(loc: ColdFusionLocation): ColdFusionLocation {
  const order = [
    "occupied",
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
    "locationid",
    "openinghours",
    "exploitantname",
    "postalcode",
    "costsdescription",
    "description",
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
  // Old API: citycodes/{citycode}/locations includes sections when depth > 1 (BaseRestService getLocation line 391).
  return getLocationsFull(citycode, options);
}

export async function getLocation(
  citycode: string,
  locationid: string,
  depth = 2
): Promise<ColdFusionLocation | null> {
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
          secties_fietstype: { select: { Capaciteit: true, Toegestaan: true } },
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
    ocf,
    depth >= 2
  );
}

export async function getSections(
  citycode: string,
  locationid: string,
  depth = 2
): Promise<SectionSummary[]> {
  const t0 = timeStart(`getSections ${locationid}`);
  const tFind = timeStart(`getSections ${locationid} findMany secties`);
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
  timeEnd(`getSections ${locationid} findMany secties`, tFind);
  const tGetSection = timeStart(`getSections ${locationid} getSection x${secties.filter((s) => s.externalId).length}`);
  const sections = await Promise.all(
    secties
      .filter((s) => s.externalId)
      .map((s) => getSection(citycode, locationid, s.externalId!, depth - 1))
  );
  timeEnd(`getSections ${locationid} getSection x${secties.filter((s) => s.externalId).length}`, tGetSection);
  timeEnd(`getSections ${locationid}`, t0);
  return sections.filter((s): s is SectionSummary => s != null);
}

export async function getSection(
  citycode: string,
  locationid: string,
  sectionid: string,
  depth = 2
): Promise<SectionSummary | null> {
  const t0 = timeStart(`getSection ${locationid}/${sectionid}`);
  const tFind = timeStart(`getSection ${locationid}/${sectionid} findFirst`);
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
  timeEnd(`getSection ${locationid}/${sectionid} findFirst`, tFind);
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
    const tTarief = timeStart(`getSection ${locationid}/${sectionid} tariefregels`);
    const tariefregels = await prisma.tariefregels.findMany({
      where: { sectionBikeTypeID: { in: sectionBikeTypeIds } },
      orderBy: { index: "asc" },
    });
    timeEnd(`getSection ${locationid}/${sectionid} tariefregels`, tTarief);
    const tariefBySbt = new Map<number, typeof tariefregels>();
    for (const t of tariefregels) {
      if (t.sectionBikeTypeID != null) {
        const arr = tariefBySbt.get(t.sectionBikeTypeID) ?? [];
        arr.push(t);
        tariefBySbt.set(t.sectionBikeTypeID, arr);
      }
    }

    const mapped = sectie.secties_fietstype.map((sf) => {
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
    data.biketypes = mapped.sort((a, b) => a.biketypeid - b.biketypeid);
  }

  if (depth > 1) {
    const tPlaces = timeStart(`getSection ${locationid}/${sectionid} getPlaces`);
    const places = await getPlaces(citycode, locationid, sectionid);
    timeEnd(`getSection ${locationid}/${sectionid} getPlaces`, tPlaces);
    if (places.length > 0) data.places = places;
  }

  if (stalling?.hasUniBikeTypePrices) {
    const tUni = timeStart(`getSection ${locationid}/${sectionid} uniBikeTypePrices`);
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
    timeEnd(`getSection ${locationid}/${sectionid} uniBikeTypePrices`, tUni);
    if (rates.length > 0) data.rates = rates;
  }

  timeEnd(`getSection ${locationid}/${sectionid}`, t0);
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
    select: { id: true, titel: true, status: true, dateLastStatusUpdate: true },
  });
  return plekken.map((p) => {
    const status = p.status ?? 0;
    const statuscode = typeof status === "number" ? status % 10 : 0;
    const datelaststatusupdate = p.dateLastStatusUpdate
      ? p.dateLastStatusUpdate instanceof Date
        ? p.dateLastStatusUpdate.toISOString().slice(0, 19)
        : String(p.dateLastStatusUpdate).slice(0, 19)
      : "";
    return {
      datelaststatusupdate,
      statuscode,
      name: p.titel ?? undefined,
      id: Number(p.id),
    };
  });
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

  const filteredLinks = links.filter((l) => {
    const bt = l.abonnementsvormen?.bikeparkTypeID;
    return !bt || bt === stalling.Type;
  });
  const subscriptionIds = filteredLinks.map((l) => l.SubscriptiontypeID);

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

  const result = filteredLinks
    .map((l) => {
      const av = l.abonnementsvormen!;
      const biketypes = biketypesBySub.get(l.SubscriptiontypeID) ?? [];
      return toColdFusionSubscriptionTypeOrder({
        id: av.ID,
        name: av.naam ?? undefined,
        price: av.prijs ? Number(av.prijs) : undefined,
        duration: av.tijdsduur ?? undefined,
        locationtype: (av.bikeparkTypeID ?? stalling.Type) ?? undefined,
        biketypes: [...new Set(biketypes)].sort((a, b) => a - b),
        idtypes: idmiddelenToIdTypes(av.idmiddelen),
      });
    })
    .sort((a, b) => a.id - b.id);
  return result;
}

/** ColdFusion REST.Subscriptiontype key order: price, duration, locationtype, biketypes, idtypes, name, id */
function toColdFusionSubscriptionTypeOrder(
  s: ColdFusionSubscriptionType
): ColdFusionSubscriptionType {
  return {
    price: s.price,
    duration: s.duration,
    locationtype: s.locationtype,
    biketypes: s.biketypes,
    idtypes: s.idtypes,
    name: s.name,
    id: s.id,
  };
}
