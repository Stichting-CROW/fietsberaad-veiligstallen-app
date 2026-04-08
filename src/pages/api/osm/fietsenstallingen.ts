import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "~/server/db";
import { titleToSlug } from "~/utils/slug";

const ALLOWED_STALLINGTYPE_NAMES = [
  "Bewaakte stalling",
  "Geautomatiseerde stalling",
  "Stalling met toezicht",
  "Onbewaakte stalling",
] as const;

type OSMFeature = {
  type: "Feature";
  geometry: {
    type: "Point";
    coordinates: [number, number];
  };
  properties: {
    // Direct OSM-style tags (for easier conflation/import tooling)
    "amenity": "bicycle_parking";
    "ref:veiligstallen": string;
    "name"?: string;
    "operator"?: string;
    "capacity"?: number;
    "opening_hours"?: string;
    "website"?: string;
    "contact:phone"?: string;
    "fee"?: "yes" | "no";
    "charge:description"?: string;
    "supervised"?: "yes" | "no";
    "bicycle_parking"?: string;
    "addr:street"?: string;
    "addr:housenumber"?: string;
    "addr:postcode"?: string;
    "addr:city"?: string;
    "source": "VeiligStallen";
    // Useful metadata for review/conflation
    "veiligstallen:type_name"?: string;
    "veiligstallen:services"?: string;
    "veiligstallen:capacity_per_vehicle_type"?: string;
    "veiligstallen:id": string;
  };
};

type OSMGeoJson = {
  type: "FeatureCollection";
  name: "veiligstallen_fietsenstallingen_osm";
  features: OSMFeature[];
};

