import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth";
import { authOptions } from "~/pages/api/auth/[...nextauth]";
import { userHasRight } from "~/types/utils";
import { VSSecurityTopic } from "~/types/securityprofile";
import { prisma } from "~/server/db";
import { TESTGEMEENTE_NAME } from "~/data/testgemeente-data";

/**
 * GET: List pasids for the test site (new_accounts_pasids).
 * Ordered by Pastype, PasID, BikeTypeID, barcodeFiets.
 * Fietsberaad superadmin only.
 */
export default async function handle(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ message: "Method not allowed" });
  }

  const session = await getServerSession(req, res, authOptions);
  if (!session?.user) {
    return res.status(401).json({ message: "Niet ingelogd" });
  }
  if (!userHasRight(session.user.securityProfile, VSSecurityTopic.fietsberaad_superadmin)) {
    return res.status(403).json({ message: "Geen rechten" });
  }

  const contact = await prisma.contacts.findFirst({
    where: { CompanyName: TESTGEMEENTE_NAME, ItemType: "organizations", Status: "1" },
    select: { ID: true },
  });
  if (!contact) {
    return res.status(200).json({ data: [] });
  }

  const pasids = await prisma.new_accounts_pasids.findMany({
    where: { SiteID: contact.ID },
    orderBy: [{ Pastype: "asc" }, { PasID: "asc" }, { BikeTypeID: "asc" }, { barcodeFiets: "asc" }],
    select: {
      ID: true,
      PasID: true,
      Pastype: true,
      BikeTypeID: true,
      barcodeFiets: true,
      huidigeFietsenstallingId: true,
    },
  });

  const data = pasids.map((p) => ({
    id: p.ID,
    pasID: p.PasID,
    pastype: p.Pastype,
    bikeTypeID: p.BikeTypeID ?? 1,
    barcodeFiets: p.barcodeFiets,
    hasParkedBike: !!p.huidigeFietsenstallingId,
  }));

  return res.status(200).json({ data });
}
