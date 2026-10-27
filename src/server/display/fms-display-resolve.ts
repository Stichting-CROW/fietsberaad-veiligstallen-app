import type { ParsedUrlQuery } from "querystring";
import { prisma } from "~/server/db";
import { getBikeparkByExternalId, type CouncilDisplay } from "./council";

function qstr(value: string | string[] | undefined): string | undefined {
  if (typeof value === "string") return value.trim() || undefined;
  if (Array.isArray(value) && typeof value[0] === "string") return value[0].trim() || undefined;
  return undefined;
}

const councilSelect = {
  ID: true,
  CompanyName: true,
  UrlName: true,
  ThemeColor1: true,
  ThemeColor2: true,
  CompanyLogo: true,
  CompanyLogo2: true,
  ZipID: true,
} as const;

function mapCouncilRow(row: {
  ID: string;
  CompanyName: string | null;
  UrlName: string | null;
  ThemeColor1: string;
  ThemeColor2: string;
  CompanyLogo: string | null;
  CompanyLogo2: string | null;
  ZipID: string | null;
}): CouncilDisplay {
  return {
    id: row.ID,
    companyName: row.CompanyName ?? "",
    urlName: row.UrlName,
    themeColor1: row.ThemeColor1,
    themeColor2: row.ThemeColor2,
    companyLogo: row.CompanyLogo,
    companyLogo2: row.CompanyLogo2,
    zipId: row.ZipID,
  };
}

/** FMS/reporting citycode ↔ gemeente ZipID on contacts. */
export async function resolveCouncilByCitycode(citycode: string): Promise<CouncilDisplay | null> {
  const zip = citycode.trim();
  if (!zip) return null;
  const row = await prisma.contacts.findFirst({
    where: { ZipID: zip, Status: "1" },
    select: councilSelect,
  });
  return row ? mapCouncilRow(row) : null;
}

export async function resolveStallingByCitycodeAndLocationId(citycode: string, locationId: string) {
  const council = await resolveCouncilByCitycode(citycode);
  if (!council) return null;
  const bikepark = await getBikeparkByExternalId(council.id, locationId.trim());
  if (!bikepark) return null;
  return { council, bikepark };
}

/** Internal fietsenstallingen.ID (legacy CF ids + FMS location id). */
export async function resolveInternalBikeparkId(
  ref: string,
  opts?: { siteId?: string; citycode?: string }
): Promise<string | null> {
  const id = ref.trim();
  if (!id) return null;

  if (opts?.citycode) {
    const hit = await resolveStallingByCitycodeAndLocationId(opts.citycode, id);
    if (hit) return hit.bikepark.ID;
  }

  if (opts?.siteId) {
    const scoped = await prisma.fietsenstallingen.findFirst({
      where: {
        SiteID: opts.siteId,
        Status: "1",
        OR: [{ ID: id }, { StallingsID: id }],
      },
      select: { ID: true },
    });
    if (scoped) return scoped.ID;
  }

  const global = await prisma.fietsenstallingen.findFirst({
    where: { Status: "1", OR: [{ ID: id }, { StallingsID: id }] },
    select: { ID: true },
  });
  return global?.ID ?? null;
}

export type ResolvedPresentationQuery = {
  siteId: string;
  bikeparkIdFromUrl?: string;
  fmsCitycode?: string;
  fmsLocationId?: string;
};

/**
 * Accepts CF query (siteID + bikeparkID) or FMS query (citycode + locationId).
 * CF contract is tried first when siteID is present.
 */
export async function resolvePresentationFromQuery(
  query: ParsedUrlQuery
): Promise<ResolvedPresentationQuery | null> {
  const siteId = qstr(query.siteID ?? query.siteId);
  const bikeparkId = qstr(query.bikeparkID ?? query.bikeparkId);
  const citycode = qstr(query.citycode);
  const locationId = qstr(query.locationId);

  if (siteId) {
    return { siteId, bikeparkIdFromUrl: bikeparkId };
  }

  if (citycode && locationId) {
    const hit = await resolveStallingByCitycodeAndLocationId(citycode, locationId);
    if (!hit) return null;
    return {
      siteId: hit.council.id,
      bikeparkIdFromUrl: locationId,
      fmsCitycode: citycode,
      fmsLocationId: locationId,
    };
  }

  return null;
}

export function slide2QueryString(resolved: ResolvedPresentationQuery): string {
  if (resolved.fmsCitycode && resolved.fmsLocationId) {
    return new URLSearchParams({
      citycode: resolved.fmsCitycode,
      locationId: resolved.fmsLocationId,
    }).toString();
  }
  const q = new URLSearchParams({ siteID: resolved.siteId });
  if (resolved.bikeparkIdFromUrl) q.set("bikeparkID", resolved.bikeparkIdFromUrl);
  return q.toString();
}

export { qstr as displayQueryString };
