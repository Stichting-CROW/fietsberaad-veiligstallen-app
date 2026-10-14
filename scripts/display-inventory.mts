/**
 * Pre-cutover inventory for external displays (presentaties, verwijssysteem, overzichten).
 * Run: npx tsx scripts/display-inventory.mts
 */
import { PrismaClient } from "../src/generated/prisma-client/index.js";

const prisma = new PrismaClient();

async function main() {
  const presentations = await prisma.presentations.groupBy({
    by: ["SiteID"],
    where: { Status: "1" },
    _count: { ID: true },
    _max: { DateModified: true },
  });

  const ticker = await prisma.presentations_ticker.groupBy({
    by: ["SiteID"],
    _count: { ID: true },
    _max: { DateModified: true },
  });

  const verwijssysteem = await prisma.fietsenstallingen.findMany({
    where: { OR: [{ Verwijssysteem: true }, { VerwijssysteemOverzichten: true }] },
    select: {
      ID: true,
      Title: true,
      SiteID: true,
      StallingsID: true,
      Verwijssysteem: true,
      VerwijssysteemOverzichten: true,
      BronBezettingsdata: true,
    },
  });

  const totals = await prisma.$queryRaw<
    { zipID: string; jaar: number; transacties: number }[]
  >`SELECT zipID, jaar, transacties FROM transacties_gemeente_totaal WHERE jaar = YEAR(CURDATE()) ORDER BY transacties DESC LIMIT 20`;

  const councils = await prisma.contacts.findMany({
    where: {
      ID: { in: [...new Set(presentations.map((p) => p.SiteID))] },
    },
    select: { ID: true, CompanyName: true, UrlName: true },
  });

  console.log(JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      activePresentationsBySite: presentations,
      tickerBySite: ticker,
      councilsWithPresentations: councils,
      stallingenVerwijssysteemFlags: verwijssysteem,
      transactiesGemeenteTotaalTop: totals,
      note: "Compare Azure access logs for presentaties/verwijssysteem/overzichten hosts separately.",
    },
    null,
    2
  ));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
