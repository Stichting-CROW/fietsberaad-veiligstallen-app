import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth";
import { authOptions } from "~/pages/api/auth/[...nextauth]";
import { userHasRight } from "~/types/utils";
import { VSSecurityTopic } from "~/types/securityprofile";
import { prisma } from "~/server/db";
import { TESTGEMEENTE_NAME } from "~/data/testgemeente-data";
import { getStallingLayoutFromVeiligstallen, type StallingSection } from "~/lib/parking-simulation/stalling-layout";

function sectionCapacity(sec: StallingSection, fallbackPerSection: number): number {
  const capacityFromBiketypes = sec.biketypes.reduce((sum, bt) => sum + bt.capacity, 0);
  return capacityFromBiketypes > 0 ? capacityFromBiketypes : sec.places.length || Math.round(fallbackPerSection);
}

/**
 * Get sections and places for a location (parkeersimulatie layout).
 * Uses veiligstallen DB config (same source as /slots), not the FMS v3 fields filter
 * which strips sections when no `fields` query param is passed to getLocation().
 * Occupied/free counts come from parkingsimulation_section_assignments (simulation state).
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

  const layout = await getStallingLayoutFromVeiligstallen(locationid);
  if (!layout) {
    return res.status(404).json({ message: "Location not found" });
  }

  const contact = await prisma.contacts.findFirst({
    where: { CompanyName: TESTGEMEENTE_NAME, ItemType: "organizations", Status: "1" },
    select: { ID: true },
  });
  const pmConfig = contact
    ? await prisma.parkingsimulation_simulation_config.findUnique({
        where: { siteID: contact.ID },
        select: { id: true },
      })
    : null;

  const assignments = pmConfig
    ? await prisma.parkingsimulation_section_assignments.findMany({
        where: { simulationConfigId: pmConfig.id, locationid },
        select: { sectionid: true },
      })
    : [];

  const fallbackPerSection =
    layout.sections.length > 0 ? Math.max(1, layout.totalCapacity / layout.sections.length) : 0;

  const sections = layout.sections.map((sec) => {
    const capacity = sectionCapacity(sec, fallbackPerSection);
    const occupied = assignments.filter((a) => a.sectionid === sec.sectionid).length;
    const free = Math.max(0, capacity - occupied);

    const biketypes =
      sec.biketypes.length > 0
        ? sec.biketypes.map((bt) => ({
            biketypeid: bt.bikeTypeID,
            allowed: true,
            capacity: bt.capacity,
          }))
        : capacity > 0
          ? [{ biketypeid: 1, allowed: true, capacity }]
          : [];

    return {
      sectionid: sec.sectionid,
      occupation: occupied,
      capacity,
      free,
      biketypes,
      places: sec.places.map((p) => ({ id: p.id, bikeTypeID: p.bikeTypeID })),
    };
  });

  const totalCapacity =
    sections.reduce((sum, s) => sum + s.capacity, 0) || layout.totalCapacity;
  const occupied = assignments.length;
  const free = Math.max(0, totalCapacity - occupied);

  return res.status(200).json({
    locationid,
    occupied,
    free,
    capacity: totalCapacity,
    sections,
  });
}
