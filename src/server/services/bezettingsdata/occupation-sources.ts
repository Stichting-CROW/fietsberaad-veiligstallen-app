import { prisma } from "~/server/db";

/**
 * Distinct bezettingsdata.source values for one stalling
 * (ColdFusion FietsEnWinGateway.getQOccupationSourcesForBikepark).
 *
 * bezettingsdata has an index on (source, bikeparkID) and none on
 * (bikeparkID, source): list the few sources first, then check each one for
 * this stalling.
 */
export async function getOccupationSourcesForBikepark(bikeparkID: string): Promise<string[]> {
  const rows = await prisma.$queryRaw<{ source: string }[]>`
    SELECT s.source
    FROM (SELECT DISTINCT source FROM bezettingsdata WHERE source IS NOT NULL) s
    WHERE EXISTS (
      SELECT 1 FROM bezettingsdata b WHERE b.source = s.source AND b.bikeparkID = ${bikeparkID}
    )
    ORDER BY s.source`;
  return rows.map((row) => row.source);
}
