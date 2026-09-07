import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth";
import { authOptions } from "~/pages/api/auth/[...nextauth]";
import { userHasRight } from "~/types/utils";
import { VSSecurityTopic } from "~/types/securityprofile";
import { prisma } from "~/server/db";
import { TESTGEMEENTE_NAME } from "~/data/testgemeente-data";
import { DEFAULT_SIMULATION_START_DATE } from "~/lib/parking-simulation/types";
import { getSectionCapacity } from "~/lib/parking-simulation/stalling-layout";

type BezettingSnapshot = {
  locationid: string;
  sectionid: string;
  occupation: number;
  capacity: number;
};

async function bezettingSnapshots(
  simulationConfigId: string,
  keys: Array<{ locationid: string; sectionid: string }>
): Promise<BezettingSnapshot[]> {
  const seen = new Set<string>();
  const out: BezettingSnapshot[] = [];
  for (const k of keys) {
    const id = `${k.locationid}|${k.sectionid}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const [occupation, capacity] = await Promise.all([
      prisma.parkingsimulation_section_assignments.count({
        where: { simulationConfigId, locationid: k.locationid, sectionid: k.sectionid },
      }),
      getSectionCapacity(k.locationid, k.sectionid),
    ]);
    out.push({ locationid: k.locationid, sectionid: k.sectionid, occupation, capacity });
  }
  return out;
}


/**
 * GET: full simulation state (session, bicycles, occupation).
 * POST: update occupation (park, remove, move). Body: { action: 'park'|'remove'|'move', bicycleId, locationid?, sectionid?, targetLocationid?, targetSectionid?, checkedIn? }
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
    try {
      const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body ?? {};
      const {
        action,
        bicycleId,
        locationid,
        sectionid,
        targetLocationid,
        targetSectionid,
        checkedIn,
        passID,
        externalTransactionID,
        checkInDate,
      } = body;

      if (!bicycleId) {
        return res.status(400).json({ ok: false, message: "bicycleId required" });
      }

      const bicycle = await prisma.parkingsimulation_bicycles.findFirst({
        where: { id: bicycleId },
        include: { simulationConfig: true },
      });
      if (!bicycle) {
        return res.status(404).json({ ok: false, message: "Bicycle not found" });
      }

      if (action === "remove") {
        const assignmentsBefore = await prisma.parkingsimulation_section_assignments.findMany({
          where: { bicycleId },
          select: { locationid: true, sectionid: true, simulationConfigId: true },
        });
        await prisma.parkingsimulation_section_assignments.deleteMany({
          where: { bicycleId },
        });
        const bezetting = await bezettingSnapshots(
          bicycle.simulationConfigId,
          assignmentsBefore.map((a) => ({ locationid: a.locationid, sectionid: a.sectionid }))
        );
        return res.status(200).json({ ok: true, bezetting });
      }

      if (action === "park" || action === "move") {
        const loc = action === "move" ? targetLocationid : locationid;
        const sec = action === "move" ? targetSectionid : sectionid;
        if (!loc || !sec) {
          return res.status(400).json({ ok: false, message: "locationid and sectionid required" });
        }

        const parsedCheckInDate =
          typeof checkInDate === "string" && checkInDate.trim() !== "" ? new Date(checkInDate) : null;
        const checkInDateValue =
          parsedCheckInDate && !Number.isNaN(parsedCheckInDate.getTime()) ? parsedCheckInDate : null;

        // Layout queries stay outside the write transaction (ACC DB is slower; default tx timeout is 5s).
        const capacity = await getSectionCapacity(loc, sec);
        if (capacity <= 0) {
          return res.status(409).json({
            ok: false,
            message: `Geen capaciteit voor sectie ${sec} in ${loc}. Controleer secties/plekken van de teststalling.`,
          });
        }

        let assignmentsBefore: Array<{ locationid: string; sectionid: string; simulationConfigId: string }> = [];
        try {
          await prisma.$transaction(async (tx) => {
            assignmentsBefore = await tx.parkingsimulation_section_assignments.findMany({
              where: { bicycleId },
              select: { locationid: true, sectionid: true, simulationConfigId: true },
            });
            await tx.parkingsimulation_section_assignments.deleteMany({
              where: { bicycleId },
            });

            const occupied = await tx.parkingsimulation_section_assignments.count({
              where: { simulationConfigId: bicycle.simulationConfigId, locationid: loc, sectionid: sec },
            });
            if (occupied >= capacity) {
              throw new Error("Section at capacity");
            }

            await tx.parkingsimulation_section_assignments.create({
              data: {
                simulationConfigId: bicycle.simulationConfigId,
                bicycleId,
                locationid: loc,
                sectionid: sec,
                checkedIn: checkedIn ?? false,
                passID: passID ?? null,
                externalTransactionID: typeof externalTransactionID === "string" ? externalTransactionID : null,
                checkInDate: checkInDateValue,
              },
            });
          });
        } catch (e) {
          if (e instanceof Error && e.message === "Section at capacity") {
            return res.status(409).json({ ok: false, message: `Sectie ${sec} is vol.` });
          }
          throw e;
        }
        const keys = [{ locationid: loc, sectionid: sec }, ...assignmentsBefore];
        const bezetting = await bezettingSnapshots(bicycle.simulationConfigId, keys);
        return res.status(200).json({ ok: true, bezetting });
      }

      return res.status(400).json({ ok: false, message: "action must be park, remove, or move" });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[parking-simulation/state] POST failed", e);
      return res.status(500).json({ ok: false, message: msg });
    }
  }

  const contact = await prisma.contacts.findFirst({
    where: { CompanyName: TESTGEMEENTE_NAME, ItemType: "organizations", Status: "1" },
    select: { ID: true },
  });
  const siteID = contact?.ID ?? null;
  if (!siteID) {
    return res.status(200).json({ session: null, bicycles: [], occupation: [] });
  }

  let pmConfig = await prisma.parkingsimulation_simulation_config.findUnique({
    where: { siteID },
    include: {
      bicycles: true,
    },
  });

  if (!pmConfig) {
    const startDate = DEFAULT_SIMULATION_START_DATE;
    const simulationTimeOffsetSeconds = Math.floor((Date.now() - startDate.getTime()) / 1000);
    pmConfig = await prisma.parkingsimulation_simulation_config.create({
      data: {
        siteID,
        defaultBiketypeID: 1,
        defaultIdtype: 0,
        simulationTimeOffsetSeconds,
      },
      include: { bicycles: true },
    });
  }

  const assignments = await prisma.parkingsimulation_section_assignments.findMany({
    where: {
      simulationConfigId: pmConfig.id,
    },
    include: { bicycle: true },
  });

  const checkedInBarcodes = assignments
    .filter((a) => a.checkedIn && a.bicycle?.barcode && !a.passID)
    .map((a) => a.bicycle!.barcode);
  const pasidsByBarcode = new Map<string, string>();
  if (checkedInBarcodes.length > 0) {
    const pasids = await prisma.accounts_pasids.findMany({
      where: { SiteID: siteID, barcodeFiets: { in: checkedInBarcodes } },
      select: { PasID: true, barcodeFiets: true },
    });
    for (const p of pasids) {
      if (p.barcodeFiets) pasidsByBarcode.set(p.barcodeFiets, p.PasID);
    }
  }

  return res.status(200).json({
    session: {
      id: pmConfig.id,
      siteID: pmConfig.siteID,
      defaultBiketypeID: pmConfig.defaultBiketypeID,
      defaultIdtype: pmConfig.defaultIdtype,
      simulationTimeOffsetSeconds: pmConfig.simulationTimeOffsetSeconds,
    },
    bicycles: pmConfig.bicycles,
    occupation: assignments.map((a) => ({
      id: a.id,
      bicycleId: a.bicycleId,
      locationid: a.locationid,
      sectionid: a.sectionid,
      checkedIn: a.checkedIn,
      passID: a.checkedIn ? (a.passID ?? (a.bicycle?.barcode ? pasidsByBarcode.get(a.bicycle.barcode) ?? null : null)) : null,
      externalTransactionID: a.externalTransactionID,
      checkInDate: a.checkInDate?.toISOString() ?? null,
      createdAt: a.createdAt.toISOString(),
      bicycle: a.bicycle,
    })),
  });
}
