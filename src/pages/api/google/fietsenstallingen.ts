import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "~/server/db";
import { titleToSlug } from "~/utils/slug";

type GooglePoiRow = {
  ID: string;
  NAME: string;
  TYPE: string;
  LAT: string;
  LON: string;
  FULL_AD: string;
  ST_NUM: string;
  ST_NAME: string;
  CITY: string;
  STATE: string;
  ZIP: string;
  PHONE: string;
  WEBSITE: string;
  MON: string;
  TUES: string;
  WED: string;
  THURS: string;
  FRI: string;
  SAT: string;
  SUN: string;
  AP_LAT: string;
  AP_LON: string;
  ATTR: string;
  CAPACITY_TOTAL: string;
  CAPACITY_PER_VEHICLE_TYPE: string;
  SERVICES: string;
  TARIFFS: string;
  GUARDED: string;
  OPERATOR: string;
};

const GOOGLE_POI_HEADERS: (keyof GooglePoiRow)[] = [
  "ID", "NAME", "TYPE", "LAT", "LON", "FULL_AD", "ST_NUM", "ST_NAME", "CITY", "STATE", "ZIP",
  "PHONE", "WEBSITE", "MON", "TUES", "WED", "THURS", "FRI", "SAT", "SUN", "AP_LAT", "AP_LON", "ATTR",
  "CAPACITY_TOTAL", "CAPACITY_PER_VEHICLE_TYPE", "SERVICES", "TARIFFS", "GUARDED", "OPERATOR",
];

const ALLOWED_STALLINGTYPE_NAMES = [
  "Bewaakte stalling",
  "Geautomatiseerde stalling",
  "Stalling met toezicht",
  "Onbewaakte stalling",
] as const;

const escapeCsvField = (value: unknown): string => {
  if (value === null || value === undefined) return "\"\"";
  const str = String(value);
  return `"${str.replace(/"/g, "\"\"")}"`;
};

const parseCoordinates = (coordinaten: string | null): { lat: string; lon: string } | null => {
  if (!coordinaten) return null;
  const parts = coordinaten.split(",").map((v) => v.trim());
  if (parts.length !== 2) return null;

  const latNum = Number(parts[0]);
  const lonNum = Number(parts[1]);
  if (!Number.isFinite(latNum) || !Number.isFinite(lonNum)) return null;
  if (latNum < -90 || latNum > 90 || lonNum < -180 || lonNum > 180) return null;

  return {
    lat: latNum.toFixed(6),
    lon: lonNum.toFixed(6),
  };
};

const parseStreetParts = (location: string | null): { streetName: string; streetNumber: string } => {
  if (!location) return { streetName: "", streetNumber: "" };
  const trimmed = location.trim();
  if (!trimmed) return { streetName: "", streetNumber: "" };

  const match = trimmed.match(/^(.*?)[\s,]+(\d+[a-zA-Z0-9\-\/]*)$/);
  if (!match) {
    return { streetName: trimmed, streetNumber: "" };
  }

  return {
    streetName: match[1]?.trim() ?? trimmed,
    streetNumber: match[2]?.trim() ?? "",
  };
};

