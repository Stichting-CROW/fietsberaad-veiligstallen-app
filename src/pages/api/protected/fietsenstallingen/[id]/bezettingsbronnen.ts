import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth";
import { authOptions } from "~/pages/api/auth/[...nextauth]";
import { validateUserSession } from "~/utils/server/database-tools";
import { prisma } from "~/server/db";
import { validateParkingId } from "~/utils/validation";
import { getOccupationSourcesForBikepark } from "~/server/services/bezettingsdata/occupation-sources";

/**
 * GET: sources that have delivered occupation data for this stalling
 * (ColdFusion getQOccupationSourcesForBikepark). The editor offers these as
 * choices for BronBezettingsdata.
 */
export default async function handle(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Methode niet toegestaan" });
    return;
  }

  const session = await getServerSession(req, res, authOptions);
  if (!session?.user) {
    res.status(401).json({ error: "Niet ingelogd - geen sessie gevonden" });
    return;
  }

  const id = validateParkingId(req.query.id);
  if (!id) {
    res.status(400).json({ error: "Geen stalling opgegeven" });
    return;
  }

  const validateUserSessionResult = await validateUserSession(session, "any");
  if ("error" in validateUserSessionResult) {
    res.status(401).json({ error: validateUserSessionResult.error });
    return;
  }

  const fietsenstalling = await prisma.fietsenstallingen.findFirst({
    where: { ID: id },
    select: { SiteID: true, StallingsID: true },
  });
  if (
    !fietsenstalling?.SiteID ||
    !validateUserSessionResult.sites.includes(fietsenstalling.SiteID)
  ) {
    res.status(403).json({ error: "Geen toegang tot deze stalling" });
    return;
  }

  const sources = fietsenstalling.StallingsID
    ? await getOccupationSourcesForBikepark(fietsenstalling.StallingsID)
    : [];
  res.status(200).json({ data: sources });
}
