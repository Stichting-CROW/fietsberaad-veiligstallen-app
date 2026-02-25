import { prisma } from "~/server/db";

export type CityCode = {
  citycode: string;
  name?: string;
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

export type SectionSummary = {
  sectionid: string;
  name?: string;
  capacity?: number;
  occupation?: number;
  isKluis?: boolean;
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

export async function getLocations(citycode: string): Promise<LocationSummary[]> {
  const rows = await prisma.fietsenstallingen.findMany({
    where: {
      contacts_fietsenstallingen_SiteIDTocontacts: {
        ZipID: citycode,
        ItemType: "organizations",
      },
      StallingsID: { not: null },
      Status: "1",
    },
    select: { StallingsID: true, Title: true },
  });
  return rows.map((r) => ({
    locationid: r.StallingsID!,
    name: r.Title ?? undefined,
  }));
}

export async function getLocation(
  citycode: string,
  locationid: string
): Promise<LocationDetail | null> {
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
      Capacity: true,
      Type: true,
      fietsenstalling_secties: {
        select: { Bezetting: true },
      },
    },
  });
  if (!stalling?.StallingsID) return null;
  const totalBezetting = stalling.fietsenstalling_secties.reduce(
    (sum, s) => sum + (s.Bezetting ?? 0),
    0
  );
  const locationtypeid = mapTypeToLocationTypeId(stalling.Type);
  return {
    locationid: stalling.StallingsID,
    name: stalling.Title ?? undefined,
    capacity: stalling.Capacity ?? undefined,
    occupation: totalBezetting > 0 ? totalBezetting : undefined,
    locationtypeid,
  };
}

function mapTypeToLocationTypeId(type: string | null): number {
  const map: Record<string, number> = {
    bewaakt: 1,
    toezicht: 2,
    geautomatiseerd: 3,
    onbewaakt: 4,
    fietskluizen: 5,
    buurtstalling: 6,
    fietstrommel: 7,
  };
  return type ? map[type] ?? 1 : 1;
}

export async function getSections(
  citycode: string,
  locationid: string
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
    select: {
      externalId: true,
      titel: true,
      capaciteit: true,
      Bezetting: true,
      isKluis: true,
    },
  });
  return secties.map((s) => ({
    sectionid: s.externalId ?? "",
    name: s.titel,
    capacity: s.capaciteit ?? undefined,
    occupation: s.Bezetting > 0 ? s.Bezetting : undefined,
    isKluis: s.isKluis ?? undefined,
  }));
}

export async function getSection(
  citycode: string,
  locationid: string,
  sectionid: string
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
    select: {
      externalId: true,
      titel: true,
      capaciteit: true,
      Bezetting: true,
      isKluis: true,
    },
  });
  if (!sectie) return null;
  return {
    sectionid: sectie.externalId ?? "",
    name: sectie.titel,
    capacity: sectie.capaciteit ?? undefined,
    occupation: sectie.Bezetting > 0 ? sectie.Bezetting : undefined,
    isKluis: sectie.isKluis ?? undefined,
  };
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
): Promise<SubscriptionTypeSummary[]> {
  const stalling = await prisma.fietsenstallingen.findFirst({
    where: {
      StallingsID: locationid,
      contacts_fietsenstallingen_SiteIDTocontacts: {
        ZipID: citycode,
        ItemType: "organizations",
      },
      Status: "1",
    },
    select: { ID: true },
  });
  if (!stalling) return [];

  const links = await prisma.abonnementsvorm_fietsenstalling.findMany({
    where: { BikeparkID: stalling.ID },
    include: {
      abonnementsvormen: {
        select: { ID: true, naam: true, prijs: true, tijdsduur: true, isActief: true },
      },
    },
  });
  return links
    .filter((l) => l.abonnementsvormen?.isActief !== false)
    .map((l) => ({
      subscriptiontypeid: l.SubscriptiontypeID,
      name: l.abonnementsvormen?.naam ?? undefined,
      price: l.abonnementsvormen?.prijs ? Number(l.abonnementsvormen.prijs) : undefined,
      tijdsduur: l.abonnementsvormen?.tijdsduur ?? undefined,
    }));
}
