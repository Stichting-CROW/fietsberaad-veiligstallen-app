import { prisma } from "~/server/db";
import { buildOpeningHours } from "./fms-v3-openinghours";

const FMS_TIMING = false;

/**
 * In-memory cache for citycodes/{citycode}. 0 = no caching. Disabled in development.
 * 30 minutes in production (matches ColdFusion getCities).
 *
 * Cached versions may have different fields than the request: the cache stores the full
 * response for a given (citycode, depth). A subsequent request with different query
 * parameters (e.g. fields) within the TTL will receive the cached response, which may
 * include or omit fields based on the first request that populated the cache.
 */
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
  sectionid: string | null;
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
  occupationsource?: string | null;
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
  thirdpartyreservationsurl?: string;
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
  sectionid: string | null;
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

/** ColdFusion-compatible place format: datelaststatusupdate (only when set), statuscode, name, id. statuscode = status % 10 (0=vrij, 1=bezet, 2=abonnement, 3=gereserveerd, 4=buiten werking). */
export type PlaceSummary = {
  datelaststatusupdate?: string;
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
      ID: true,
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
      thirdPartyReservationsUrl: true,
      Url: true,
      Beheerder: true,
      BeheerderContact: true,
      ExtraServices: true,
      Openingstijden: true,
      hasUniBikeTypePrices: true,
      hasUniSectionPrices: true,
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
            orderBy: { SectionBiketypeID: "asc" },
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
  ID?: string;
  fietsenstalling_secties: SectieForAssembly[];
  hasUniBikeTypePrices?: boolean | null;
  hasUniSectionPrices?: boolean | null;
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
  thirdPartyReservationsUrl?: string | null;
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
  const stallingsNeedingStallingBiketypes: string[] = [];
  const uniSectieIds: number[] = [];
  const stallingIdsForUniRates: string[] = [];
  for (const row of rows) {
    for (const s of row.fietsenstalling_secties ?? []) {
      for (const sf of s.secties_fietstype ?? []) {
        if (sf.SectionBiketypeID) allSectionBikeTypeIds.push(sf.SectionBiketypeID);
      }
      if (row.hasUniBikeTypePrices && s.sectieId) uniSectieIds.push(s.sectieId);
    }
    if (row.hasUniSectionPrices && !row.hasUniBikeTypePrices && row.ID) {
      stallingsNeedingStallingBiketypes.push(row.ID);
    }
    if (row.hasUniBikeTypePrices && row.hasUniSectionPrices && row.ID) {
      stallingIdsForUniRates.push(row.ID);
    }
  }

  const stallingSftByStalling =
    stallingsNeedingStallingBiketypes.length > 0
      ? await prisma.sectie_fietstype.findMany({
          where: { StallingsID: { in: stallingsNeedingStallingBiketypes }, sectieID: null },
          orderBy: { SectionBiketypeID: "asc" },
          select: { SectionBiketypeID: true, BikeTypeID: true, StallingsID: true },
        })
      : [];
  const stallingSectionBikeTypeIds = stallingSftByStalling.map((s) => s.SectionBiketypeID);
  const allSbtIds = [...new Set([...allSectionBikeTypeIds, ...stallingSectionBikeTypeIds])];

  const [tariefregelsBySbt, uniTariefregels, kostenperioden, stallingTariefregels] = await Promise.all([
    allSbtIds.length > 0
      ? prisma.tariefregels.findMany({
          where: { sectionBikeTypeID: { in: allSbtIds } },
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
    stallingIdsForUniRates.length > 0
      ? prisma.tariefregels.findMany({
          where: { stallingsID: { in: stallingIdsForUniRates }, sectieID: null, sectionBikeTypeID: null },
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
  const sbtToBikeTypeByStalling = new Map<string, Map<number, number>>();
  for (const sft of stallingSftByStalling) {
    if (sft.StallingsID && sft.BikeTypeID != null) {
      let m = sbtToBikeTypeByStalling.get(sft.StallingsID);
      if (!m) {
        m = new Map();
        sbtToBikeTypeByStalling.set(sft.StallingsID, m);
      }
      m.set(sft.SectionBiketypeID, sft.BikeTypeID);
    }
  }
  const tariefByBikeTypeIdByStalling = new Map<string, Map<number, typeof tariefregelsBySbt>>();
  for (const stallingId of stallingsNeedingStallingBiketypes) {
    const sbtToBikeType = sbtToBikeTypeByStalling.get(stallingId);
    if (sbtToBikeType) {
      const byBikeType = new Map<number, typeof tariefregelsBySbt>();
      for (const [sbtId, bikeTypeId] of sbtToBikeType) {
        const tr = tariefBySbt.get(sbtId);
        if (tr && tr.length > 0) byBikeType.set(bikeTypeId, tr);
      }
      if (byBikeType.size > 0) tariefByBikeTypeIdByStalling.set(stallingId, byBikeType);
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
  const tariefByStalling = new Map<string, typeof stallingTariefregels>();
  for (const t of stallingTariefregels) {
    if (t.stallingsID) {
      const arr = tariefByStalling.get(t.stallingsID) ?? [];
      arr.push(t);
      tariefByStalling.set(t.stallingsID, arr);
    }
  }

  return rows.map((row) => {
    const secties = (row.fietsenstalling_secties ?? []).slice().sort((a, b) => a.sectieId - b.sectieId);
    return secties.map((s) => {
        const data: Record<string, unknown> = {
          sectionid: s.externalId ?? null,
          name: s.titel,
        };
        if (row.Type === "fietskluizen" && row.AantalReserveerbareKluizen != null) {
          data.maxsubscriptions = row.AantalReserveerbareKluizen;
        }
        const DEF_TS = 24;
        const toRateLoc = (t: { tijdsspanne: number | null; kosten: unknown }): { timespan: number; cost: number } => {
          const cost = Number(t.kosten ?? 0);
          const ts = t.tijdsspanne;
          return { timespan: ts != null && ts > 0 ? ts : DEF_TS, cost: Number.isFinite(cost) ? cost : 0 };
        };
        const toRateOrNullLoc = (t: { tijdsspanne: number | null; kosten: unknown }): { timespan: number; cost: number } | null => {
          if (t.tijdsspanne == null && t.kosten == null) return null;
          return toRateLoc(t);
        };
        const toRateFromKp = (kp: { tijdsspanne: string | null; kosten: string | null }): { timespan: number; cost: number } | null => {
          const tsStr = kp.tijdsspanne ?? "";
          const costStr = kp.kosten ?? "";
          if (!tsStr.trim() && !costStr.trim()) return null;
          const ts = parseFloat(tsStr);
          return { timespan: ts > 0 ? ts : DEF_TS, cost: parseFloat(costStr) || 0 };
        };
        type RateOrNullLoc = { timespan: number; cost: number } | null;
        const toRatesArr = (raw: RateOrNullLoc[]): RateOrNullLoc[] =>
          raw.length === 0 ? [null, null, null] : raw;

        let sectionRates: RateOrNullLoc[] | null = null;
        if (row.hasUniBikeTypePrices) {
          const sectieTr = s.sectieId ? tariefByUniSectie.get(s.sectieId) : null;
          const sectieKp = s.sectieId ? kostenBySectie.get(s.sectieId) : null;
          const fromSectie =
            sectieTr && sectieTr.length > 0
              ? sectieTr.map(toRateOrNullLoc)
              : (sectieKp ?? []).map(toRateFromKp);
          if (fromSectie.some((r) => r != null)) {
            sectionRates = fromSectie;
          } else if (row.hasUniSectionPrices && row.ID) {
            const stallingTr = tariefByStalling.get(row.ID);
            sectionRates = stallingTr && stallingTr.length > 0 ? stallingTr.map(toRateOrNullLoc) : null;
          }
          if (sectionRates && sectionRates.some((r) => r != null)) {
            data.rates = sectionRates.filter((r): r is { timespan: number; cost: number } => r != null);
          }
        }

        type SfRow = { SectionBiketypeID: number; Toegestaan: boolean | null; BikeTypeID: number | null; Capaciteit: number | null };
        const sft = (s.secties_fietstype ?? []) as SfRow[];
        if (sft.length > 0) {
          const useStallingBiketypes = row.hasUniSectionPrices && !row.hasUniBikeTypePrices && row.ID;
        const mapped = sft.map((sf) => {
            const rates: Array<{ timespan: number; cost: number } | null> =
              sectionRates && sectionRates.length > 0
                ? toRatesArr(sectionRates)
                : (() => {
                    const tr = useStallingBiketypes
                      ? tariefByBikeTypeIdByStalling.get(row.ID!)?.get(sf.BikeTypeID ?? 0)
                      : tariefBySbt.get(sf.SectionBiketypeID);
                    const fromTr = tr ? tr.map(toRateOrNullLoc) : [];
                    return fromTr.length > 0 ? toRatesArr(fromTr) : [null, null, null];
                  })();
            const allowed = sf.Toegestaan ?? false;
            const out: { allowed: boolean; biketypeid: number; rates: Array<{ timespan: number; cost: number } | null>; capacity?: number } = {
              allowed,
              biketypeid: sf.BikeTypeID ?? 0,
              rates,
            };
            if (allowed && sf.Capaciteit != null && sf.Capaciteit > 0) out.capacity = sf.Capaciteit;
            return out;
          });
          data.biketypes = mapped;
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
  // getCapacity() returns fietsenstallingen.Capacity when "set and numeric", else calculateCapacity() from sections.
  // "Set and numeric" includes 0: when Capacity=0, old API uses 0 for capacityForFree → free=0.
  const capVal = row.Capacity != null ? Number(row.Capacity) : NaN;
  const stallingCapacitySet = row.Capacity != null && !Number.isNaN(capVal);
  const capacity = totalCapacityNetto; // always getNettoCapacity()
  const capacityForFree = stallingCapacitySet ? capVal : totalCapacityRaw;
  const free = Math.max(0, capacityForFree - totalOccupied);
  // ColdFusion: capacity only when bikepark.getCapacity() > 0 (omit when Capacity=0)
  const includeCapacity = capacityForFree > 0;
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
    occupationsource: row.BronBezettingsdata ?? null,
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
    ...(!forV3Citycodes && setIfExistsValue(row.thirdPartyReservationsUrl) && { thirdpartyreservationsurl: row.thirdPartyReservationsUrl! }),
    ...(!forV3Citycodes && setIfExistsValue(row.Description) && { description: row.Description! }),
  };
  return toColdFusionLocationOrder(loc);
}

/** Old API format for locations/{locationid} single-section: section data only, not full location. */
export type LocationDetailSingleSection = {
  sectionid: string | null;
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
    "thirdpartyreservationsurl",
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

/**
 * StallingsID (locationid) is globally unique. Prisma schema: @unique(map: "idxstallingsid") on fietsenstallingen.
 * DB enforces uniqueness; lookups use locationid only (no citycode).
 */
export async function getLocation(
  locationid: string,
  depth = 2
): Promise<ColdFusionLocation | null> {
  const stalling = await prisma.fietsenstallingen.findFirst({
    where: {
      StallingsID: locationid,
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
      thirdPartyReservationsUrl: true,
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
  const sections = await getSections(locationid, depth);
  const ocf = await computeOccupiedCapacityFree(stalling as LocationRow);
  return buildColdFusionLocation(
    stalling as LocationRow,
    sections as ColdFusionSection[],
    ocf,
    depth >= 2
  );
}

export async function getSections(
  locationid: string,
  depth = 2
): Promise<SectionSummary[]> {
  const t0 = timeStart(`getSections ${locationid}`);
  const tFind = timeStart(`getSections ${locationid} findMany secties`);
  const secties = await prisma.fietsenstalling_sectie.findMany({
    where: {
      fietsenstalling: {
        StallingsID: locationid,
        Status: "1",
      },
      /* ColdFusion getBikeparkSections has no isactief filter – include all sections */
    },
    select: { sectieId: true, externalId: true },
    orderBy: { sectieId: "asc" },
  });
  timeEnd(`getSections ${locationid} findMany secties`, tFind);
  const tGetSection = timeStart(`getSections ${locationid} getSection x${secties.length}`);
  const sections = await Promise.all(
    secties.map((s) =>
      s.externalId
        ? getSection(locationid, s.externalId, depth - 1)
        : getSectionBySectieId(locationid, s.sectieId, depth - 1)
    )
  );
  timeEnd(`getSections ${locationid} getSection x${secties.length}`, tGetSection);
  timeEnd(`getSections ${locationid}`, t0);
  return sections.filter((s): s is SectionSummary => s != null);
}

/** Section for secties without externalId. ColdFusion getBikeparkSections includes all sections; sectionid is null when no externalId. */
async function getSectionBySectieId(
  locationid: string,
  sectieId: number,
  depth = 2
): Promise<SectionSummary | null> {
  const sectie = await prisma.fietsenstalling_sectie.findFirst({
    where: {
      sectieId,
      fietsenstalling: {
        StallingsID: locationid,
        Status: "1",
      },
    },
    include: {
      fietsenstalling: {
        select: {
          ID: true,
          BronBezettingsdata: true,
          hasUniBikeTypePrices: true,
          hasUniSectionPrices: true,
          Type: true,
          AantalReserveerbareKluizen: true,
        },
      },
      secties_fietstype: {
        orderBy: { SectionBiketypeID: "asc" },
        include: { fietstype: { select: { ID: true } } },
      },
    },
  });
  if (!sectie) return null;
  return buildSectionFromSectie(sectie, depth, locationid, null);
}

export async function getSection(
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
        Status: "1",
      },
    },
    include: {
      fietsenstalling: {
        select: {
          ID: true,
          BronBezettingsdata: true,
          hasUniBikeTypePrices: true,
          hasUniSectionPrices: true,
          Type: true,
          AantalReserveerbareKluizen: true,
        },
      },
      secties_fietstype: {
        orderBy: { SectionBiketypeID: "asc" },
        include: { fietstype: { select: { ID: true } } },
      },
    },
  });
  timeEnd(`getSection ${locationid}/${sectionid} findFirst`, tFind);
  if (!sectie) return null;
  timeEnd(`getSection ${locationid}/${sectionid}`, t0);
  return buildSectionFromSectie(sectie, depth, locationid, sectionid);
}

type SectieWithRelations = Awaited<
  ReturnType<
    typeof prisma.fietsenstalling_sectie.findFirst<{
      include: {
        fietsenstalling: { select: { ID: true; hasUniBikeTypePrices: true; hasUniSectionPrices: true; Type: true; AantalReserveerbareKluizen: true } };
        secties_fietstype: { include: { fietstype: { select: { ID: true } } } };
      };
    }>
  >
>;

async function buildSectionFromSectie(
  sectie: NonNullable<SectieWithRelations>,
  depth: number,
  locationid: string,
  sectionidForLookup: string | null
): Promise<SectionSummary> {
  const stalling = sectie.fietsenstalling;
  const data: Record<string, unknown> = {};
  data.sectionid = sectionidForLookup;
  data.name = sectie.titel;
  /* ColdFusion: maxsubscriptions only when Type eq "fietskluizen"; capacity/occupation/free/occupationsource only when fields; places when depth>1 and hasPlace; rates when hasUniBiketypePrices */

  if (stalling?.Type === "fietskluizen" && stalling.AantalReserveerbareKluizen != null) {
    data.maxsubscriptions = stalling.AantalReserveerbareKluizen;
  }

  /* ColdFusion: each biketype gets rates from section.getCostPeriods(biketype). When hasUniBikeTypePrices, same rates apply to all biketypes. Rates can be at section-level (sectieID) or stalling-level (stallingsID, sectieID=null) when hasUniSectionPrices. */
  /* Old API uses timespan 24 (hours) when tijdsspanne is null/0; rates array can have null for empty slots. */
  const DEFAULT_TIMESPAN = 24;
  const toRate = (t: { tijdsspanne: number | null; kosten: unknown }): { timespan: number; cost: number } => {
    const cost = Number(t.kosten ?? 0);
    const ts = t.tijdsspanne;
    const timespan = ts != null && ts > 0 ? ts : DEFAULT_TIMESPAN;
    return { timespan, cost: Number.isFinite(cost) ? cost : 0 };
  };
  const toRateFromKostenperiode = (kp: { tijdsspanne: string | null; kosten: string | null }): { timespan: number; cost: number } | null => {
    const tsStr = kp.tijdsspanne ?? "";
    const costStr = kp.kosten ?? "";
    if (!tsStr.trim() && !costStr.trim()) return null;
    const ts = parseFloat(tsStr);
    const timespan = ts > 0 ? ts : DEFAULT_TIMESPAN;
    const cost = parseFloat(costStr) || 0;
    return { timespan, cost };
  };
  const toRateOrNull = (t: { tijdsspanne: number | null; kosten: unknown }): { timespan: number; cost: number } | null => {
    if (t.tijdsspanne == null && t.kosten == null) return null;
    return toRate(t);
  };

  type RateOrNull = { timespan: number; cost: number } | null;
  let sectionLevelRates: RateOrNull[] | null = null;
  if (stalling?.hasUniBikeTypePrices) {
    const tUni = timeStart(`getSection ${locationid}/${sectionidForLookup ?? sectie.sectieId} uniBikeTypePrices`);
    /* ColdFusion BikeparkSection.getCostPeriods: hasUniSectionPrices is checked first; when true, rates come from Bikepark (stallingsID). */
    const sectieWhere = sectionidForLookup
      ? {
          OR: [
            { sectieID: sectie.sectieId, sectionBikeTypeID: null },
            { truncatedSectieID: sectionidForLookup, sectionBikeTypeID: null },
          ],
        }
      : { sectieID: sectie.sectieId, sectionBikeTypeID: null };
    const stallingWhere = { stallingsID: stalling.ID, sectieID: null, sectionBikeTypeID: null };
    if (stalling?.hasUniSectionPrices && stalling?.ID) {
      const stallingTariefregels = await prisma.tariefregels.findMany({
        where: stallingWhere,
        orderBy: { index: "asc" },
      });
      if (stallingTariefregels.length > 0) {
        sectionLevelRates = stallingTariefregels.map(toRateOrNull);
      }
    }
    if (!sectionLevelRates || sectionLevelRates.length === 0) {
      const sectieTariefregels = await prisma.tariefregels.findMany({
        where: sectieWhere,
        orderBy: { index: "asc" },
      });
      const kostenperioden = await prisma.fietsenstalling_sectie_kostenperioden.findMany({
        where: { sectieId: sectie.sectieId },
        orderBy: { index: "asc" },
      });
      sectionLevelRates =
        sectieTariefregels.length > 0
          ? sectieTariefregels.map(toRateOrNull)
          : kostenperioden.map(toRateFromKostenperiode);
      if (sectionLevelRates.length === 0 && stalling?.hasUniSectionPrices && stalling?.ID) {
        const stallingTariefregels = await prisma.tariefregels.findMany({
          where: stallingWhere,
          orderBy: { index: "asc" },
        });
        sectionLevelRates = stallingTariefregels.length > 0 ? stallingTariefregels.map(toRateOrNull) : null;
      }
    }
    timeEnd(`getSection ${locationid}/${sectionidForLookup ?? sectie.sectieId} uniBikeTypePrices`, tUni);
    const hasRates = sectionLevelRates && sectionLevelRates.some((r) => r != null);
    if (hasRates && sectionLevelRates) data.rates = sectionLevelRates.filter((r): r is { timespan: number; cost: number } => r != null);
  }

  if (sectie.secties_fietstype.length > 0) {
    const tariefBySbt = new Map<number, { tijdsspanne: number | null; kosten: unknown }[]>();
    const tariefByBikeTypeId = new Map<number, { tijdsspanne: number | null; kosten: unknown }[]>();

    if (!stalling?.hasUniBikeTypePrices) {
      const tTarief = timeStart(`getSection ${locationid}/${sectionidForLookup ?? sectie.sectieId} tariefregels`);
      /* ColdFusion: when hasUniSectionPrices, rates come from stalling-level SectionBikeTypes (sectie_fietstype with StallingsID, sectieID null), not section-level. */
      const useStallingBiketypes = stalling?.hasUniSectionPrices && stalling?.ID;
      let sectionBikeTypeIds: number[];
      let stallingSft: { SectionBiketypeID: number; BikeTypeID: number | null }[] = [];
      if (useStallingBiketypes) {
        stallingSft = await prisma.sectie_fietstype.findMany({
          where: { StallingsID: stalling!.ID, sectieID: null },
          orderBy: { SectionBiketypeID: "asc" },
          select: { SectionBiketypeID: true, BikeTypeID: true },
        });
        sectionBikeTypeIds = stallingSft.map((sft) => sft.SectionBiketypeID);
      } else {
        sectionBikeTypeIds = sectie.secties_fietstype.map((sf) => sf.SectionBiketypeID);
      }

      const tariefregels = await prisma.tariefregels.findMany({
        where: { sectionBikeTypeID: { in: sectionBikeTypeIds } },
        orderBy: { index: "asc" },
      });
      timeEnd(`getSection ${locationid}/${sectionidForLookup ?? sectie.sectieId} tariefregels`, tTarief);

      if (useStallingBiketypes) {
        const sbtToBikeType = new Map(stallingSft.map((s) => [s.SectionBiketypeID, s.BikeTypeID]));
        for (const t of tariefregels) {
          if (t.sectionBikeTypeID != null) {
            const bikeTypeId = sbtToBikeType.get(t.sectionBikeTypeID);
            if (bikeTypeId != null) {
              const arr = tariefByBikeTypeId.get(bikeTypeId) ?? [];
              arr.push(t);
              tariefByBikeTypeId.set(bikeTypeId, arr);
            }
          }
        }
      } else {
        for (const t of tariefregels) {
          if (t.sectionBikeTypeID != null) {
            const arr = tariefBySbt.get(t.sectionBikeTypeID) ?? [];
            arr.push(t);
            tariefBySbt.set(t.sectionBikeTypeID, arr);
          }
        }
      }
    }

    let sectionLevelFallback: RateOrNull[] | null = null;
    if ((!sectionLevelRates || sectionLevelRates.length === 0) && !stalling?.hasUniBikeTypePrices) {
      const sectieTariefWhere = sectionidForLookup
        ? { OR: [{ sectieID: sectie.sectieId, sectionBikeTypeID: null }, { truncatedSectieID: sectionidForLookup, sectionBikeTypeID: null }] }
        : { sectieID: sectie.sectieId, sectionBikeTypeID: null };
      const sectieTarief = await prisma.tariefregels.findMany({
        where: sectieTariefWhere,
        orderBy: { index: "asc" },
      });
      const kostenperiodenFallback = await prisma.fietsenstalling_sectie_kostenperioden.findMany({
        where: { sectieId: sectie.sectieId },
        orderBy: { index: "asc" },
      });
      const fromSectie =
        sectieTarief.length > 0
          ? sectieTarief.map(toRateOrNull)
          : kostenperiodenFallback.map(toRateFromKostenperiode);
      if (fromSectie.some((r) => r != null)) {
        sectionLevelFallback = fromSectie;
      } else if (stalling?.hasUniSectionPrices && stalling?.ID) {
        const stallingTarief = await prisma.tariefregels.findMany({
          where: { stallingsID: stalling.ID, sectieID: null, sectionBikeTypeID: null },
          orderBy: { index: "asc" },
        });
        sectionLevelFallback = stallingTarief.length > 0 ? stallingTarief.map(toRateOrNull) : null;
      }
    }

    const toRatesArray = (raw: RateOrNull[] | Array<{ timespan: number; cost: number }>): Array<{ timespan: number; cost: number } | null> => {
      const arr = raw as RateOrNull[];
      if (arr.length === 0) return [null, null, null];
      return arr;
    };

    const mapped = sectie.secties_fietstype.map((sf) => {
      let rates: Array<{ timespan: number; cost: number } | null>;
      if (sectionLevelRates && sectionLevelRates.length > 0) {
        rates = toRatesArray(sectionLevelRates);
      } else {
        const tr =
          tariefByBikeTypeId.size > 0
            ? tariefByBikeTypeId.get(sf.BikeTypeID ?? 0)
            : tariefBySbt.get(sf.SectionBiketypeID);
        const fromTr = tr ? tr.map(toRateOrNull) : [];
        if (fromTr.length > 0) {
          rates = toRatesArray(fromTr);
        } else if (sectionLevelFallback && sectionLevelFallback.length > 0) {
          rates = sectionLevelFallback;
        } else {
          rates = [null, null, null];
        }
      }
      const allowed = sf.Toegestaan ?? false;
      const out: { allowed: boolean; biketypeid: number; rates: Array<{ timespan: number; cost: number } | null>; capacity?: number } = {
        allowed,
        biketypeid: sf.BikeTypeID ?? 0,
        rates,
      };
      if (allowed && sf.Capaciteit != null && sf.Capaciteit > 0) {
        out.capacity = sf.Capaciteit;
      }
      return out;
    });
    data.biketypes = mapped;
  }

  if (depth > 1) {
    const tPlaces = timeStart(`getSection ${locationid}/${sectionidForLookup ?? sectie.sectieId} getPlaces`);
    const places = sectionidForLookup
      ? await getPlaces(locationid, sectionidForLookup)
      : await getPlacesBySectieId(locationid, sectie.sectieId);
    timeEnd(`getSection ${locationid}/${sectionidForLookup ?? sectie.sectieId} getPlaces`, tPlaces);
    if (places.length > 0) data.places = places;
  }

  return toSectionOrder(data) as SectionSummary;
}

/** Key order for section response. Matches old API (BaseRestService.getSection): maxsubscriptions, sectionid, name, biketypes, places, rates. */
function toSectionOrder(obj: Record<string, unknown>): Record<string, unknown> {
  const order = ["maxsubscriptions", "sectionid", "name", "biketypes", "places", "rates"];
  const out: Record<string, unknown> = {};
  for (const k of order) {
    if (k in obj && obj[k] !== undefined) out[k] = obj[k];
  }
  return out;
}

export async function getPlaces(
  locationid: string,
  sectionid: string
): Promise<PlaceSummary[]> {
  const sectie = await prisma.fietsenstalling_sectie.findFirst({
    where: {
      externalId: sectionid,
      fietsenstalling: {
        StallingsID: locationid,
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
    const datelaststatusupdate =
      p.dateLastStatusUpdate != null
        ? p.dateLastStatusUpdate instanceof Date
          ? p.dateLastStatusUpdate.toISOString().slice(0, 19)
          : String(p.dateLastStatusUpdate).slice(0, 19)
        : undefined;
    // ColdFusion getPlace: id, name, datelaststatusupdate (only when IsDate), statuscode
    const place: PlaceSummary = {
      id: Number(p.id),
      name: p.titel ?? undefined,
      ...(datelaststatusupdate != null && { datelaststatusupdate }),
      statuscode,
    };
    return place;
  });
}

/** Places for secties without externalId (lookup by sectieId). */
async function getPlacesBySectieId(
  locationid: string,
  sectieId: number
): Promise<PlaceSummary[]> {
  const sectie = await prisma.fietsenstalling_sectie.findFirst({
    where: {
      sectieId,
      fietsenstalling: {
        StallingsID: locationid,
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
    const datelaststatusupdate =
      p.dateLastStatusUpdate != null
        ? p.dateLastStatusUpdate instanceof Date
          ? p.dateLastStatusUpdate.toISOString().slice(0, 19)
          : String(p.dateLastStatusUpdate).slice(0, 19)
        : undefined;
    const place: PlaceSummary = {
      id: Number(p.id),
      name: p.titel ?? undefined,
      ...(datelaststatusupdate != null && { datelaststatusupdate }),
      statuscode,
    };
    return place;
  });
}

export async function getSubscriptionTypes(
  locationid: string
): Promise<ColdFusionSubscriptionType[]> {
  const stalling = await prisma.fietsenstallingen.findFirst({
    where: {
      StallingsID: locationid,
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
