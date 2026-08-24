/**
 * Occupation (bezettingsdata) reporting, ported from the ColdFusion
 * v2_occupation.cfc + v1_reportingservice.cfc (getLocationsForUser) +
 * reports_json_datastandaard.cfc (bezetting/query2datastandaard) +
 * reports.cfc (getQBezettingDatastandaard/totalHitsBezetting).
 *
 * Serves /api/reporting/occupation/* (old: /rest/reporting/v2/occupation/*).
 */
import { prisma } from "~/server/db";
import { formatCfDbDateTime } from "~/server/services/fms/fms-idtypes";
import type { ReportingAuthResult } from "~/server/services/reporting/reporting-auth";

type ReportingAuth = Extract<ReportingAuthResult, { ok: true }>;

/** Hardcoded organisations from v2_occupation.cfc (variables.organisations). */
export const OCCUPATION_ORGANISATIONS: { id: string; name: string }[] = [
  { id: "veiligstallen", name: "VeiligStallen" },
  { id: "lumiguide", name: "Lumiguide" },
  { id: "ustal", name: "U-stal" },
  { id: "prorail", name: "Prorail" },
  { id: "fms", name: "FMS" },
  { id: "crow", name: "CROW" },
];

export interface OccupationSurvey {
  id: string | null;
  name: string | null;
  authorityId: string | null;
}

export interface OccupationLocation {
  locationid: string;
  name: string | null;
  type: string | null;
  coordinates: string | null;
  occupationSource: string | null;
}

export interface OccupationCity {
  citycode: string | null;
  name: string | null;
  locations: OccupationLocation[];
}

export interface StaticSection {
  id: string;
  name: string | null;
  geoLocation?: { coordinates: [number, number]; type: "Point" };
  contractorIds: string[];
  authorityIds: (string | null)[];
  surveyIds: (string | null)[];
}

export interface StaticDataResult {
  result: StaticSection[];
  totalHits: number;
}

export interface DynamicSubsection {
  id?: string;
  deltas?: { periodInMinutes: number; arrivals: number; departures: number };
  parkingCapacity?: number;
  occupiedSpaces?: number;
  vacantSpaces?: number;
}

export interface DynamicSectionRecord {
  staticSectionId: string;
  timestamp: string;
  contractorId: string;
  authorityId: string | null;
  surveyId: string | null;
  note: { isOpen: boolean };
  occupiedSpaces?: number;
  parkingCapacity?: number;
  vacantSpaces?: number;
  traffic?: { periodInMinutes: number; arrivals: number; departures: number };
  sections?: DynamicSubsection[];
}

export interface DynamicDataPage {
  result: DynamicSectionRecord[];
  totalHits: number;
  page: number;
  pageSize: number;
}

export interface DynamicDataGrouped {
  result: DynamicDataPage[];
}

/** CF: types excluded in getLocationsForUser (ListFindNoCase). */
const EXCLUDED_BIKEPARK_TYPES = ["buurtstalling", "fietstrommel"];

/**
 * All gemeenten in the 'fms' module (CF: application.service.getModule('fms').getCouncils()),
 * ordered by CompanyName (ORM orderby="companyName").
 */
export async function getFmsCouncils(): Promise<
  { ID: string; ZipID: string | null; CompanyName: string | null }[]
> {
  return prisma.contacts.findMany({
    where: { modules_contacts: { some: { ModuleID: "fms" } } },
    select: { ID: true, ZipID: true, CompanyName: true },
    orderBy: { CompanyName: "asc" },
  });
}

/** Surveys, CF getSurveys: all FMS-module councils (unscoped). */
export async function getSurveys(): Promise<OccupationSurvey[]> {
  const councils = await getFmsCouncils();
  return councils.map((c) => ({
    id: c.ZipID,
    name: c.CompanyName,
    authorityId: c.ZipID,
  }));
}

/**
 * Port of v1_reportingservice.getLocationsForUser: the FMS bikeparks the
 * authenticated user may see, grouped per gemeente.
 * - admin: all councils in the 'fms' module
 * - other users: the gemeenten from security_users_sites (auth.siteIDs)
 * Bikeparks: FMS flag set, type not buurtstalling/fietstrommel, and belonging
 * to the council (Title != 'Systeemstalling', ORDER BY Title, per the CF ORM).
 */
