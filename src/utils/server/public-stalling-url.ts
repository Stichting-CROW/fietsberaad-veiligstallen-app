import { prisma } from "~/server/db";
import { titleToSlug } from "~/utils/slug";

type ParkingForPublicUrl = {
  ID: string;
  Title: string | null;
  Coordinaten: string | null;
  EditorCreated: string | null;
  IsStationsstalling: boolean | null;
  contacts_fietsenstallingen_SiteIDTocontacts: { UrlName: string | null } | null;
};

function cbsCodeFromApiMunicipality(municipality: string): number {
  let cbsCode = municipality.replace("GM", "");
  while (cbsCode.charAt(0) === "0") {
    cbsCode = cbsCode.substring(1);
  }
  return Number(cbsCode);
}

async function municipalityUrlNameFromCoordinates(coordinaten: string): Promise<string | null> {
  const parts = coordinaten.split(",");
  const lat = parts[0]?.trim();
  const lng = parts[1]?.trim();
  if (!lat || !lng) return null;

  const response = await fetch(
    `https://api.dashboarddeelmobiliteit.nl/dashboard-api/public/get_municipality_based_on_latlng?location=${lat},${lng}`,
  );
  const json = (await response.json()) as { message?: string; municipality?: string };
  if (json.message === "No municipality found for these coordinates" || !json.municipality) {
    return null;
  }

  const cbs = cbsCodeFromApiMunicipality(json.municipality);
  if (!Number.isFinite(cbs)) return null;

  const contact = await prisma.contacts.findFirst({
    where: { Gemeentecode: cbs, Status: { not: "0" }, UrlName: { not: null } },
    select: { UrlName: true },
  });
  return contact?.UrlName ?? null;
}

/** Map URL segment for deep links; NS/stationsstallingen use geo municipality, not data owner `ns`. */
export async function resolvePublicMunicipalityUrlName(parking: ParkingForPublicUrl): Promise<string | null> {
  const siteUrl = parking.contacts_fietsenstallingen_SiteIDTocontacts?.UrlName ?? null;
  const useGeoMunicipality =
    parking.EditorCreated === "NS-connector" ||
    parking.IsStationsstalling === true ||
    siteUrl === "ns";

  if (!useGeoMunicipality && siteUrl) {
    return siteUrl;
  }

  if (parking.Coordinaten) {
    const geo = await municipalityUrlNameFromCoordinates(parking.Coordinaten);
    if (geo) return geo;
  }

  return siteUrl;
}

export function buildPublicStallingPath(
  municipalityUrlName: string | null,
  parking: Pick<ParkingForPublicUrl, "ID" | "Title">,
): string {
  const params = new URLSearchParams();
  const nameSlug = parking.Title ? titleToSlug(parking.Title) : "";
  if (nameSlug) params.set("name", nameSlug);
  params.set("stallingid", parking.ID);
  if (municipalityUrlName) params.set("municipality", municipalityUrlName);
  const qs = params.toString();
  return municipalityUrlName ? `/${municipalityUrlName}?${qs}` : `/?${qs}`;
}

export async function buildPublicStallingPathForParking(
  parking: ParkingForPublicUrl,
): Promise<string> {
  const municipalityUrlName = await resolvePublicMunicipalityUrlName(parking);
  return buildPublicStallingPath(municipalityUrlName, parking);
}
