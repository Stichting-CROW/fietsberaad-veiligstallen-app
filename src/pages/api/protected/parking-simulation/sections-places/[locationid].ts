import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth";
import { authOptions } from "~/pages/api/auth/[...nextauth]";
import { userHasRight } from "~/types/utils";
import { VSSecurityTopic } from "~/types/securityprofile";
import { prisma } from "~/server/db";
import { getLocation } from "~/server/services/fms/fms-v3-service";
import { TESTGEMEENTE_NAME } from "~/data/testgemeente-data";

/**
 * Get sections and places for a location. Fietsberaad superadmin only.
 * When useLocalProcessor: occupancy from new_transacties (open records).
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

  const locationid = req.query.locationid as string;
  if (!locationid) {
    return res.status(400).json({ message: "locationid required" });
  }

  let useNewTables = false;
  const contact = await prisma.contacts.findFirst({
    where: { CompanyName: TESTGEMEENTE_NAME, ItemType: "organizations", Status: "1" },
    select: { ID: true },
  });
  if (contact) {
    const pmConfig = await prisma.parkingsimulation_simulation_config.findUnique({
      where: { siteID: contact.ID },
      select: { useLocalProcessor: true },
    });
    useNewTables = pmConfig?.useLocalProcessor ?? false;
  }

  const location = await getLocation(locationid, 3, useNewTables);
  if (!location) {
    return res.status(404).json({ message: "Location not found" });
  }

  return res.status(200).json(location);
}