export async function getLocationsForUser(auth: ReportingAuth): Promise<OccupationCity[]> {
  const councils = auth.isAdmin
    ? await getFmsCouncils()
    : await prisma.contacts.findMany({
        where: { ID: { in: auth.siteIDs.filter((id) => id !== "0") } },
        select: { ID: true, ZipID: true, CompanyName: true },
        orderBy: { CompanyName: "asc" },
      });

  if (councils.length === 0) return [];

  const bikeparks = await prisma.fietsenstallingen.findMany({
    where: {
      SiteID: { in: councils.map((c) => c.ID) },
      FMS: true,
      Title: { not: "Systeemstalling" },
    },
    select: {
      StallingsID: true,
      SiteID: true,
      Title: true,
      Type: true,
      Coordinaten: true,
      BronBezettingsdata: true,
    },
    orderBy: { Title: "asc" },
  });

  const cities: OccupationCity[] = [];
  for (const council of councils) {
    const locations: OccupationLocation[] = [];
    for (const bikepark of bikeparks) {
      if (bikepark.SiteID !== council.ID || !bikepark.StallingsID) continue;
      const type = bikepark.Type ?? "";
      if (EXCLUDED_BIKEPARK_TYPES.includes(type.toLowerCase())) continue;
      locations.push({
        locationid: bikepark.StallingsID,
        name: bikepark.Title,
        type: bikepark.Type,
        coordinates: bikepark.Coordinaten,
        occupationSource: bikepark.BronBezettingsdata,
      });
    }
    if (locations.length > 0) {
      cities.push({
        citycode: council.ZipID,
        name: council.CompanyName,
        locations,
      });
    }
  }
  return cities;
}

/** CF bikepark2staticsection: map a bikepark to the datastandaard static section. */
function bikepark2staticsection(location: OccupationLocation, citycode: string | null): StaticSection {
  const section: StaticSection = {
    id: location.locationid,
    name: location.name,
  } as StaticSection;

  if (location.coordinates) {
    // CF Coordinaten is "lat,lng"; datastandaard GeoJSON wants [lng, lat].
    const parts = location.coordinates.split(",");
    const lat = Number(parts[0]);
    const lng = Number(parts[parts.length - 1]);
    if (!Number.isNaN(lat) && !Number.isNaN(lng)) {
      section.geoLocation = { coordinates: [lng, lat], type: "Point" };
    }
  }

  section.contractorIds = (location.occupationSource ?? "")
    .toLowerCase()
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  section.authorityIds = [citycode];
  section.surveyIds = [citycode];
  return section;
}

/**
 * Port of reports_json_datastandaard.getLocationIdsByGeopolygon +
 * reports.getQBikeparksByGeopolygon. The geopolygon parameter is a flat list
 * of "lat lng" coordinates (space and/or comma separated, polygon closed);
 * the SQL polygon uses "lng lat" order.
 */
