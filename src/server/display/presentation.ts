import { prisma } from "~/server/db";
import { memoFetch } from "./memo";

const FIETSWIN_TYPES = new Set(["Prijzenpot", "Winkansen"]);

export async function getActivePresentations(siteId: string, bikeparkId?: string) {
  const slides = await prisma.presentations.findMany({
    where: { SiteID: siteId, Status: "1" },
    orderBy: { SortOrder: "asc" },
  });

  let filtered = slides.filter((s) => !FIETSWIN_TYPES.has(s.ContentType ?? ""));

  if (bikeparkId) {
    const bikepark = await prisma.fietsenstallingen.findUnique({
      where: { ID: bikeparkId },
      select: { dia: true },
    });
    filtered = filtered.filter((s) => {
      if (s.ContentType !== "Bikepark") return true;
      return (bikepark?.dia?.length ?? 0) > 0;
    });
  } else {
    filtered = filtered.filter(
      (s) => s.ContentType !== "Bikepark" && s.ContentType !== "Openingstijden"
    );
  }

  return filtered;
}

export async function getPresentationBundle(siteId: string) {
  return memoFetch(`presentation:${siteId}`, async () => {
    const [slides, ticker, council] = await Promise.all([
      prisma.presentations.findMany({
        where: { SiteID: siteId, Status: "1" },
        orderBy: { SortOrder: "asc" },
      }),
      prisma.presentations_ticker.findMany({
        where: { SiteID: siteId },
        orderBy: { SortOrder: "asc" },
      }),
      prisma.contacts.findUnique({
        where: { ID: siteId },
        select: {
          ThemeColor1: true,
          ThemeColor2: true,
          CompanyLogo2: true,
          ZipID: true,
        },
      }),
    ]);
    return { slides, ticker, council };
  });
}

export async function listPresentationCouncils() {
  const siteIds = (
    await prisma.presentations.findMany({
      where: { Status: "1" },
      distinct: ["SiteID"],
      select: { SiteID: true },
    })
  )
    .map((p) => p.SiteID)
    .filter((id): id is string => !!id);

  const councils = await prisma.contacts.findMany({
    where: { ID: { in: siteIds } },
    select: { ID: true, CompanyName: true },
    orderBy: { CompanyName: "asc" },
  });

  const result = [];
  for (const c of councils) {
    const stallings = await prisma.fietsenstallingen.findMany({
      where: { SiteID: c.ID, Status: "1" },
      select: { ID: true, Title: true },
      orderBy: { Title: "asc" },
    });
    result.push({ council: c, stallings });
  }
  return result;
}

export async function getParkedBikesCountForCouncilYear(zipId: string | null, year: number): Promise<number> {
  if (!zipId) return 0;
  const zipNum = parseInt(zipId, 10);
  if (Number.isNaN(zipNum)) return 0;
  const row = await prisma.transacties_gemeente_totaal.findUnique({
    where: { zipID_jaar: { zipID: zipNum, jaar: year } },
  });
  return row?.transacties ?? 0;
}
