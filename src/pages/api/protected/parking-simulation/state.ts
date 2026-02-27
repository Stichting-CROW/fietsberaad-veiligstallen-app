import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth";
import { authOptions } from "~/pages/api/auth/[...nextauth]";
import { userHasRight } from "~/types/utils";
import { VSSecurityTopic } from "~/types/securityprofile";
import { prisma } from "~/server/db";
import { TESTGEMEENTE_NAME } from "~/data/testgemeente-data";
import { DEFAULT_SIMULATION_START_DATE } from "~/lib/parking-simulation/types";

/**
 * GET: full simulation state (session, bicycles, occupation).
 * POST: update occupation (park, remove, move). Body: { action: 'park'|'remove'|'move', bicycleId, locationid?, sectionid?, placeId?, targetLocationid?, targetSectionid?, targetPlaceId?, checkedIn? }
 * Fietsberaad superadmin only.
 */
export default async function handle(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ message: "Method not allowed" });
  }

  const session = await getServerSession(req, res, authOptions);
  if (!session?.user) {
    return res.status(401).json({ message: "Niet ingelogd" });
  }
  if (!userHasRight(session.user.securityProfile, VSSecurityTopic.fietsberaad_superadmin)) {
    return res.status(403).json({ message: "Geen rechten" });
  }

  if (req.method === "POST") {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body ?? {};
    const { action, bicycleId, locationid, sectionid, placeId, targetLocationid, targetSectionid, targetPlaceId, checkedIn } = body;

    if (!bicycleId) {
      return res.status(400).json({ message: "bicycleId required" });
    }

    const bicycle = await prisma.parkingmgmt_bicycles.findFirst({
      where: { id: bicycleId },
      include: { simulationConfig: true },
    });
    if (!bicycle) {
      return res.status(404).json({ message: "Bicycle not found" });
    }

    if (action === "remove") {
      await prisma.parkingmgmt_occupation.deleteMany({
        where: { bicycleId },
      });
      return res.status(200).json({ ok: true });
    }

    if (action === "park" || action === "move") {
      const loc = action === "move" ? targetLocationid : locationid;
      const sec = action === "move" ? targetSectionid : sectionid;
      const plc = action === "move" ? targetPlaceId : placeId;
      if (!loc || !sec) {
        return res.status(400).json({ message: "locationid and sectionid required" });
      }
      await prisma.parkingmgmt_occupation.deleteMany({ where: { bicycleId } });
      await prisma.parkingmgmt_occupation.create({
        data: {
          bicycleId,
          locationid: loc,
          sectionid: sec,
          placeId: plc ?? null,
          checkedIn: checkedIn ?? false,
        },
      });
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ message: "action must be park, remove, or move" });
  }

  const contact = await prisma.contacts.findFirst({
    where: { CompanyName: TESTGEMEENTE_NAME, ItemType: "organizations", Status: "1" },
    select: { ID: true },
  });
  const siteID = contact?.ID ?? null;
  if (!siteID) {
    return res.status(200).json({ session: null, bicycles: [], occupation: [] });
  }

  let pmConfig = await prisma.parkingmgmt_simulation_config.findUnique({
    where: { siteID },
    include: {
      bicycles: true,
    },
  });

  if (!pmConfig) {
    const startDate = DEFAULT_SIMULATION_START_DATE;
    const simulationTimeOffsetSeconds = Math.floor((Date.now() - startDate.getTime()) / 1000);
    pmConfig = await prisma.parkingmgmt_simulation_config.create({
      data: {
        siteID,
        defaultBiketypeID: 1,
        defaultIdtype: 0,
        simulationTimeOffsetSeconds,
      },
      include: { bicycles: true },
    });
  }

  const occupation = await prisma.parkingmgmt_occupation.findMany({
    where: { bicycle: { simulationConfigId: pmConfig.id } },
    include: { bicycle: true },
  });

  return res.status(200).json({
    session: {
      id: pmConfig.id,
      siteID: pmConfig.siteID,
      defaultBiketypeID: pmConfig.defaultBiketypeID,
      defaultIdtype: pmConfig.defaultIdtype,
      simulationTimeOffsetSeconds: pmConfig.simulationTimeOffsetSeconds,
    },
    bicycles: pmConfig.bicycles,
    occupation: occupation.map((o) => ({
      id: o.id,
      bicycleId: o.bicycleId,
      locationid: o.locationid,
      sectionid: o.sectionid,
      placeId: o.placeId,
      checkedIn: o.checkedIn,
      bicycle: o.bicycle,
    })),
  });
}
