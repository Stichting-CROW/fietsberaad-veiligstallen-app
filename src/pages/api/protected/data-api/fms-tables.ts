import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth";
import { authOptions } from "~/pages/api/auth/[...nextauth]";
import { userHasRight } from "~/types/utils";
import { VSSecurityTopic } from "~/types/securityprofile";
import { prisma } from "~/server/db";
import { formatPrismaErrorCompact, logPrismaError } from "~/utils/formatPrismaError";
import { readFileSync } from "fs";
import { join } from "path";
import { createNewFmsTables } from "~/backend/services/database/NewFmsTableActions";

const FMS_TABLES = [
  "new_wachtrij_transacties",
  "new_wachtrij_pasids",
  "new_wachtrij_betalingen",
  "new_wachtrij_sync",
  "new_transacties",
  "new_transacties_archief",
  "new_accounts",
  "new_accounts_pasids",
  "new_financialtransactions",
  "new_bezettingsdata_tmp",
  "new_bezettingsdata",
];

const TRIGGER_NAMES = [
  "trg_wachtrij_transacties_mirror_to_new",
  "trg_wachtrij_pasids_mirror_to_new",
  "trg_wachtrij_betalingen_mirror_to_new",
  "trg_wachtrij_sync_mirror_to_new",
  "trg_bezettingsdata_tmp_mirror_insert",
  "trg_bezettingsdata_tmp_mirror_update",
];

function getDropSql(): string {
  const triggerDrops = TRIGGER_NAMES.map(
    (n) => `DROP TRIGGER IF EXISTS \`${n}\`;`
  ).join("\n");
  const tableDrops = FMS_TABLES.map(
    (t) => `DROP TABLE IF EXISTS \`${t}\`;`
  ).join("\n");
  return `-- Eerst triggers verwijderen\n${triggerDrops}\n\n-- Daarna tabellen\n${tableDrops}`;
}

function getCreateTriggersSql(): string {
  return readFileSync(
    join(process.cwd(), "src/server/sql/fms-mirror-triggers.sql"),
    "utf-8"
  );
}

export type FmsTablesStatus = {
  tablesExist: boolean;
  triggersExist: boolean;
  tableCounts?: Record<string, number>;
};

async function checkTablesExist(): Promise<boolean> {
  const result = await prisma.$queryRawUnsafe<{ count: number }[]>(
    `SELECT COUNT(*) as count FROM information_schema.tables 
     WHERE table_schema = DATABASE() 
     AND table_name IN (${FMS_TABLES.map((t) => `'${t}'`).join(",")})`
  );
  const count = result?.[0]?.count ?? 0;
  return Number(count) === FMS_TABLES.length;
}

async function checkTriggersExist(): Promise<boolean> {
  const result = await prisma.$queryRawUnsafe<{ count: number }[]>(
    `SELECT COUNT(*) as count FROM information_schema.triggers 
     WHERE trigger_schema = DATABASE() 
     AND trigger_name IN (${TRIGGER_NAMES.map((t) => `'${t}'`).join(",")})`
  );
  const count = result?.[0]?.count ?? 0;
  return Number(count) === TRIGGER_NAMES.length;
}

async function getTableCounts(): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const table of FMS_TABLES) {
    try {
      const result = await prisma.$queryRawUnsafe<{ count: bigint }[]>(
        `SELECT COUNT(*) as count FROM \`${table}\``
      );
      counts[table] = Number(result?.[0]?.count ?? 0);
    } catch {
      counts[table] = -1;
    }
  }
  return counts;
}

async function createTables(): Promise<void> {
  await createNewFmsTables();
}

export default async function handle(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const session = await getServerSession(req, res, authOptions);
  if (!session?.user) {
    res.status(401).json({ error: "Niet ingelogd" });
    return;
  }
  if (!userHasRight(session.user.securityProfile, VSSecurityTopic.fietsberaad_superadmin)) {
    res.status(403).json({ error: "Geen rechten voor deze actie" });
    return;
  }

  try {
    if (req.method === "GET") {
      const tablesExist = await checkTablesExist();
      const triggersExist = tablesExist ? await checkTriggersExist() : false;
      const tableCounts = tablesExist ? await getTableCounts() : undefined;
      const status: FmsTablesStatus = {
        tablesExist,
        triggersExist,
        tableCounts,
      };
      return res.status(200).json(status);
    }

    if (req.method === "POST") {
      const body = req.body as { action?: string };
      const action = body?.action;

      if (action === "create") {
        const tablesExist = await checkTablesExist();
        if (!tablesExist) {
          await createTables();
        }
        const triggersExist = await checkTriggersExist();
        if (!triggersExist) {
          return res.status(400).json({
            success: false,
            error:
              "Triggers aanmaken via API wordt niet ondersteund (MySQL beperking). Voer de SQL handmatig uit via een MySQL-client.",
            manualSql: getCreateTriggersSql(),
          });
        }
        return res.status(200).json({
          success: true,
          message: "Test tabellen en triggers aangemaakt",
        });
      }

      if (action === "create-tables") {
        const tablesExist = await checkTablesExist();
        if (tablesExist) {
          const triggersExist = await checkTriggersExist();
          return res.status(200).json({
            success: true,
            message: "Test tabellen bestaan al",
            manualSql: triggersExist ? undefined : getCreateTriggersSql(),
          });
        }
        await createTables();
        return res.status(200).json({
          success: true,
          message: "Test tabellen aangemaakt. Voer de SQL hieronder uit om de triggers aan te maken (wachtrij_* → new_wachtrij_*):",
          manualSql: getCreateTriggersSql(),
        });
      }

      if (action === "create-triggers") {
        const tablesExist = await checkTablesExist();
        if (!tablesExist) {
          return res.status(400).json({
            success: false,
            error: "Maak eerst de test tabellen aan",
          });
        }
        return res.status(400).json({
          success: false,
          error:
            "Triggers aanmaken via API wordt niet ondersteund (MySQL beperking). Voer de SQL handmatig uit via een MySQL-client.",
          manualSql: getCreateTriggersSql(),
        });
      }

      if (action === "drop") {
        return res.status(400).json({
          success: false,
          error:
            "Verwijderen via API wordt niet ondersteund (MySQL beperking). Voer de SQL handmatig uit via een MySQL-client.",
          manualSql: getDropSql(),
        });
      }

      return res.status(400).json({ error: "Ongeldige actie", action });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    logPrismaError("fms-tables", error);
    return res.status(500).json({
      error: formatPrismaErrorCompact(error),
    });
  }
}