async function filterLocationIdsByGeopolygon(
  geopolygon: string,
  locationIds: string[]
): Promise<string[]> {
  const tokens = geopolygon
    .split(/[ ,]+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
  if (tokens.length < 8 || tokens.length % 2 !== 0) {
    throw new Error("Invalid geopolygon");
  }
  for (const token of tokens) {
    if (!/^-?\d+(\.\d+)?$/.test(token)) {
      throw new Error("Invalid geopolygon");
    }
  }
  const points: string[] = [];
  for (let i = 0; i < tokens.length; i += 2) {
    // swap lat/lng -> "lng lat"
    points.push(`${tokens[i + 1]} ${tokens[i]}`);
  }
  if (locationIds.length === 0) return [];

  const placeholders = locationIds.map(() => "?").join(",");
  const sql = `
    SELECT StallingsID as locationid FROM fietsenstallingen
    WHERE ST_CONTAINS(ST_GEOMFROMTEXT('POLYGON((${points.join(",")}))'), geoLocation)
    AND StallingsID IN (${placeholders})`;
  const rows = await prisma.$queryRawUnsafe<{ locationid: string }[]>(sql, ...locationIds);
  return rows.map((r) => r.locationid);
}

export interface StaticDataParams {
  staticSectionId?: string;
  surveyId?: string;
  authorityId?: string;
  geopolygon?: string;
}

/**
 * Port of v2_occupation.getStaticData: resolve the static sections
 * (= bikeparks) the user is authorized for, optionally filtered by
 * staticSectionId list, surveyId/authorityId (citycode) or geopolygon.
 */
export async function getStaticData(
  auth: ReportingAuth,
  params: StaticDataParams
): Promise<StaticDataResult> {
  const cities = await getLocationsForUser(auth);

  // locationid -> location (+ citycode), preserving cities/locations order
  const orderedLocations: { location: OccupationLocation; citycode: string | null }[] = [];
  for (const city of cities) {
    for (const location of city.locations) {
      orderedLocations.push({ location, citycode: city.citycode });
    }
  }

  let selected: { location: OccupationLocation; citycode: string | null }[];

  if (params.staticSectionId !== undefined) {
    const requested = params.staticSectionId.split(",").map((s) => s.trim());
    selected = orderedLocations.filter((entry) => requested.includes(entry.location.locationid));
  } else {
    let citycodes: string[];
    if (params.surveyId !== undefined) {
      citycodes = params.surveyId.split(",").map((s) => s.trim());
    } else if (params.authorityId !== undefined) {
      citycodes = params.authorityId.split(",").map((s) => s.trim());
    } else {
      citycodes = cities.map((c) => c.citycode ?? "");
    }
    selected = [];
    for (const city of cities) {
      if (!citycodes.includes(city.citycode ?? "")) continue;
      for (const location of city.locations) {
        selected.push({ location, citycode: city.citycode });
      }
    }
  }

  if (params.geopolygon !== undefined) {
    const ids = await filterLocationIdsByGeopolygon(
      params.geopolygon,
      selected.map((entry) => entry.location.locationid)
    );
    // keep the order returned by the geopolygon query (CF parity)
    const byId = new Map(selected.map((entry) => [entry.location.locationid, entry]));
    selected = ids
      .map((id) => byId.get(id))
      .filter((entry): entry is { location: OccupationLocation; citycode: string | null } => !!entry);
  }

  const result = selected.map((entry) => bikepark2staticsection(entry.location, entry.citycode));
  return { result, totalHits: result.length };
}

/** Authority lookup, CF getAuthority: council by ZipID -> {id, name}. */
export async function getAuthorityById(authorityId: string): Promise<{ id: string; name: string | null }> {
  const council = await prisma.contacts.findFirst({
    where: { ZipID: authorityId },
    select: { CompanyName: true },
  });
  if (!council) {
    // CF DAO throws RecordNotFound("no record found")
    throw new Error("no record found");
  }
  return { id: authorityId, name: council.CompanyName };
}

/** CF getOrganisationById: known organisation from the hardcoded list, else {id}. */
export function getOrganisationById(organisationId: string): { id: string; name?: string } {
  const known = OCCUPATION_ORGANISATIONS.find((o) => o.id === organisationId);
  return known ?? { id: organisationId };
}

/* ----------------------------- dynamic data ------------------------------ */

export const VALID_ORDER_BY = ["parkingcapacity", "occupiedspaces", "vacantspaces", "timestamp"];

/**
 * CF getQBezettingDatastandaard orderBy mapping (datastandaard -> SQL).
 * The CF query orders by raw row values (b.occupation etc.); with
 * only_full_group_by we order by the aggregated values instead, which is
 * equivalent for the grouped result.
 */
function mapOrderBy(orderBy: string | undefined): string {
  if (orderBy === undefined) {
    // CF default: `timestamp`, BikeparkID, SectionID, source (sectionID has no
    // effect on the grouped rows and is not allowed under only_full_group_by)
    return "`timestamp` ASC, bikeparkID ASC, source";
  }
  switch (orderBy.toLowerCase()) {
    case "occupiedspaces":
      return "SUM(occupation)";
    case "vacantspaces":
      return "SUM(b.capacity) - SUM(occupation)";
    case "parkingcapacity":
      return "SUM(b.capacity)";
    case "contractorid":
      return "source";
    case "timestamp":
      return "`timestamp`";
    default:
      // unreachable: validated at the route level
      throw new Error(`Invalid orderBy '${orderBy}'`);
  }
}

export interface DynamicDataParams {
  staticSectionIds: string[];
  /** MySQL datetime string 'YYYY-MM-DD HH:mm:ss' (wall clock, DB parity) */
  startDate: string;
  endDate: string;
  /** depth > 1 in the REST API */
  groupBySection: boolean;
  orderBy?: string;
  orderDirection?: string;
  /** contractorId in the REST API */
  source?: string;
  page: number;
  pageSize: number;
  groupBy?: string;
}

interface BezettingRow {
  totalCheckins: unknown;
  totalCheckouts: unknown;
  authorityId: string | null;
  bikeparkID: string;
  sections?: string | null;
  sections_occupations?: string | null;
  sections_capacity?: string | null;
  sections_checkins?: string | null;
  sections_checkouts?: string | null;
  capacity: unknown;
  occupation: unknown;
  timestamp: Date;
  source: string | null;
  open: unknown;
}

function toNumberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isNaN(n) ? null : n;
}

