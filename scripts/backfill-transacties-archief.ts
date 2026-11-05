/**
 * Copy closed `transacties` rows into `transacties_archief` when no matching row exists.
 *
 * Managed rows (ExternalTransactionID set) upsert on (locationid, externaltransactionid),
 * same as a live check-out. Legacy rows without that id are inserted only when
 * location + section + check-in + check-out is not already in archief.
 *
 * Default scope is testgemeente (ZipID 9933). Pass --all for every city, or --zip.
 *
 *   npx tsx scripts/backfill-transacties-archief.ts --dry-run
 *   npx tsx scripts/backfill-transacties-archief.ts --location 9933_001
 *   npx tsx scripts/backfill-transacties-archief.ts --zip 3500 --dry-run
 *   npx tsx scripts/backfill-transacties-archief.ts --all --dry-run
 *
 * Requires DATABASE_URL (Node 22: `node --env-file=.env --import tsx scripts/backfill-transacties-archief.ts`).
 * Apply prisma/migrations/20261027210000_transacties_archief_external_tx first.
 */

import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import { PrismaClient } from "../src/generated/prisma-client";
import {
  ARCHIEF_SOURCE_V4_MANAGED,
  LEGACY_ARCHIEF_DAY_BEGINS_AT,
  writeTransactiesArchiefFromManaged,
} from "../src/server/services/queue/transacties-archief-service";

function loadEnvFiles(): void {
  if (process.env.DATABASE_URL) return;
  for (const name of [".env", ".env.local"]) {
    const path = resolve(process.cwd(), name);
    if (!existsSync(path)) continue;
    for (const line of readFileSync(path, "utf8").split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq < 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (key === "DATABASE_URL" || process.env[key] == null) {
        process.env[key] = value;
      }
    }
  }
}

loadEnvFiles();

const prisma = new PrismaClient();

type Args = {
  dryRun: boolean;
  zip?: string;
  location?: string;
};

function parseArgs(argv: string[]): Args {
  const dryRun = argv.includes("--dry-run");
  const all = argv.includes("--all");
  const zipFlag = argv.indexOf("--zip");
  const locationFlag = argv.indexOf("--location");
  const zip = zipFlag >= 0 ? argv[zipFlag + 1] : all ? undefined : "9933";
  const location = locationFlag >= 0 ? argv[locationFlag + 1] : undefined;
  if (zipFlag >= 0 && !zip) throw new Error("--zip verwacht een waarde");
  if (locationFlag >= 0 && !location) throw new Error("--location verwacht een StallingsID");
  return { dryRun, zip, location };
}

function placeId(value: bigint | null): number | null {
  if (value == null) return null;
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < 0 || n > 2147483647) return null;
  return n;
}

async function dayBeginsAt(cache: Map<string, Date>, zip: string): Promise<Date> {
  const cached = cache.get(zip);
  if (cached) return cached;
  const contact = await prisma.contacts.findFirst({
    where: { ZipID: zip, ItemType: "organizations", Status: "1" },
    select: { DayBeginsAt: true },
  });
  const value = contact?.DayBeginsAt ?? LEGACY_ARCHIEF_DAY_BEGINS_AT;
  cache.set(zip, value);
  return value;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const where = {
    Date_checkout: { not: null },
    ...(args.zip ? { ZipID: args.zip } : {}),
    ...(args.location ? { FietsenstallingID: args.location } : {}),
  };
  const scope = [
    args.zip ? `zip ${args.zip}` : "alle gemeenten",
    args.location ? `locatie ${args.location}` : null,
    args.dryRun ? "dry-run" : "schrijven",
  ]
    .filter(Boolean)
    .join(", ");
  console.log(`Backfill transacties_archief (${scope})`);

  const dayCache = new Map<string, Date>();
  let cursor: number | undefined;
  let scanned = 0;
  let inserted = 0;
  let updated = 0;
  let skipped = 0;
  let invalid = 0;

  for (;;) {
    const rows = await prisma.transacties.findMany({
      where: { ...where, ...(cursor != null ? { ID: { gt: cursor } } : {}) },
      orderBy: { ID: "asc" },
      take: 200,
    });
    if (rows.length === 0) break;
    cursor = rows[rows.length - 1]?.ID;

    for (const row of rows) {
      scanned++;
      const checkout = row.Date_checkout;
      const citycode = (row.ZipID ?? "").trim();
      const locationid = row.FietsenstallingID.trim();
      const sectionid = (row.SectieID ?? locationid).trim();
      if (!checkout || !citycode || citycode.length > 4 || locationid.length > 8 || sectionid.length > 13) {
        invalid++;
        continue;
      }

      const externalId = row.ExternalTransactionID?.trim() || null;
      if (!externalId) {
        const duplicate = await prisma.transacties_archief.findFirst({
          where: {
            locationid,
            sectionid,
            checkindate: row.Date_checkin,
            checkoutdate: checkout,
          },
          select: { ID: true },
        });
        if (duplicate) {
          skipped++;
          continue;
        }
      }

      if (args.dryRun) {
        if (externalId) {
          const existing = await prisma.transacties_archief.findFirst({
            where: { locationid, externaltransactionid: externalId },
            select: { ID: true },
          });
          if (existing) updated++;
          else inserted++;
        } else {
          inserted++;
        }
        continue;
      }

      try {
        const result = await writeTransactiesArchiefFromManaged(prisma, {
          citycode,
          locationid,
          sectionid,
          sectionidOut: row.SectieID_uit,
          placeid: placeId(row.PlaceID),
          externalplaceid: row.ExternalPlaceID,
          checkindate: row.Date_checkin,
          checkoutdate: checkout,
          checkintype: row.Type_checkin ?? "user",
          checkouttype: row.Type_checkout ?? "user",
          price: row.Stallingskosten ?? 0,
          clienttypeid: row.ClientTypeID,
          biketypeid: row.BikeTypeID,
          exploitantid: row.ExploitantID,
          reservationtime: row.Reserveringsduur,
          source: externalId ? ARCHIEF_SOURCE_V4_MANAGED : "backfill-transacties",
          externaltransactionid: externalId,
          daybeginsat: await dayBeginsAt(dayCache, citycode),
        });
        if (result.created) inserted++;
        else updated++;
      } catch (e) {
        invalid++;
        const message = e instanceof Error ? e.message : String(e);
        console.error(`transacties.ID ${row.ID}: ${message}`);
      }
    }
  }

  console.log(
    `Gescand ${scanned}, nieuw ${inserted}, bijgewerkt ${updated}, overgeslagen ${skipped}, ongeldig ${invalid}`
  );
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
