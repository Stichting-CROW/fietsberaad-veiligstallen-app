import { createHash, randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import bcrypt from "bcryptjs";
import mysql from "mysql2/promise";

export const TEST_ADMIN_EMAIL = "beheer@example.test";
export const TEST_ADMIN_PASSWORD = "teststalling";
const CONTACT_ID = "1";
const USER_ID = "TESTUSER-0000-0000-0000000000000001";

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
    throw new Error(`DATABASE_URL host '${url.hostname}' is niet toegestaan voor de testomgeving`);
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

function newId() {
  return randomBytes(16).toString("hex").slice(0, 35);
}

export async function ensureTestAdmin() {
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
    multipleStatements: false,
  });
  try {
    const passwordHash = await bcrypt.hash(TEST_ADMIN_PASSWORD, 10);
    const passwordApi = createHash("sha256").update(TEST_ADMIN_PASSWORD, "utf8").digest("hex").toUpperCase();

    const [contacts] = await connection.query("SELECT ID FROM contacts WHERE ID = ? LIMIT 1", [CONTACT_ID]);
    if (contacts.length === 0) {
      await connection.query(
        `INSERT INTO contacts (
           ID, ItemType, GroupID, ParentID, ZipID, Helpdesk, CompanyName, UrlName,
           Country1, Country2, Status, Coordinaten, Zoom, TextLeftColumn, DayBeginsAt,
           ThemeColor1, ThemeColor2, MinSaldoToUseLockers, MinSaldoToOpenLocker, durationOfLockerTempStatus
         ) VALUES (
           ?, 'admin', 'extern', '0', 'crow', 'fietsberaad@crow.nl', 'FIETSBERAAD', 'fietsberaad',
           'NLD', 'NLD', '1', '52.086557,5.120098', 8,
           '<p>Dit is de tekst van Fietsberaad voor de linkerkolom. Deze wordt ook bij gemeenten getoond die hier geen tekst hebben ingevoerd.</p>',
           '00:00:00', '1f99d2', '96c11f', -5, -10, 20
         )`,
        [CONTACT_ID],
      );
    }

    const [users] = await connection.query("SELECT UserID FROM security_users WHERE UserName = ? LIMIT 1", [TEST_ADMIN_EMAIL]);
    const userId = users.length > 0 ? String(users[0].UserID) : USER_ID;
    if (users.length === 0) {
      await connection.query(
        `INSERT INTO security_users
           (UserID, UserName, DisplayName, EncryptedPassword, EncryptedPassword2, Status, GroupID, SiteID)
         VALUES (?, ?, 'Beheerder', ?, ?, '1', 'intern', ?)`,
        [USER_ID, TEST_ADMIN_EMAIL, passwordHash, passwordApi, CONTACT_ID],
      );
    } else {
      await connection.query(
        "UPDATE security_users SET EncryptedPassword = ?, EncryptedPassword2 = ?, Status = '1', SiteID = ? WHERE UserID = ?",
        [passwordHash, passwordApi, CONTACT_ID, userId],
      );
    }

    await connection.query(
      "DELETE FROM user_contact_role WHERE UserID = ? AND ContactID <> ?",
      [userId, CONTACT_ID],
    );
    const [roles] = await connection.query(
      "SELECT ID FROM user_contact_role WHERE UserID = ? AND ContactID = ? LIMIT 1",
      [userId, CONTACT_ID],
    );
    if (roles.length === 0) {
      try {
        await connection.query(
          `INSERT INTO user_contact_role (ID, UserID, ContactID, NewRoleID, isOwnOrganization)
           VALUES (?, ?, ?, 'rootadmin', 1)`,
          [newId(), userId, CONTACT_ID],
        );
      } catch (error) {
        if (!error || error.code !== "ER_DUP_ENTRY") throw error;
        await connection.query(
          "UPDATE user_contact_role SET UserID = ?, NewRoleID = 'rootadmin', isOwnOrganization = 1 WHERE ContactID = ?",
          [userId, CONTACT_ID],
        );
      }
    } else {
      await connection.query(
        "UPDATE user_contact_role SET NewRoleID = 'rootadmin', isOwnOrganization = 1 WHERE UserID = ? AND ContactID = ?",
        [userId, CONTACT_ID],
      );
    }

    const [organisations] = await connection.query(
      "SELECT ID FROM contacts WHERE ItemType IN ('organizations', 'exploitant') AND ID <> ?",
      [CONTACT_ID],
    );
    for (const organisation of organisations) {
      const contactId = String(organisation.ID);
      const [existing] = await connection.query(
        "SELECT ID FROM user_contact_role WHERE UserID = ? AND ContactID = ? LIMIT 1",
        [userId, contactId],
      );
      if (existing.length > 0) {
        await connection.query(
          "UPDATE user_contact_role SET NewRoleID = 'rootadmin', isOwnOrganization = 0 WHERE UserID = ? AND ContactID = ?",
          [userId, contactId],
        );
        continue;
      }
      try {
        await connection.query(
          `INSERT INTO user_contact_role (ID, UserID, ContactID, NewRoleID, isOwnOrganization)
           VALUES (?, ?, ?, 'rootadmin', 0)`,
          [newId(), userId, contactId],
        );
      } catch (error) {
        if (!error || error.code !== "ER_DUP_ENTRY") throw error;
      }
    }

    return { username: TEST_ADMIN_EMAIL, password: TEST_ADMIN_PASSWORD };
  } finally {
    await connection.end();
  }
}

export async function releaseTestAdminContact() {
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
    multipleStatements: false,
  });
  try {
    await connection.query("SET FOREIGN_KEY_CHECKS = 0");
    await connection.query("DELETE FROM contacts WHERE ID = ?", [CONTACT_ID]);
  } finally {
    await connection.query("SET FOREIGN_KEY_CHECKS = 1");
    await connection.end();
  }
}

function readEnvFile(file, into) {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in into)) into[key] = value;
  }
}

function loadEnv() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  const fromFile = {};
  readEnvFile(path.join(root, ".env"), fromFile);
  const fromLocal = {};
  readEnvFile(path.join(root, ".env.local"), fromLocal);
  for (const [key, value] of Object.entries({ ...fromFile, ...fromLocal })) {
    if (!process.env[key]) process.env[key] = value;
  }
}

const isDirectRun = process.argv[1] && process.argv[1].endsWith("seed-admin.mjs");
if (isDirectRun) {
  loadEnv();
  ensureTestAdmin()
    .then((result) => {
      console.log(`Testbeheerder: ${result.username} / ${result.password}`);
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : error);
      process.exit(1);
    });
}
