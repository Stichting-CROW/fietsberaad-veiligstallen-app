import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import mysql from "mysql2/promise";

const ALLOWED_HOSTS = new Set(["127.0.0.1", "localhost", "mysql", "::1"]);

function assertTarget(databaseUrl) {
  if (process.env.TEST_ENV_BOOTSTRAP !== "1") {
    throw new Error("Testomgeving-bootstrap staat uit (TEST_ENV_BOOTSTRAP=1)");
  }
  if (process.env.NEXT_PUBLIC_APP_ENV === "production") {
    throw new Error("Bootstrap mag niet aanstaan als NEXT_PUBLIC_APP_ENV=production");
  }
  const url = new URL(databaseUrl);
  const host = url.hostname.toLowerCase();
  if (host.endsWith(".database.azure.com") || !ALLOWED_HOSTS.has(host)) {
    throw new Error(`DATABASE_URL host '${url.hostname}' is niet toegestaan voor view-bootstrap`);
  }
  const prod = process.env.PROD_DATABASE_URL?.trim();
  if (prod) {
    const prodUrl = new URL(prod);
    const prodPort = prodUrl.port ? Number(prodUrl.port) : 3306;
    const port = url.port ? Number(url.port) : 3306;
    if (prodUrl.hostname.toLowerCase() === host && prodPort === port) {
      throw new Error("DATABASE_URL en PROD_DATABASE_URL wijzen naar dezelfde server");
    }
  }
}

export async function ensureMysqlViews() {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error("DATABASE_URL ontbreekt");
  assertTarget(databaseUrl);

  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  const sqlPath = path.join(root, "prisma/sql/mysql-views.sql");
  const sql = readFileSync(sqlPath, "utf8");

  const url = new URL(databaseUrl);
  const connection = await mysql.createConnection({
    host: url.hostname,
    port: url.port ? Number(url.port) : 3306,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: decodeURIComponent(url.pathname.replace(/^\//, "")),
    multipleStatements: true,
  });

  try {
    await connection.query(sql);
  } finally {
    await connection.end();
  }
}

const isDirectRun = process.argv[1]?.endsWith("ensure-mysql-views.mjs");
if (isDirectRun) {
  ensureMysqlViews()
    .then(() => {
      console.log("MySQL views applied (prisma/sql/mysql-views.sql)");
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : error);
      process.exit(1);
    });
}
