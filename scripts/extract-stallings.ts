/**
 * Extracts constant data from stallings for use in testgemeente.
 * Replaces source StallingsID (e.g. 3500_005) with target (e.g. 9933_001) in all IDs.
 *
 * Run: npx tsx scripts/extract-stallings.ts [--config path/to/config.json]
 * Config default: scripts/extract-stallings-config.json
 *
 * Config format: [{ "stallingID": "uuid-or-3500_005", "newstallingname": "9933_001" }, ...]
 * - stallingID: source fietsenstallingen.ID (UUID) or StallingsID (postcode_index)
 * - newstallingname: target stallingsId (postcode_index) for replacement
 * Requires: DATABASE_URL in .env, database accessible
 */

import { readFileSync } from "fs";
import { resolve } from "path";
import { PrismaClient } from "../src/generated/prisma-client";

const prisma = new PrismaClient();

// Fields to omit (IDs, FKs that will be replaced at runtime, nested relations output separately)
const FIETSENSTALLINGEN_OMIT = [
  "ID", "SiteID", "ExploitantID", "DateCreated", "DateModified", "EditorCreated", "EditorModified",
  "fietsenstalling_secties", "fietsenstallingen_services", "abonnementsvorm_fietsenstalling", "uitzonderingenopeningstijden",
];
const SECTIE_OMIT = ["sectieId", "fietsenstallingsId"];
const KOSTENPERIODEN_OMIT = ["kostenPeriodeId", "sectieId"];
const TARIEFREGELS_OMIT = ["tariefregelID", "stallingsID", "sectieID", "sectionBikeTypeID"];
const SERVICES_OMIT = ["FietsenstallingID"];
const WINKANSEN_OMIT = ["ID", "FietsenstallingID"];
const UITZONDERINGEN_OMIT = ["ID", "fietsenstallingsID"];

type ExtractConfigEntry = { stallingID: string; newstallingname: string; name?: string };

type ExtractConfig = {
  stallingsCount?: number;
  stallings: ExtractConfigEntry[];
};

function loadConfig(): ExtractConfig {
  const configPath = process.argv.includes("--config")
    ? process.argv[process.argv.indexOf("--config") + 1]
    : resolve(__dirname, "extract-stallings-config.json");
  const raw = readFileSync(configPath, "utf-8");
  const parsed = JSON.parse(raw);
  // Support object format { stallingsCount, stallings } or legacy array
  const entries = Array.isArray(parsed)
    ? parsed.map((e: ExtractConfigEntry & { sourceId?: string; targetStallingsId?: string }) => ({
        stallingID: e.stallingID ?? e.sourceId ?? "",
        newstallingname: e.newstallingname ?? e.targetStallingsId ?? "",
        name: e.name ?? e.newstallingname ?? e.targetStallingsId ?? "",
      }))
    : (parsed.stallings ?? []).map((e: ExtractConfigEntry) => ({
        stallingID: e.stallingID ?? "",
        newstallingname: e.newstallingname ?? "",
        name: e.name ?? e.newstallingname ?? "",
      }));
  return {
    stallingsCount: parsed.stallingsCount ?? 7,
    stallings: entries,
  };
}

async function resolveSourceId(stallingID: string): Promise<string> {
  if (stallingID.includes("-")) {
    return stallingID;
  }
  const stalling = await prisma.fietsenstallingen.findFirst({
    where: { StallingsID: stallingID },
    select: { ID: true },
  });
  if (!stalling) throw new Error(`Stalling not found: ${stallingID} (StallingsID)`);
  return stalling.ID;
}

function omitKeys<T extends Record<string, unknown>>(obj: T, keys: string[]): Partial<T> {
  const result = { ...obj };
  for (const k of keys) delete result[k as keyof T];
  return result;
}

/** Recursively replace sourceStallingsId with targetStallingsId in all string values */
function replaceStallingsId<T>(obj: T, source: string, target: string): T {
  if (obj === null || obj === undefined) return obj;
  if (obj instanceof Date) return obj;
  if (typeof obj === "object" && obj !== null && "toNumber" in obj && typeof (obj as { toNumber: () => number }).toNumber === "function") return obj;
  if (typeof obj === "string") {
    return obj.replace(new RegExp(escapeRegex(source), "g"), target) as T;
  }
  if (Array.isArray(obj)) {
    return obj.map((item) => replaceStallingsId(item, source, target)) as T;
  }
  if (typeof obj === "object") {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      result[k] = replaceStallingsId(v, source, target);
    }
    return result as T;
  }
  return obj;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function toConstValue(val: unknown): string {
  if (val === null || val === undefined) return "null";
  if (typeof val === "boolean") return val ? "true" : "false";
  if (typeof val === "number") return String(val);
  if (typeof val === "string") return JSON.stringify(val);
  if (val instanceof Date) return JSON.stringify(val.toISOString());
  if (typeof val === "bigint") return String(val);
  if (val && typeof val === "object" && "value" in val) return JSON.stringify(String((val as { value: unknown }).value));
  if (typeof val === "object") return JSON.stringify(val);
  return String(val);
}

