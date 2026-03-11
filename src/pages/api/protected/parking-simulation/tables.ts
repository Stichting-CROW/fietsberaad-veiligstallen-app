import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth";
import { authOptions } from "~/pages/api/auth/[...nextauth]";
import { userHasRight } from "~/types/utils";
import { VSSecurityTopic } from "~/types/securityprofile";
import { prisma } from "~/server/db";
import { TESTGEMEENTE_NAME } from "~/data/testgemeente-data";
import { DEFAULT_SIMULATION_START_DATE } from "~/lib/parking-simulation/types";
import { createParkingsimulationTables } from "~/backend/services/database/ParkingsimulationTableActions";

const PARKINGSIMULATION_TABLES = [
  "parkingsimulation_section_assignments",
  "parkingsimulation_bicycles",
  "parkingsimulation_simulation_config",
];

async function checkTablesExist(): Promise<boolean> {
  const result = await prisma.$queryRawUnsafe<{ count: bigint }[]>(
    `SELECT COUNT(*) as count FROM information_schema.tables 
     WHERE table_schema = DATABASE() 
     AND table_name IN (${PARKINGSIMULATION_TABLES.map((t) => `'${t}'`).join(",")})`
  );
  const count = Number(result?.[0]?.count ?? 0);
  return count === PARKINGSIMULATION_TABLES.length;
}

/**
 * Create / reset / remove parkingsimulation tables. Fietsberaad superadmin only.
 * GET: status { tablesExist: boolean }
 * POST Body: { action: 'create'|'reset'|'remove', startDate?: string }
 * create: create parkingsimulation tables via raw SQL (same pattern as cache tables)
 * reset: clear data, reset clock (see below)
 * remove: drop parkingsimulation_* tables
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
    console.log("[parking-simulation/reset] Start of reset");
    // startDate from body is ISO string (UTC); store as UTC in DB
    const startDate = body.startDate ? new Date(body.startDate) : DEFAULT_SIMULATION_START_DATE;
    const contact = await prisma.contacts.findFirst({
      where: { CompanyName: TESTGEMEENTE_NAME, ItemType: "organizations", Status: "1" },
      select: { ID: true },
    });
    if (contact) {
      const pmConfig = await prisma.parkingsimulation_simulation_config.findUnique({
        where: { siteID: contact.ID },
      });
      if (pmConfig) {
        const nowMs = Date.now();
        const startMs = startDate.getTime();
        const offsetSeconds = Math.floor((nowMs - startMs) / 1000);
        await prisma.parkingsimulation_simulation_config.update({
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
            prisma.new_financialtransactions.deleteMany({ where: { bikeparkID: { in: stallingsIDs } } }),
          );
        }
        if (stallingsIds.length > 0) {
          deletes.push(
            prisma.transacties.deleteMany({ where: { FietsenstallingID: { in: stallingsIds } } }),
            prisma.new_transacties.deleteMany({ where: { FietsenstallingID: { in: stallingsIds } } }),
          );
        }
        await prisma.$transaction(deletes);

        // new_accounts_pasids and new_accounts: scoped by SiteID (testgemeente contact)
        const pasidsToDelete = await prisma.new_accounts_pasids.findMany({
          where: { SiteID: contact.ID },
          select: { AccountID: true },
        });
        const accountIds = [...new Set(pasidsToDelete.map((p) => p.AccountID).filter((id): id is string => id != null))];
        if (accountIds.length > 0) {
          await prisma.$transaction([
            prisma.new_financialtransactions.deleteMany({ where: { accountID: { in: accountIds } } }),
            prisma.new_accounts_pasids.deleteMany({ where: { SiteID: contact.ID } }),
            prisma.new_accounts.deleteMany({ where: { ID: { in: accountIds } } }),
          ]);
        } else {
          await prisma.new_accounts_pasids.deleteMany({ where: { SiteID: contact.ID } });
        }
      }

      await prisma.parkingsimulation_section_assignments.deleteMany({});
      if (pmConfig) {
        await prisma.parkingsimulation_bicycles.updateMany({
          where: { simulationConfigId: pmConfig.id },
          data: { status: "available" },
        });
      }
    } else {
      await prisma.parkingsimulation_section_assignments.deleteMany({});
    }
    console.log("[parking-simulation/reset] End of reset");
    return res.status(200).json({ ok: true, message: "Data reset" });
  }

  if (action === "create") {
    const alreadyExist = await checkTablesExist();
    if (alreadyExist) {
      return res.status(200).json({ ok: true, message: "Tabellen bestaan al", tablesExist: true });
    }
    const success = await createParkingsimulationTables();
    const tablesExist = await checkTablesExist();
    if (success && tablesExist) {
      return res.status(200).json({ ok: true, message: "Tabellen aangemaakt", tablesExist: true });
    }
    if (!success) {
      return res.status(500).json({ ok: false, message: "Fout bij aanmaken tabellen", tablesExist });
    }
    return res.status(200).json({
      ok: true,
      message: "Controleer of parkingsimulation-tabellen bestaan",
      tablesExist,
    });
  }

  if (action === "remove") {
    try {
      await prisma.$executeRawUnsafe("SET FOREIGN_KEY_CHECKS = 0");
      // Drop in reverse FK order: section_assignments → bicycles → simulation_config
      const tablesToDrop = [...PARKINGSIMULATION_TABLES];
      for (const table of tablesToDrop) {
        await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS \`${table}\``);
      }
      await prisma.$executeRawUnsafe("SET FOREIGN_KEY_CHECKS = 1");
      const tablesExist = await checkTablesExist();
      return res.status(200).json({ ok: true, message: "Tabellen verwijderd", tablesExist });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return res.status(500).json({ ok: false, message: "Fout bij verwijderen: " + msg });
    }
  }

  return res.status(400).json({ message: "action must be create, reset or remove" });
}
