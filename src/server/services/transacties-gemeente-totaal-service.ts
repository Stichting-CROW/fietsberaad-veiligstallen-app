import { prisma } from "~/server/db";

/** Port of broncode/remote/remote/updateTotalTransactionsPerCouncil.cfm */
export async function updateTransactiesGemeenteTotaalForYear(year = new Date().getFullYear()) {
  const rows = await prisma.$queryRaw<{ zipID: string; n: bigint }[]>`
    SELECT ZipID as zipID, COUNT(*) as n
    FROM transacties
    WHERE Date_checkin > ${`${year}-01-01 00:00:00`}
    AND Date_checkin < ${`${year + 1}-01-01 00:00:00`}
    GROUP BY ZipID
  `;

  let updated = 0;
  for (const row of rows) {
    const zipNum = parseInt(String(row.zipID), 10);
    if (Number.isNaN(zipNum)) continue;
    const n = Number(row.n);
    await prisma.transacties_gemeente_totaal.upsert({
      where: { zipID_jaar: { zipID: zipNum, jaar: year } },
      create: { zipID: zipNum, jaar: year, transacties: n },
      update: { transacties: n },
    });
    updated++;
  }
  return { year, updated };
}