/** CF query2datastandaard: map a query row to the datastandaard JSON record. */
function row2datastandaard(row: BezettingRow, groupBySection: boolean): DynamicSectionRecord {
  const record: DynamicSectionRecord = {
    staticSectionId: row.bikeparkID,
    timestamp: formatCfDbDateTime(row.timestamp),
    contractorId: (row.source ?? "").toLowerCase(),
    authorityId: row.authorityId,
    surveyId: row.authorityId,
    note: { isOpen: Number(row.open) === 1 },
  };

  const occupation = toNumberOrNull(row.occupation);
  const capacity = toNumberOrNull(row.capacity);
  if (occupation !== null) {
    record.occupiedSpaces = occupation;
  }
  if (capacity !== null) {
    record.parkingCapacity = capacity;
    if (occupation !== null) {
      record.vacantSpaces = capacity - occupation;
    }
  }

  const totalCheckins = toNumberOrNull(row.totalCheckins);
  if (totalCheckins !== null) {
    record.traffic = {
      periodInMinutes: 15,
      arrivals: totalCheckins,
      departures: toNumberOrNull(row.totalCheckouts) ?? 0,
    };
  }

  if (groupBySection && row.sections != null) {
    // GROUP_CONCAT lists; NULL values are skipped by MySQL, same as in CF.
    const splitList = (value: string | null | undefined): string[] =>
      value ? value.split(",") : [];
    const ids = splitList(row.sections);
    const occupations = splitList(row.sections_occupations);
    const capacities = splitList(row.sections_capacity);
    const checkins = splitList(row.sections_checkins);
    const checkouts = splitList(row.sections_checkouts);

    const sections: DynamicSubsection[] = [];
    for (let i = 0; i < ids.length; i++) {
      const subsection: DynamicSubsection = {};
      subsection.id = ids[i];
      if (i < checkins.length && checkins[i] !== "") {
        subsection.deltas = {
          periodInMinutes: 15,
          arrivals: Number(checkins[i]),
          departures: Number(checkouts[i] ?? 0),
        };
      }
      if (i < capacities.length && capacities[i] !== "") {
        subsection.parkingCapacity = Number(capacities[i]);
      }
      if (i < occupations.length && occupations[i] !== "") {
        subsection.occupiedSpaces = Number(occupations[i]);
        if (subsection.parkingCapacity !== undefined) {
          subsection.vacantSpaces = subsection.parkingCapacity - subsection.occupiedSpaces;
        }
      }
      sections.push(subsection);
    }
    if (sections.length > 0) {
      record.sections = sections;
    }
  }

  return record;
}

/** CF reports.totalHitsBezetting: count query for pagination. */
async function getTotalHits(params: DynamicDataParams): Promise<number> {
  const placeholders = params.staticSectionIds.map(() => "?").join(",");
  const values: unknown[] = [...params.staticSectionIds];
  let sourceFilter = "";
  if (params.source !== undefined) {
    sourceFilter = "AND `source` = ?";
    values.push(params.source);
  }
  const sql = `
    SELECT count(*) as n
    FROM bezettingsdata b
    INNER JOIN fietsenstallingen f ON f.StallingsID = b.bikeparkID
    INNER JOIN contacts c ON c.ID = f.SiteID
    WHERE \`fillup\` = 0
    AND \`bikeparkID\` IN (${placeholders})
    ${sourceFilter}
    AND \`interval\` = 15
    AND \`timestamp\` > ?
    AND \`timestamp\` <= ?`;
  values.push(params.startDate, params.endDate);
  const rows = await prisma.$queryRawUnsafe<{ n: bigint | number }[]>(sql, ...values);
  return Number(rows[0]?.n ?? 0);
}

