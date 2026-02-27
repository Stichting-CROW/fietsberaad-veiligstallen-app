import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth";
import { authOptions } from "~/pages/api/auth/[...nextauth]";
import { userHasRight } from "~/types/utils";
import { VSSecurityTopic } from "~/types/securityprofile";
import { prisma } from "~/server/db";
import { TESTGEMEENTE_NAME } from "~/data/testgemeente-data";
import { DEFAULT_SIMULATION_START_DATE } from "~/lib/parking-simulation/types";

/**
 * GET current simulation time (backend-coordinated).
 * simulation_time = real_time - offset. All clients share the same time.
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
    return res.status(200).json({ simulationTime: new Date().toISOString() });
  }

  let pmConfig = await prisma.parkingmgmt_simulation_config.findUnique({
    where: { siteID: contact.ID },
    select: { simulationTimeOffsetSeconds: true },
  });
  if (!pmConfig) {
    const startDate = DEFAULT_SIMULATION_START_DATE;
    const simulationTimeOffsetSeconds = Math.floor((Date.now() - startDate.getTime()) / 1000);
    pmConfig = await prisma.parkingmgmt_simulation_config.create({
      data: {
        siteID: contact.ID,
        defaultBiketypeID: 1,
        defaultIdtype: 0,
        simulationTimeOffsetSeconds,
      },
      select: { simulationTimeOffsetSeconds: true },
    });
  }

  const offsetSeconds = pmConfig.simulationTimeOffsetSeconds ?? 0;
  const simulationTime = new Date(Date.now() - offsetSeconds * 1000);
  return res.status(200).json({ simulationTime: simulationTime.toISOString() });
}
