import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth";
import { authOptions } from "~/pages/api/auth/[...nextauth]";
import { userHasRight } from "~/types/utils";
import { VSSecurityTopic } from "~/types/securityprofile";
import { prisma } from "~/server/db";
import { TESTGEMEENTE_NAME } from "~/data/testgemeente-data";
import { getStallingLayoutFromVeiligstallen } from "~/lib/parking-simulation/stalling-layout";

/**
 * GET: Section-based occupation for a location.
 * Returns sections with capacity (from sectie_fietstype), parked bicycles (with bike type from bicycle),
 * and Onbezet (one total per section = capacity - occupied).
 * No place/slot assignment; bicycles linked to sections only.
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

  const contact = await prisma.contacts.findFirst({
    where: { CompanyName: TESTGEMEENTE_NAME, ItemType: "organizations", Status: "1" },
    select: { ID: true },
  });
  if (!contact) {
    return res.status(200).json({ data: [], categories: { bikeTypeIds: [], hasUnknownCategoryOnly: false } });
  }

  const pmConfig = await prisma.parkingsimulation_simulation_config.findUnique({
    where: { siteID: contact.ID },
  });
  if (!pmConfig) {
    return res.status(200).json({ data: [], categories: { bikeTypeIds: [], hasUnknownCategoryOnly: false } });
  }

  const layout = await getStallingLayoutFromVeiligstallen(locationid);
  if (!layout) {
    return res.status(404).json({ message: "Location not found" });
  }

  const assignments = await prisma.parkingsimulation_section_assignments.findMany({
    where: { simulationConfigId: pmConfig.id, locationid },
    include: { bicycle: true },
  });

  const categories = {
    bikeTypeIds: layout.categoriesWithCapacity,
    hasUnknownCategoryOnly: layout.hasUnknownCategoryOnly,
  };

  const sections = layout.sections.map((sec) => {
    const capacityFromBiketypes = sec.biketypes.reduce((sum, bt) => sum + bt.capacity, 0);
    const capacity = capacityFromBiketypes > 0 ? capacityFromBiketypes : sec.places.length;
    const sectionAssignments = assignments.filter((a) => a.sectionid === sec.sectionid);
    const occupied = sectionAssignments.length;
    const onbezet = Math.max(0, capacity - occupied);

    return {
      sectionid: sec.sectionid,
      capacity,
      occupied,
      onbezet,
      parkedBicycles: sectionAssignments.map((a) => ({
        id: a.id,
        bicycleId: a.bicycleId,
        bicycle: a.bicycle,
        checkedIn: a.checkedIn,
        passID: a.passID,
        createdAt: a.createdAt?.toISOString() ?? null,
      })),
    };
  });

  return res.status(200).json({
    data: sections,
    categories,
  });
}
