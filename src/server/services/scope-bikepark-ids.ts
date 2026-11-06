import { prisma } from "~/server/db";

/**
 * Keep only StallingsIDs that belong to the active data owner.
 * An empty active contact yields nothing: a report must not fall back to every site.
 */
export async function stallingIdsForActiveContact(
  activeContactId: string | null | undefined,
  requestedIds: string[],
): Promise<string[]> {
  const ids = [...new Set(requestedIds.filter((id) => id))];
  if (!activeContactId || ids.length === 0) return [];

  const rows = await prisma.fietsenstallingen.findMany({
    where: {
      StallingsID: { in: ids },
      SiteID: activeContactId,
    },
    select: { StallingsID: true },
  });

  const allowed = new Set(
    rows.map((row) => row.StallingsID).filter((id): id is string => !!id),
  );
  return ids.filter((id) => allowed.has(id));
}