const parseCoordinates = (coordinaten: string | null): { lat: number; lon: number } | null => {
  if (!coordinaten) return null;
  const parts = coordinaten.split(",").map((v) => v.trim());
  if (parts.length !== 2) return null;

  const lat = Number(parts[0]);
  const lon = Number(parts[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
  return { lat, lon };
};

const parseStreetParts = (location: string | null): { streetName: string; streetNumber: string } => {
  if (!location) return { streetName: "", streetNumber: "" };
  const trimmed = location.trim();
  if (!trimmed) return { streetName: "", streetNumber: "" };
  const match = trimmed.match(/^(.*?)[\s,]+(\d+[a-zA-Z0-9\-\/]*)$/);
  if (!match) return { streetName: trimmed, streetNumber: "" };
  return {
    streetName: match[1]?.trim() ?? trimmed,
    streetNumber: match[2]?.trim() ?? "",
  };
};

const aggregateCapacityByVehicleType = (
  sections: Array<{
    secties_fietstype: Array<{
      Toegestaan: boolean | null;
      Capaciteit: number | null;
      fietstype: { Name: string | null } | null;
    }>;
  }>
): { total: number; byType: string } => {
  const totalsByType = new Map<string, number>();
  let total = 0;

  for (const section of sections) {
    for (const vehicleType of section.secties_fietstype) {
      if (!vehicleType.Toegestaan) continue;
      const cap = vehicleType.Capaciteit ?? 0;
      if (cap <= 0) continue;
      const typeName = (vehicleType.fietstype?.Name ?? "Unknown").trim() || "Unknown";
      totalsByType.set(typeName, (totalsByType.get(typeName) ?? 0) + cap);
      total += cap;
    }
  }

  const byType = [...totalsByType.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([name, cap]) => `${name}:${cap}`)
    .join("; ");

  return { total, byType };
};

const deriveSupervised = (stallingTypeName: string | null | undefined): "yes" | "no" | undefined => {
  if (!stallingTypeName) return undefined;
  return stallingTypeName.toLowerCase().includes("onbewaakt") ? "no" : "yes";
};

const mapSubtypeToBicycleParking = (stallingTypeName: string | null | undefined): string | undefined => {
  const t = (stallingTypeName ?? "").toLowerCase().trim();
  if (!t) return undefined;
  if (t.includes("geautomatiseerd")) return "lockers";
  if (t.includes("onbewaakt")) return "stands";
  if (t.includes("bewaakt") || t.includes("toezicht")) return "building";
  return undefined;
};

const getBaseUrl = (req: NextApiRequest): string => {
  const forwardedHost = req.headers["x-forwarded-host"];
  const host = (Array.isArray(forwardedHost) ? forwardedHost[0] : forwardedHost) ?? req.headers.host ?? "";
  const normalizedHost = host.toLowerCase();

  if (normalizedHost.includes("localhost")) return "http://localhost:3000";
  if (normalizedHost.includes("azurewebsites.net")) return "https://vstfb-eu-acc-app01.azurewebsites.net";
  return "https://beta.veiligstallen.nl";
};

const buildOpeningHours = (parking: {
  Open_ma: Date | null; Dicht_ma: Date | null;
  Open_di: Date | null; Dicht_di: Date | null;
  Open_wo: Date | null; Dicht_wo: Date | null;
  Open_do: Date | null; Dicht_do: Date | null;
  Open_vr: Date | null; Dicht_vr: Date | null;
  Open_za: Date | null; Dicht_za: Date | null;
  Open_zo: Date | null; Dicht_zo: Date | null;
}): string => {
  const hhmm = (d: Date) => `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
  const range = (open: Date | null, close: Date | null): string | null => {
    if (!open || !close) return null;
    const o = new Date(open);
    const c = new Date(close);
    if (isNaN(o.getTime()) || isNaN(c.getTime())) return null;
    return `${hhmm(o)}-${hhmm(c)}`;
  };

  const perDay: Array<{ day: string; value: string | null }> = [
    { day: "Mo", value: range(parking.Open_ma, parking.Dicht_ma) },
    { day: "Tu", value: range(parking.Open_di, parking.Dicht_di) },
    { day: "We", value: range(parking.Open_wo, parking.Dicht_wo) },
    { day: "Th", value: range(parking.Open_do, parking.Dicht_do) },
    { day: "Fr", value: range(parking.Open_vr, parking.Dicht_vr) },
    { day: "Sa", value: range(parking.Open_za, parking.Dicht_za) },
    { day: "Su", value: range(parking.Open_zo, parking.Dicht_zo) },
  ];

  return perDay
    .filter((d) => d.value)
    .map((d) => `${d.day} ${d.value}`)
    .join("; ");
};

export default async function handle(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const baseUrl = getBaseUrl(req);
    const cbsCodeParam = Array.isArray(req.query.cbsCode) ? req.query.cbsCode[0] : req.query.cbsCode;
    let cbsCodeFilter: number | undefined;
    if (cbsCodeParam !== undefined) {
      const parsed = Number(cbsCodeParam);
      if (!Number.isInteger(parsed) || parsed < 0) {
        res.status(400).json({ error: "Invalid cbsCode. Use a non-negative integer, e.g. cbsCode=344" });
        return;
      }
      cbsCodeFilter = parsed;
    }

    const tariefcodes = await prisma.tariefcodes.findMany({
      select: { ID: true, Omschrijving: true },
    });
    const tariefcodeMap = new Map<number, string>(
      tariefcodes.map((t) => [t.ID, t.Omschrijving ?? ""])
    );

    const parkings = await prisma.fietsenstallingen.findMany({
      where: {
        Coordinaten: { not: null },
        fietsenstalling_type: {
          is: { name: { in: [...ALLOWED_STALLINGTYPE_NAMES] } },
        },
        ...(cbsCodeFilter !== undefined
          ? {
              contacts_fietsenstallingen_SiteIDTocontacts: {
                is: {
                  Gemeentecode: cbsCodeFilter,
                },
              },
            }
          : {}),
        NOT: [
          { Coordinaten: "" },
          { Title: { contains: "Systeemstalling" } },
          { Status: "aanm" },
          { Status: "AANM" },
        ],
      },
      select: {
        ID: true,
        Title: true,
        Location: true,
        Postcode: true,
        Plaats: true,
        Url: true,
        Open_ma: true, Dicht_ma: true,
        Open_di: true, Dicht_di: true,
        Open_wo: true, Dicht_wo: true,
        Open_do: true, Dicht_do: true,
        Open_vr: true, Dicht_vr: true,
        Open_za: true, Dicht_za: true,
        Open_zo: true, Dicht_zo: true,
        Coordinaten: true,
        Tariefcode: true,
        Capacity: true,
        ExtraServices: true,
        contacts_fietsenstallingen_SiteIDTocontacts: {
          select: { UrlName: true },
        },
        contacts_fietsenstallingen_ExploitantIDTocontacts: {
          select: { CompanyName: true },
        },
        fietsenstalling_type: {
          select: { name: true },
        },
        fietsenstallingen_services: {
          select: { services: { select: { Name: true } } },
        },
        fietsenstalling_secties: {
          select: {
            secties_fietstype: {
              select: {
                Toegestaan: true,
                Capaciteit: true,
                fietstype: { select: { Name: true } },
              },
            },
          },
        },
      },
      orderBy: [{ Plaats: "asc" }, { Title: "asc" }],
    });

    const features: OSMFeature[] = [];

    for (const parking of parkings) {
      const coords = parseCoordinates(parking.Coordinaten);
      if (!coords || !parking.ID) continue;

      const { streetName, streetNumber } = parseStreetParts(parking.Location);
      const sectionCapacity = aggregateCapacityByVehicleType(parking.fietsenstalling_secties);
      const totalCapacity = sectionCapacity.total > 0 ? sectionCapacity.total : (parking.Capacity ?? 0);

      const servicesFromRelation = parking.fietsenstallingen_services
        .map((s) => s.services.Name.trim())
        .filter((name) => name.length > 0);
      const extraServices = (parking.ExtraServices ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
      const allServices = [...new Set([...servicesFromRelation, ...extraServices])].join("; ");

      const municipalityUrl = parking.contacts_fietsenstallingen_SiteIDTocontacts?.UrlName;
      const titleSlug = parking.Title ? titleToSlug(parking.Title) : "";
      const fallbackUrl = municipalityUrl
        ? `${baseUrl}/${municipalityUrl}/?name=${titleSlug}&stallingid=${parking.ID}`
        : `${baseUrl}/?name=${titleSlug}&stallingid=${parking.ID}`;

      const openingHours = buildOpeningHours(parking);
      const supervised = deriveSupervised(parking.fietsenstalling_type?.name);
      const subtype = mapSubtypeToBicycleParking(parking.fietsenstalling_type?.name);
      const tariffText = parking.Tariefcode !== null
        ? (tariefcodeMap.get(parking.Tariefcode)?.trim() ?? "")
        : "";

      const properties: OSMFeature["properties"] = {
        amenity: "bicycle_parking",
        "ref:veiligstallen": parking.ID,
        source: "VeiligStallen",
        "veiligstallen:id": parking.ID,
      };

      if (parking.Title) properties.name = parking.Title;
      if (parking.contacts_fietsenstallingen_ExploitantIDTocontacts?.CompanyName) {
        properties.operator = parking.contacts_fietsenstallingen_ExploitantIDTocontacts.CompanyName;
      }
      if (totalCapacity > 0) properties.capacity = totalCapacity;
      if (openingHours) properties.opening_hours = openingHours;
      if (fallbackUrl) properties.website = fallbackUrl;
      if (streetName) properties["addr:street"] = streetName;
      if (streetNumber) properties["addr:housenumber"] = streetNumber;
      if (parking.Postcode) properties["addr:postcode"] = parking.Postcode;
      if (parking.Plaats) properties["addr:city"] = parking.Plaats;
      if (supervised) properties.supervised = supervised;
      if (subtype) properties.bicycle_parking = subtype;
      if (tariffText) {
        properties.fee = tariffText.toLowerCase().includes("gratis") ? "no" : "yes";
        properties["charge:description"] = tariffText;
      }
      if (parking.fietsenstalling_type?.name) {
        properties["veiligstallen:type_name"] = parking.fietsenstalling_type.name;
      }
      if (allServices) properties["veiligstallen:services"] = allServices;
      if (sectionCapacity.byType) {
        properties["veiligstallen:capacity_per_vehicle_type"] = sectionCapacity.byType;
      }

      features.push({
        type: "Feature",
        geometry: {
          type: "Point",
          coordinates: [coords.lon, coords.lat],
        },
        properties,
      });
    }

    const payload: OSMGeoJson = {
      type: "FeatureCollection",
      name: "veiligstallen_fietsenstallingen_osm",
      features,
    };

    res.setHeader("Content-Type", "application/geo+json; charset=utf-8");
    res.status(200).json(payload);
  } catch (error) {
    console.error("[api/osm/fietsenstallingen] Failed to generate OSM GeoJSON export:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}