/** CF reports.getQBezettingDatastandaard: the main occupation query. */
async function queryBezetting(params: DynamicDataParams): Promise<BezettingRow[]> {
  const placeholders = params.staticSectionIds.map(() => "?").join(",");
  const values: unknown[] = [...params.staticSectionIds];
  let sourceFilter = "";
  if (params.source !== undefined) {
    sourceFilter = "AND `source` = ?";
    values.push(params.source);
  }

  const sectionColumns = params.groupBySection
    ? `, GROUP_CONCAT(sectionid) as sections
       , GROUP_CONCAT(occupation) as sections_occupations
       , GROUP_CONCAT(b.capacity) as sections_capacity
       , GROUP_CONCAT(b.checkins) as sections_checkins
       , GROUP_CONCAT(b.checkouts) as sections_checkouts`
    : "";

  const orderBy = mapOrderBy(params.orderBy);
  const orderDirection = params.orderDirection?.toUpperCase() === "DESC" ? "DESC" : "ASC";

  const sql = `
    SELECT
      SUM(checkins) AS totalCheckins
      , SUM(checkouts) AS totalCheckouts
      , c.ZipID as authorityId
      , bikeparkID
      ${sectionColumns}
      , SUM(b.capacity) as capacity
      , SUM(occupation) as occupation
      /* CF selects the raw row values; aggregates keep only_full_group_by happy
         (within a group the timestamps share the same minute) */
      , MAX(\`timestamp\`) as \`timestamp\`
      , \`source\`
      , MAX(\`open\`) as \`open\`
      , YEAR(\`timestamp\`) AS timestamp_Year
      , MONTH(\`timestamp\`) AS timestamp_Month
      , DAY(\`timestamp\`) AS timestamp_Day
      , HOUR(\`timestamp\`) AS timestamp_Hour
      , MINUTE(\`timestamp\`) AS timestamp_Minute
    FROM bezettingsdata b
    INNER JOIN fietsenstallingen f ON f.StallingsID = b.bikeparkID
    INNER JOIN contacts c ON c.ID = f.SiteID
    WHERE \`fillup\` = 0
    AND \`bikeparkID\` IN (${placeholders})
    ${sourceFilter}
    AND \`interval\` = 15
    AND \`timestamp\` > ?
    AND \`timestamp\` <= ?
    GROUP BY
      \`source\`
      , timestamp_Year
      , timestamp_Month
      , timestamp_Day
      , timestamp_Hour
      , timestamp_Minute
      , bikeparkID
    ORDER BY ${orderBy} ${orderDirection}
    LIMIT ?, ?`;
  values.push(params.startDate, params.endDate);
  // Note: the CF query has "LIMIT page - 1, pageSize" which offsets by rows
  // instead of pages; we use a proper page-based offset.
  values.push((params.page - 1) * params.pageSize, params.pageSize);

  return prisma.$queryRawUnsafe<BezettingRow[]>(sql, ...values);
}

/**
 * Port of reports_json_datastandaard.bezetting: fetch, map and paginate the
 * dynamic occupation data. With groupBy=staticSectionId a page is returned
 * per location (only locations with data), like the CF per-location threads.
 */
export async function getDynamicData(
  params: DynamicDataParams
): Promise<DynamicDataPage | DynamicDataGrouped> {
  if (params.groupBy !== undefined) {
    const pages = await Promise.all(
      params.staticSectionIds.map((locationId) =>
        getDynamicData({
          ...params,
          staticSectionIds: [locationId],
          groupBy: undefined,
        }) as Promise<DynamicDataPage>
      )
    );
    return { result: pages.filter((page) => page.result.length > 0) };
  }

  if (params.staticSectionIds.length === 0) {
    return { result: [], totalHits: 0, page: params.page, pageSize: params.pageSize };
  }

  const [rows, totalHits] = await Promise.all([
    queryBezetting(params),
    getTotalHits(params),
  ]);

  return {
    result: rows.map((row) => row2datastandaard(row, params.groupBySection)),
    totalHits,
    page: params.page,
    pageSize: params.pageSize,
  };
}

/* ------------------------------ date helpers ----------------------------- */

/**
 * Parse the CF-style date parameter (ISO 'yyyy-mm-ddTHH:mm:ss', with optional
 * 'Z', or 'yyyy-mm-dd[ HH:mm:ss]') into a MySQL datetime string. The value is
 * treated as a wall-clock time, matching how the CF API compares it against
 * the DATETIME column.
 */
export function parseCfDateParam(input: string): string {
  const normalized = input.trim().replace("T", " ").replace(/Z$/i, "").replace(/\.\d+$/, "");
  const match = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ ](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?$/.exec(
    normalized
  );
  if (!match) {
    throw new Error(`Value '${input}' is not a valid date`);
  }
  const pad = (v: string | undefined) => String(v ?? "0").padStart(2, "0");
  const [, year, month, day, hour, minute, second] = match;
  return `${year}-${pad(month)}-${pad(day)} ${pad(hour)}:${pad(minute)}:${pad(second)}`;
}

/** Format a JS date as MySQL datetime string in local (server) time. */
export function formatLocalDateTime(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/** CF default startDate: now - 5 years. */
export function defaultStartDate(): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 5);
  return formatLocalDateTime(d);
}

/** CF default endDate: now. */
export function defaultEndDate(): string {
  return formatLocalDateTime(new Date());
}