function formatObject(obj: Record<string, unknown>, indent = 2): string {
  const lines = Object.entries(obj)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${" ".repeat(indent)}${k}: ${toConstValue(v)},`);
  return `{\n${lines.join("\n")}\n${" ".repeat(indent - 2)}}`;
}

async function extractOne(sourceId: string, targetStallingsId: string, title: string) {
  const stalling = await prisma.fietsenstallingen.findUnique({
    where: { ID: sourceId },
    include: {
      fietsenstalling_secties: true,
      fietsenstallingen_services: true,
      abonnementsvorm_fietsenstalling: true,
      uitzonderingenopeningstijden: true,
    },
  });

  if (!stalling) {
    throw new Error(`Stalling not found: ${sourceId}`);
  }

  const sourceStallingsId = stalling.StallingsID;
  if (!sourceStallingsId) {
    throw new Error(`Stalling ${sourceId} has no StallingsID`);
  }

  const winkansen = await prisma.fietsenstallingen_winkansen.findMany({
    where: { FietsenstallingID: stalling.ID },
  });

  const sectieIds = stalling.fietsenstalling_secties.map((s) => s.sectieId);

  const sectieFietstypes = await prisma.sectie_fietstype.findMany({
    where: {
      OR: [{ sectieID: { in: sectieIds } }, { StallingsID: sourceStallingsId }],
    },
  });

  const kostenperioden = await prisma.fietsenstalling_sectie_kostenperioden.findMany({
    where: { sectieId: { in: sectieIds } },
  });

  const tariefregels = await prisma.tariefregels.findMany({
    where: { stallingsID: stalling.ID },
    orderBy: { index: "asc" },
  });

  const abonnementsvormFietstype = await prisma.abonnementsvorm_fietstype.findMany({
    where: {
      SubscriptiontypeID: { in: stalling.abonnementsvorm_fietsenstalling.map((a) => a.SubscriptiontypeID) },
    },
  });

  const stallingData = omitKeys(
    stalling as unknown as Record<string, unknown>,
    FIETSENSTALLINGEN_OMIT
  );

  const sectiesTree = stalling.fietsenstalling_secties.map((s) => {
    const sectieData = omitKeys(s as unknown as Record<string, unknown>, SECTIE_OMIT);
    const sectieFietstypesForSectie = sectieFietstypes
      .filter((sf) => sf.sectieID === s.sectieId)
      .map((sf) => ({ BikeTypeID: sf.BikeTypeID }));
    const kostenperiodenForSectie = kostenperioden
      .filter((kp) => kp.sectieId === s.sectieId)
      .map((kp) => omitKeys(kp as unknown as Record<string, unknown>, KOSTENPERIODEN_OMIT));
    return {
      ...sectieData,
      sectieFietstypes: sectieFietstypesForSectie,
      kostenperioden: kostenperiodenForSectie,
    };
  });

  const sectieIdToExternalId = new Map(
    stalling.fietsenstalling_secties.map((s) => [s.sectieId, s.externalId])
  );
  const sectionBikeTypeToSectieAndBike = new Map(
    sectieFietstypes.map((sf) => [
      sf.SectionBiketypeID,
      { sectieId: sf.sectieID, externalId: sf.sectieID ? sectieIdToExternalId.get(sf.sectieID) : null, BikeTypeID: sf.BikeTypeID },
    ])
  );

  const stallingTariefregels = tariefregels
    .filter((t) => t.sectieID === null && t.sectionBikeTypeID === null)
    .map((t) => omitKeys(t as unknown as Record<string, unknown>, TARIEFREGELS_OMIT));

  const sectionTariefregels = new Map<number, typeof tariefregels>();
  const bikeTypeTariefregels = new Map<number, { externalId: string | null; BikeTypeID: number; rows: typeof tariefregels }>();
  for (const t of tariefregels) {
    if (t.sectieID !== null && t.sectionBikeTypeID === null) {
      const existing = sectionTariefregels.get(t.sectieID) || [];
      existing.push(t);
      sectionTariefregels.set(t.sectieID, existing);
    } else if (t.sectionBikeTypeID !== null) {
      const info = sectionBikeTypeToSectieAndBike.get(t.sectionBikeTypeID);
      if (info) {
        const key = t.sectionBikeTypeID;
        const existing = bikeTypeTariefregels.get(key);
        if (!existing) {
          bikeTypeTariefregels.set(key, {
            externalId: info.externalId,
            BikeTypeID: info.BikeTypeID ?? 0,
            rows: [t],
          });
        } else {
          existing.rows.push(t);
        }
      }
    }
  }

  const tarievenTree = {
    stalling: stallingTariefregels,
    sections: stalling.fietsenstalling_secties.map((s) => ({
      externalId: s.externalId,
      tariefregels: (sectionTariefregels.get(s.sectieId) || []).map((t) =>
        omitKeys(t as unknown as Record<string, unknown>, TARIEFREGELS_OMIT)
      ),
      bikeTypes: Array.from(bikeTypeTariefregels.values())
        .filter((bt) => bt.externalId === s.externalId)
        .map((bt) => ({
          BikeTypeID: bt.BikeTypeID,
          tariefregels: bt.rows.map((t) =>
            omitKeys(t as unknown as Record<string, unknown>, TARIEFREGELS_OMIT)
          ),
        })),
    })),
  };

  const abonnementsvormenTree = stalling.abonnementsvorm_fietsenstalling.map((a) => ({
    SubscriptiontypeID: a.SubscriptiontypeID,
    BikeTypeIDs: abonnementsvormFietstype
      .filter((avft) => avft.SubscriptiontypeID === a.SubscriptiontypeID)
      .map((avft) => avft.BikeTypeID) as number[],
  }));

  const servicesData = stalling.fietsenstallingen_services.map((s) => ({
    ServiceID: s.ServiceID,
  }));

  const winkansenData = winkansen.map((w) =>
    omitKeys(w as unknown as Record<string, unknown>, WINKANSEN_OMIT)
  );

  const uitzonderingenData = stalling.uitzonderingenopeningstijden.map((u) =>
    omitKeys(u as unknown as Record<string, unknown>, UITZONDERINGEN_OMIT)
  );

  const raw = {
    fietsenstallingen: { ...stallingData, StallingsID: targetStallingsId, Title: title },
    sectiesTree,
    tarievenTree,
    abonnementsvormenTree,
    services: servicesData,
    winkansen: winkansenData,
    uitzonderingenopeningstijden: uitzonderingenData,
  };

  return replaceStallingsId(raw, sourceStallingsId, targetStallingsId);
}

async function main() {
  const config = loadConfig();
  if (config.stallings.length === 0) {
    console.error("Config is empty. Add entries in stallings array.");
    process.exit(1);
  }

  const results: Record<string, unknown> = {};
  for (const { stallingID, newstallingname, name } of config.stallings) {
    const sourceId = await resolveSourceId(stallingID);
    const title = name ?? newstallingname;
    results[newstallingname] = await extractOne(sourceId, newstallingname, title);
  }

  const stallingsCount = config.stallingsCount ?? 7;
  const stallings = config.stallings.map((e, i) => ({
    stallingsId: e.newstallingname,
    title: e.name ?? e.newstallingname,
    coordsIndex: i,
  }));
  for (let i = config.stallings.length; i < stallingsCount; i++) {
    const id = `9933_${String(i + 1).padStart(3, "0")}`;
    stallings.push({
      stallingsId: id,
      title: `Test stalling API ${i + 1}`,
      coordsIndex: i,
    });
  }

  const replacer = (_: string, v: unknown) => {
    if (v instanceof Date) return v.toISOString();
    if (typeof v === "bigint") return Number(v);
    if (v && typeof v === "object" && "toNumber" in v) return (v as { toNumber: () => number }).toNumber();
    return v;
  };

  const output = `/**
 * Generated by: npx tsx scripts/extract-stallings.ts [--config path/to/config.json]
 * IDs are replaced: source StallingsID (e.g. 3500_005) -> target (e.g. 9933_001)
 * Config: ${JSON.stringify(config)}
 */

export const STALLING_DATA_BY_TARGET: Record<string, {
  fietsenstallingen: Record<string, unknown>;
  sectiesTree: unknown[];
  tarievenTree: unknown;
  abonnementsvormenTree: unknown[];
  services: unknown[];
  winkansen: unknown[];
  uitzonderingenopeningstijden: unknown[];
}> = ${JSON.stringify(results, replacer, 2)};

export type StallingEntry = { stallingsId: string; title: string; coordsIndex: number };
export const STALLINGS: StallingEntry[] = ${JSON.stringify(stallings, null, 2)};

export const STALLINGS_COUNT = ${stallingsCount};
`;

  const outPath = process.argv.includes("--output")
    ? process.argv[process.argv.indexOf("--output") + 1]
    : null;
  if (outPath) {
    const { writeFileSync } = await import("fs");
    writeFileSync(outPath, output, "utf-8");
    console.error("Written to", outPath);
  } else {
    console.log(output);
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
