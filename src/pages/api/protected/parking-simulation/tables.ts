import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth";
import { authOptions } from "~/pages/api/auth/[...nextauth]";
import { userHasRight } from "~/types/utils";
import { VSSecurityTopic } from "~/types/securityprofile";
import { prisma } from "~/server/db";
import { TESTGEMEENTE_NAME } from "~/data/testgemeente-data";
import { DEFAULT_SIMULATION_START_DATE } from "~/lib/parking-simulation/types";
import { createParkingmgmtTables } from "~/backend/services/database/ParkingmgmtTableActions";

const PARKINGMGMT_TABLES = [
  "parkingmgmt_occupation",
  "parkingmgmt_spot_detection",
  "parkingmgmt_bicycles",
  "parkingmgmt_simulation_config",
];

async function checkTablesExist(): Promise<boolean> {
  const result = await prisma.$queryRawUnsafe<{ count: bigint }[]>(
    `SELECT COUNT(*) as count FROM information_schema.tables 
     WHERE table_schema = DATABASE() 
     AND table_name IN (${PARKINGMGMT_TABLES.map((t) => `'${t}'`).join(",")})`
  );
  const count = Number(result?.[0]?.count ?? 0);
  return count === PARKINGMGMT_TABLES.length;
}

/**
 * Create / reset / remove parkingmgmt tables. Fietsberaad superadmin only.
 * GET: status { tablesExist: boolean }
 * POST Body: { action: 'create'|'reset'|'remove', startDate?: string }
 * create: create parkingmgmt tables via raw SQL (same pattern as cache tables)
 * reset: clear data, reset clock (see below)
 * remove: drop parkingmgmt_* tables
 */
export default async function handle(req: NextApiRequest, res: NextApiResponse) {
  const session = await getServerSession(req, res, authOptions);
  if (!session?.user) {
    return res.status(401).json({ message: "Niet ingelogd" });
  }
  if (!userHasRight(session.user.securityProfile, VSSecurityTopic.fietsberaad_superadmin)) {
    return res.status(403).json({ message: "Geen rechten" });
  }

  if (req.method === "GET") {
    try {
      const tablesExist = await checkTablesExist();
      return res.status(200).json({ tablesExist });
    } catch (e) {
      return res.status(500).json({ tablesExist: false, error: String(e) });
    }
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ message: "Method not allowed" });
  }

  const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body ?? {};
  const action = body.action ?? "reset";

  if (action === "reset") {
    // startDate from body is ISO string (UTC); store as UTC in DB
    const startDate = body.startDate ? new Date(body.startDate) : DEFAULT_SIMULATION_START_DATE;
    const contact = await prisma.contacts.findFirst({
      where: { CompanyName: TESTGEMEENTE_NAME, ItemType: "organizations", Status: "1" },
      select: { ID: true },
    });
    if (contact) {
      const pmConfig = await prisma.parkingmgmt_simulation_config.findUnique({
        where: { siteID: contact.ID },
      });
      if (pmConfig) {
        const nowMs = Date.now();
        const startMs = startDate.getTime();
        const offsetSeconds = Math.floor((nowMs - startMs) / 1000);
        await prisma.parkingmgmt_simulation_config.update({
          where: { id: pmConfig.id },
          data: { simulationTimeOffsetSeconds: offsetSeconds, simulationStartDate: startDate },
        });
      }

      // Delete transaction data for teststallingen only (wachtrij_*, transacties, transacties_archief, new_*).
      // Prisma delete of fietsenstallingen does NOT cascade to these tables (no FK).
      const teststallings = await prisma.fietsenstallingen.findMany({
        where: { SiteID: contact.ID, StallingsID: { not: null } },
        select: { ID: true, StallingsID: true },
      });
      const stallingsIds = teststallings.map((s) => s.ID);
      const stallingsIDs = teststallings.map((s) => s.StallingsID).filter((id): id is string => id != null);

      if (stallingsIDs.length > 0 || stallingsIds.length > 0) {
        const deletes: Promise<unknown>[] = [];
        if (stallingsIDs.length > 0) {
          deletes.push(
            prisma.wachtrij_transacties.deleteMany({ where: { bikeparkID: { in: stallingsIDs } } }),
            prisma.wachtrij_pasids.deleteMany({ where: { bikeparkID: { in: stallingsIDs } } }),
            prisma.wachtrij_betalingen.deleteMany({ where: { bikeparkID: { in: stallingsIDs } } }),
            prisma.wachtrij_sync.deleteMany({ where: { bikeparkID: { in: stallingsIDs } } }),
            prisma.new_wachtrij_transacties.deleteMany({ where: { bikeparkID: { in: stallingsIDs } } }),
            prisma.new_wachtrij_pasids.deleteMany({ where: { bikeparkID: { in: stallingsIDs } } }),
            prisma.new_wachtrij_betalingen.deleteMany({ where: { bikeparkID: { in: stallingsIDs } } }),
            prisma.new_wachtrij_sync.deleteMany({ where: { bikeparkID: { in: stallingsIDs } } }),
            prisma.transacties_archief.deleteMany({ where: { locationid: { in: stallingsIDs } } }),
            prisma.new_transacties_archief.deleteMany({ where: { locationid: { in: stallingsIDs } } }),
          );
        }
        if (stallingsIds.length > 0) {
          deletes.push(
            prisma.transacties.deleteMany({ where: { FietsenstallingID: { in: stallingsIds } } }),
            prisma.new_transacties.deleteMany({ where: { FietsenstallingID: { in: stallingsIds } } }),
          );
        }
        await prisma.$transaction(deletes);
      }

      await prisma.parkingmgmt_occupation.deleteMany({});
      await prisma.parkingmgmt_spot_detection.deleteMany({});
      if (pmConfig) {
        await prisma.parkingmgmt_bicycles.updateMany({
          where: { simulationConfigId: pmConfig.id },
          data: { status: "available" },
        });
      }
    } else {
      await prisma.parkingmgmt_occupation.deleteMany({});
      await prisma.parkingmgmt_spot_detection.deleteMany({});
    }
    return res.status(200).json({ ok: true, message: "Data reset" });
  }

  if (action === "create") {
    const alreadyExist = await checkTablesExist();
    if (alreadyExist) {
      return res.status(200).json({ ok: true, message: "Tabellen bestaan al", tablesExist: true });
    }
    const success = await createParkingmgmtTables();
    const tablesExist = await checkTablesExist();
    if (success && tablesExist) {
      return res.status(200).json({ ok: true, message: "Tabellen aangemaakt", tablesExist: true });
    }
    if (!success) {
      return res.status(500).json({ ok: false, message: "Fout bij aanmaken tabellen", tablesExist });
    }
    return res.status(200).json({
      ok: true,
      message: "Controleer of parkingmgmt-tabellen bestaan",
      tablesExist,
    });
  }

  if (action === "remove") {
    const tablesExist = await checkTablesExist();
    if (!tablesExist) {
      return res.status(200).json({ ok: true, message: "Tabellen bestaan niet", tablesExist: false });
    }
    try {
      await prisma.$executeRawUnsafe("SET FOREIGN_KEY_CHECKS = 0");
      for (const table of PARKINGMGMT_TABLES) {
        await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS \`${table}\``);
      }
      await prisma.$executeRawUnsafe("SET FOREIGN_KEY_CHECKS = 1");
      return res.status(200).json({ ok: true, message: "Tabellen verwijderd", tablesExist: false });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return res.status(500).json({ ok: false, message: "Fout bij verwijderen: " + msg });
    }
  }

  return res.status(400).json({ message: "action must be create, reset or remove" });
}
