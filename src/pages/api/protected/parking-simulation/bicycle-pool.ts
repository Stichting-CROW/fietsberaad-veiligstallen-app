import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth";
import { authOptions } from "~/pages/api/auth/[...nextauth]";
import { userHasRight } from "~/types/utils";
import { VSSecurityTopic } from "~/types/securityprofile";
import { prisma } from "~/server/db";
import { TESTGEMEENTE_NAME } from "~/data/testgemeente-data";
import { DEFAULT_SIMULATION_START_DATE } from "~/lib/parking-simulation/types";
import type { BicyclePoolConfig } from "~/lib/parking-simulation/types";

/**
 * Create or delete bicycle pool. Fietsberaad superadmin only.
 * POST: { bicyclePool: [{ biketypeID, count }] }
 * DELETE: { biketypeID?: number } - delete bikes of type (or all if omitted). Only deletes bikes not in occupation.
 */
export default async function handle(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST" && req.method !== "DELETE") {
    res.setHeader("Allow", "POST, DELETE");
    return res.status(405).json({ message: "Method not allowed" });
  }

  const session = await getServerSession(req, res, authOptions);
  if (!session?.user) {
    return res.status(401).json({ message: "Niet ingelogd" });
  }
  if (!userHasRight(session.user.securityProfile, VSSecurityTopic.fietsberaad_superadmin)) {
    return res.status(403).json({ message: "Geen rechten" });
  }

  const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body ?? {};

  const contact = await prisma.contacts.findFirst({
    where: { CompanyName: TESTGEMEENTE_NAME, ItemType: "organizations", Status: "1" },
    select: { ID: true },
  });
  if (!contact) {
    return res.status(400).json({ message: "Testgemeente not found" });
  }

  let pmConfig = await prisma.parkingsimulation_simulation_config.findUnique({
    where: { siteID: contact.ID },
  });
  if (!pmConfig) {
    const startDate = DEFAULT_SIMULATION_START_DATE;
    const simulationTimeOffsetSeconds = Math.floor((Date.now() - startDate.getTime()) / 1000);
    pmConfig = await prisma.parkingsimulation_simulation_config.create({
      data: {
        siteID: contact.ID,
        defaultBiketypeID: 1,
        defaultIdtype: 0,
        simulationTimeOffsetSeconds,
      },
    });
  }

  if (req.method === "DELETE") {
    const biketypeID = body.biketypeID != null ? Number(body.biketypeID) : undefined;
    const occupiedAssignments = await prisma.parkingsimulation_section_assignments.findMany({
      select: { bicycleId: true },
    });
    const occupiedSet = new Set(occupiedAssignments.map((o) => o.bicycleId));
    const where: { simulationConfigId: string; id?: { notIn: string[] }; biketypeID?: number } = {
      simulationConfigId: pmConfig.id,
      id: { notIn: Array.from(occupiedSet) },
    };
    if (biketypeID != null) where.biketypeID = biketypeID;
    const result = await prisma.parkingsimulation_bicycles.deleteMany({ where });
    return res.status(200).json({ deleted: result.count });
  }

  const bicyclePool = (body.bicyclePool ?? body.bicyclepool ?? []) as BicyclePoolConfig;
  if (!Array.isArray(bicyclePool) || bicyclePool.length === 0) {
    return res.status(400).json({ message: "bicyclePool array required with at least one { biketypeID, count }" });
  }

  const existing = await prisma.parkingsimulation_bicycles.count({
    where: { simulationConfigId: pmConfig.id },
  });
  let seq = existing + 1;

  const created: { id: string; barcode: string; biketypeID: number }[] = [];
  for (const entry of bicyclePool) {
    const biketypeID = Number(entry.biketypeID) || 1;
    const count = Math.max(0, Math.min(100, Number(entry.count) || 0));
    for (let i = 0; i < count; i++) {
      const barcode = `SIM-BIKE-${String(seq).padStart(3, "0")}`;
      const bike = await prisma.parkingsimulation_bicycles.create({
        data: {
          simulationConfigId: pmConfig.id,
          barcode,
          biketypeID,
          status: "available",
        },
      });
      created.push({ id: bike.id, barcode: bike.barcode, biketypeID: bike.biketypeID });
      seq++;
    }
  }

  return res.status(200).json({ created: created.length, bicycles: created });
}
