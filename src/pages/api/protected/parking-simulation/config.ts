import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth";
import { authOptions } from "~/pages/api/auth/[...nextauth]";
import { userHasRight } from "~/types/utils";
import { VSSecurityTopic } from "~/types/securityprofile";
import { prisma } from "~/server/db";
import { TESTGEMEENTE_NAME } from "~/data/testgemeente-data";
import { DEFAULT_SIMULATION_START_DATE } from "~/lib/parking-simulation/types";

/**
 * GET config, PATCH to update (simulationTimeOffsetSeconds, apiUsername, apiPasswordEncrypted, baseUrl, processQueueBaseUrl).
 * Reads/writes parkingmgmt_simulation_config. Fietsberaad superadmin only.
 */
export default async function handle(req: NextApiRequest, res: NextApiResponse) {
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
    return res.status(200).json({ session: null });
  }

  let pmConfig = await prisma.parkingmgmt_simulation_config.findUnique({
    where: { siteID: contact.ID },
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
    });
  }

  if (req.method === "GET") {
    return res.status(200).json({
      session: {
        id: pmConfig.id,
        siteID: pmConfig.siteID,
        apiUsername: pmConfig.apiUsername,
        baseUrl: pmConfig.baseUrl,
        processQueueBaseUrl: pmConfig.processQueueBaseUrl,
        defaultBiketypeID: pmConfig.defaultBiketypeID,
        defaultIdtype: pmConfig.defaultIdtype,
        simulationTimeOffsetSeconds: pmConfig.simulationTimeOffsetSeconds,
        simulationStartDate: pmConfig.simulationStartDate?.toISOString() ?? null,
      },
    });
  }

  if (req.method === "PATCH") {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body ?? {};
    const data: Record<string, unknown> = {};
    if (typeof body.simulationTimeOffsetSeconds === "number") data.simulationTimeOffsetSeconds = body.simulationTimeOffsetSeconds;
    if (body.apiUsername != null) data.apiUsername = body.apiUsername;
    if (body.apiPasswordEncrypted != null) data.apiPasswordEncrypted = body.apiPasswordEncrypted;
    if (body.baseUrl != null) data.baseUrl = body.baseUrl;
    if (body.processQueueBaseUrl != null) data.processQueueBaseUrl = body.processQueueBaseUrl;

    const updated = await prisma.parkingmgmt_simulation_config.update({
      where: { id: pmConfig.id },
      data: data as Parameters<typeof prisma.parkingmgmt_simulation_config.update>[0]["data"],
    });
    return res.status(200).json({
      session: {
        id: updated.id,
        simulationTimeOffsetSeconds: updated.simulationTimeOffsetSeconds,
      },
    });
  }

  res.setHeader("Allow", "GET, PATCH");
  return res.status(405).json({ message: "Method not allowed" });
}