const formatTimeRange = (open: Date | null, close: Date | null): string => {
  if (!open || !close) return "";
  const openDate = new Date(open);
  const closeDate = new Date(close);
  if (isNaN(openDate.getTime()) || isNaN(closeDate.getTime())) return "";

  const hhmm = (d: Date) => `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
  return `${hhmm(openDate)}-${hhmm(closeDate)}`;
};

const normalizeGoogleType = (internalType: string | null): string => {
  const t = (internalType ?? "").toLowerCase().trim();
  switch (t) {
    case "bewaakt":
    case "fietskluizen":
    case "buurtstalling":
    case "fietstrommel":
      return "bicycle_parking";
    default:
      return "bicycle_parking";
  }
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

const deriveGuarded = (stallingTypeName: string | null | undefined): string => {
  if (!stallingTypeName) return "";
  return stallingTypeName.toLowerCase().includes("onbewaakt") ? "no" : "yes";
};

export default async function handle(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  if (req.query.format !== "google_poi") {
    res.status(400).json({
      error: "Unsupported format. Use ?format=google_poi",
    });
    return;
  }

  try {
    const tariefcodes = await prisma.tariefcodes.findMany({
      select: {
        ID: true,
        Omschrijving: true,
      },
    });
    const tariefcodeMap = new Map<number, string>(
      tariefcodes.map((t) => [t.ID, t.Omschrijving ?? ""])
    );

    const parkings = await prisma.fietsenstallingen.findMany({
      where: {
        Coordinaten: { not: null },
        fietsenstalling_type: {
          is: {
            name: {
              in: [...ALLOWED_STALLINGTYPE_NAMES],
            },
          },
        },
        NOT: [
          { Coordinaten: "" },
          { Title: { contains: "Systeemstalling" } },
          { Status: "aanm" },
          { Status: "AANM" },
        ],
      },
      select: {
        ID: true,
        StallingsID: true,
        Title: true,
        Type: true,
        Coordinaten: true,
        Location: true,
        Postcode: true,
        Plaats: true,
        Url: true,
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
        Open_zo: true,
        Dicht_zo: true,
        contacts_fietsenstallingen_SiteIDTocontacts: {
          select: {
            UrlName: true,
          },
        },
        contacts_fietsenstallingen_ExploitantIDTocontacts: {
          select: {
            CompanyName: true,
          },
        },
        fietsenstalling_type: {
          select: {
            name: true,
          },
        },
        OmschrijvingTarieven: true,
        Tariefcode: true,
        Capacity: true,
        ExtraServices: true,
        fietsenstallingen_services: {
          select: {
            services: {
              select: {
                Name: true,
              },
            },
          },
        },
        fietsenstalling_secties: {
          select: {
            secties_fietstype: {
              select: {
                Toegestaan: true,
                Capaciteit: true,
                fietstype: {
                  select: {
                    Name: true,
                  },
                },
              },
            },
          },
        },
      },
      orderBy: [
        { Plaats: "asc" },
        { Title: "asc" },
      ],
    });

    const rows: string[] = [];
    rows.push(GOOGLE_POI_HEADERS.map(escapeCsvField).join(","));

    for (const parking of parkings) {
      const coords = parseCoordinates(parking.Coordinaten);
      if (!coords || !parking.ID || !parking.Title) continue;

      const { streetName, streetNumber } = parseStreetParts(parking.Location);
      const fullAddress = [parking.Location, `${parking.Postcode ?? ""} ${parking.Plaats ?? ""}`.trim(), "Netherlands"]
        .filter((part) => !!part && String(part).trim().length > 0)
        .join(", ");

      const municipalityUrl = parking.contacts_fietsenstallingen_SiteIDTocontacts?.UrlName;
      const titleSlug = titleToSlug(parking.Title);
      const generatedVsUrl = municipalityUrl
        ? `https://veiligstallen.nl/${municipalityUrl}/?name=${titleSlug}&stallingid=${parking.ID}`
        : `https://veiligstallen.nl/?name=${titleSlug}&stallingid=${parking.ID}`;

      const sectionCapacity = aggregateCapacityByVehicleType(parking.fietsenstalling_secties);
      const totalCapacity = sectionCapacity.total > 0
        ? sectionCapacity.total
        : (parking.Capacity ?? 0);

      const servicesFromRelation = parking.fietsenstallingen_services
        .map((s) => s.services.Name.trim())
        .filter((name) => name.length > 0);
      const extraServices = (parking.ExtraServices ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
      const allServices = [...new Set([...servicesFromRelation, ...extraServices])].join("; ");

      const tariffs = parking.Tariefcode !== null
        ? (tariefcodeMap.get(parking.Tariefcode)?.trim() ?? "")
        : "";

      const row: GooglePoiRow = {
        ID: parking.ID,
        NAME: parking.Title,
        TYPE: normalizeGoogleType(parking.Type),
        LAT: coords.lat,
        LON: coords.lon,
        FULL_AD: fullAddress,
        ST_NUM: streetNumber,
        ST_NAME: streetName,
        CITY: parking.Plaats ?? "",
        STATE: "",
        ZIP: parking.Postcode ?? "",
        PHONE: "",
        WEBSITE: parking.Url || generatedVsUrl,
        MON: formatTimeRange(parking.Open_ma, parking.Dicht_ma),
        TUES: formatTimeRange(parking.Open_di, parking.Dicht_di),
        WED: formatTimeRange(parking.Open_wo, parking.Dicht_wo),
        THURS: formatTimeRange(parking.Open_do, parking.Dicht_do),
        FRI: formatTimeRange(parking.Open_vr, parking.Dicht_vr),
        SAT: formatTimeRange(parking.Open_za, parking.Dicht_za),
        SUN: formatTimeRange(parking.Open_zo, parking.Dicht_zo),
        AP_LAT: coords.lat,
        AP_LON: coords.lon,
        ATTR: parking.fietsenstalling_type?.name ? `subtype=${parking.fietsenstalling_type.name}` : "",
        CAPACITY_TOTAL: String(totalCapacity),
        CAPACITY_PER_VEHICLE_TYPE: sectionCapacity.byType,
        SERVICES: allServices,
        TARIFFS: tariffs,
        GUARDED: deriveGuarded(parking.fietsenstalling_type?.name),
        OPERATOR: parking.contacts_fietsenstallingen_ExploitantIDTocontacts?.CompanyName ?? "",
      };

      rows.push(GOOGLE_POI_HEADERS.map((header) => escapeCsvField(row[header])).join(","));
    }

    const csvContent = rows.join("\n");
    const fileDate = new Date().toISOString().split("T")[0];

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="fietsenstallingen_google_poi_${fileDate}.csv"`);
    res.status(200).send(csvContent);
  } catch (error) {
    console.error("[api/google/fietsenstallingen] Failed to generate google_poi export:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}
