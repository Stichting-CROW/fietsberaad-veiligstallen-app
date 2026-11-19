import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import { PrismaClient } from "../src/generated/prisma-client";

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
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (process.env[key] == null) process.env[key] = value;
    }
  }
}

loadEnvFiles();
const prisma = new PrismaClient();

const sql =
  "INSERT INTO transacties (`FietsenstallingID`,`ExternalTransactionID`,`PasID`,`Date_checkin`,`Stallingskosten`,`dateModified`) " +
  "VALUES (?,?,?,?,?,?),(?,?,?,?,?,?) AS newrow ON DUPLICATE KEY UPDATE `PasID` = newrow.`PasID`, `Stallingskosten` = newrow.`Stallingskosten`";

async function main(): Promise<void> {
  const now = new Date();
  try {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        sql,
        "zz_batch",
        "syntax-a",
        "pas-a",
        now,
        "1.50",
        now,
        "zz_batch",
        "syntax-b",
        "pas-b",
        now,
        "0.00",
        now
      );
      await tx.$executeRawUnsafe(
        sql,
        "zz_batch",
        "syntax-a",
        "pas-a2",
        now,
        "2.00",
        now,
        "zz_batch",
        "syntax-b",
        "pas-b",
        now,
        "0.00",
        now
      );
      const rows = await tx.$queryRawUnsafe(
        "SELECT ExternalTransactionID, PasID, Stallingskosten FROM transacties WHERE FietsenstallingID = ? ORDER BY ExternalTransactionID",
        "zz_batch"
      );
      console.log("rows", JSON.stringify(rows, (_k, v) => (typeof v === "bigint" ? v.toString() : v)));
      await tx.$executeRawUnsafe(
        "UPDATE transacties_archief SET daybeginsat = ?, price = ?, checkintype = ? WHERE ID = ?",
        new Date(1970, 0, 1, 4, 0, 0),
        "1.25",
        "user",
        -1
      );
      console.log("archief update accepted");
      throw new Error("rollback");
    });
  } catch (e) {
    if (!(e instanceof Error) || e.message !== "rollback") throw e;
  }
  const left = await prisma.$queryRawUnsafe(
    "SELECT COUNT(*) AS n FROM transacties WHERE FietsenstallingID = ?",
    "zz_batch"
  );
  console.log("left", JSON.stringify(left, (_k, v) => (typeof v === "bigint" ? v.toString() : v)));
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
