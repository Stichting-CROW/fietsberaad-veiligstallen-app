import { prisma } from "~/server/db";

export type CouncilDisplay = {
  id: string;
  companyName: string;
  urlName: string | null;
  themeColor1: string;
  themeColor2: string;
  companyLogo: string | null;
  companyLogo2: string | null;
  zipId: string | null;
};

export async function resolveCouncilByUrlOrName(slug: string): Promise<CouncilDisplay | null> {
  const normalized = slug.trim();
  let row = await prisma.contacts.findFirst({
    where: { UrlName: normalized, Status: "1" },
    select: councilSelect,
  });
  if (!row) {
    row = await prisma.contacts.findFirst({
      where: { CompanyName: { equals: normalized, mode: "insensitive" }, Status: "1" },
      select: councilSelect,
    });
  }
  return row ? mapCouncil(row) : null;
}

export async function getCouncilById(siteId: string): Promise<CouncilDisplay | null> {
  const row = await prisma.contacts.findUnique({ where: { ID: siteId }, select: councilSelect });
  return row ? mapCouncil(row) : null;
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

function mapCouncil(row: {
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

export async function listFmsCouncilsForVerwijssysteem(): Promise<
  { council: CouncilDisplay; bikeparks: { title: string; stallingsId: string | null; urlName: string | null }[] }[]
> {
  const moduleRow = await prisma.modules.findFirst({ where: { ID: "fms" } });
  if (!moduleRow) return [];

  const siteIds = (
    await prisma.modules_contacts.findMany({
      where: { ModuleID: "fms" },
      select: { SiteID: true },
    })
  ).map((m) => m.SiteID);

  const councils = await prisma.contacts.findMany({
    where: { ID: { in: siteIds }, Status: "1" },
    select: councilSelect,
    orderBy: { CompanyName: "asc" },
  });

  const result = [];
  for (const c of councils) {
    if (c.CompanyName === "FIETSBERAAD" || c.CompanyName === "Testgemeente") continue;
    const bikeparks = await prisma.fietsenstallingen.findMany({
      where: { SiteID: c.ID, Status: "1", Verwijssysteem: true },
      select: { Title: true, StallingsID: true },
      orderBy: { Title: "asc" },
    });
    result.push({
      council: mapCouncil(c),
      bikeparks: bikeparks.map((b) => ({
        title: b.Title ?? "",
        stallingsId: b.StallingsID,
        urlName: c.UrlName,
      })),
    });
  }
  return result;
}

export async function getBikeparkByExternalId(councilId: string, stallingsId: string) {
  return prisma.fietsenstallingen.findFirst({
    where: { SiteID: councilId, StallingsID: stallingsId, Status: "1" },
    include: {
      fietsenstalling_secties: {
        where: { isactief: true },
        orderBy: { sectieId: "asc" },
      },
    },
  });
}
