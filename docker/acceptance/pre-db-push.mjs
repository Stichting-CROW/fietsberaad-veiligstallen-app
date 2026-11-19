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
    throw new Error(`DATABASE_URL host '${url.hostname}' is niet toegestaan voor pre-db-push`);
  }
}

/** acc-docker volumes may contain rows that violate ContactID @unique before db push applies it. */
async function dedupeUserContactRoleByContactId(connection) {
  const [tables] = await connection.query(
    `SELECT 1 AS ok FROM information_schema.tables
     WHERE table_schema = DATABASE() AND table_name = 'user_contact_role' LIMIT 1`,
  );
  if (tables.length === 0) return 0;

  const [result] = await connection.query(`
    DELETE newer FROM user_contact_role newer
    INNER JOIN user_contact_role older
      ON newer.ContactID = older.ContactID AND newer.ID > older.ID
  `);
  return result.affectedRows ?? 0;
}

export async function runPreDbPush() {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error("DATABASE_URL ontbreekt");
  assertTarget(databaseUrl);

  const url = new URL(databaseUrl);
  const connection = await mysql.createConnection({
    host: url.hostname,
    port: url.port ? Number(url.port) : 3306,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: decodeURIComponent(url.pathname.replace(/^\//, "")),
  });

  try {
    const removed = await dedupeUserContactRoleByContactId(connection);
    if (removed > 0) {
      console.log(`pre-db-push: ${removed} dubbele user_contact_role rij(en) verwijderd (ContactID uniek)`);
    }
  } finally {
    await connection.end();
  }
}

const isDirectRun = process.argv[1]?.endsWith("pre-db-push.mjs");
if (isDirectRun) {
  runPreDbPush().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
