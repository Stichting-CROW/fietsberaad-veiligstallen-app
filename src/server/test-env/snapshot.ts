import bcrypt from "bcryptjs";
import mysql, { type Connection, type RowDataPacket } from "mysql2/promise";
import { encryptPasswordForApi } from "~/utils/server/password-tools";
import { TEST_LOGIN_PASSWORD, type Anonymizer } from "./anonymize";
import { TableCopier } from "./copy";
import { assertTargetDatabase, TestEnvError } from "./guard";
import type { SnapshotJob } from "./job";
import { downloadLibrary } from "./library";

export type SnapshotRequest = {
  ownerIds: string[];
  exploitantIds: string[];
  stallingIds: string[];
  from: string;
  to: string;
};

const ID_PATTERN = /^[A-Za-z0-9_-]{1,40}$/;

function cleanIds(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter((value) => ID_PATTERN.test(value)))];
}

function connect(raw: string): Promise<Connection> {
  const url = new URL(raw);
  return mysql.createConnection({
    host: url.hostname,
    port: url.port ? Number(url.port) : 3306,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: decodeURIComponent(url.pathname.replace(/^\//, "")),
    dateStrings: false,
    supportBigNumbers: true,
    bigNumberStrings: true,
    multipleStatements: false,
    charset: "utf8mb4",
  });
}

function placeholders(values: unknown[]): string {
  return values.map(() => "?").join(", ");
}

export async function runSnapshot(job: SnapshotJob, input: SnapshotRequest): Promise<void> {
  assertTargetDatabase();
  const prodUrl = process.env.PROD_DATABASE_URL?.trim();
  const targetUrl = process.env.DATABASE_URL?.trim();
  if (!prodUrl || !targetUrl) throw new TestEnvError("PROD_DATABASE_URL of DATABASE_URL ontbreekt");

  const mollieKey = process.env.MOLLIE_TEST_API_KEY?.trim() ?? "";
  const mollieId = process.env.MOLLIE_TEST_ID?.trim() ?? "";
  if (!mollieKey || !mollieId) throw new TestEnvError("MOLLIE_TEST_API_KEY en MOLLIE_TEST_ID zijn verplicht");
  if (mollieKey.startsWith("live_") || mollieId.startsWith("live_")) {
    throw new TestEnvError("Mollie-waarde mag niet met live_ beginnen");
  }

  const from = new Date(input.from);
  const to = new Date(input.to);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from >= to) {
    throw new TestEnvError("Ongeldige periode");
  }

  const requestedOwners = cleanIds(input.ownerIds);
  const requestedExploitants = cleanIds(input.exploitantIds);
  const requestedStallings = cleanIds(input.stallingIds);
  if (requestedOwners.length === 0 || requestedStallings.length === 0) {
    throw new TestEnvError("Kies minstens één data-eigenaar en één stalling");
  }

  const anonymizer: Anonymizer = {
    passwordHash: await bcrypt.hash(TEST_LOGIN_PASSWORD, 10),
    passwordApi: encryptPasswordForApi(TEST_LOGIN_PASSWORD),
  };

  const source = await connect(prodUrl);
  const target = await connect(targetUrl);
  let copier: TableCopier;
  copier = new TableCopier(source, target, anonymizer, (step) => {
    job.step = step;
    job.counts = { ...copier.counts };
    job.warnings = copier.warnings.slice(-40);
  });

  try {
    job.step = "doeldatabase legen";
    await copier.prepareTarget();

    for (const table of [
      "security_roles",
      "modules",
      "fietstypen",
      "fietsenstallingtypen",
      "services",
      "klanttypen",
      "faq",
      "texts",
      "articles",
      "articles_templates",
      "documenttemplates",
      "mailings_standaardteksten",
      "producten",
      "externe_apis",
      "instellingen",
      "contacts_fietsberaad",
      "sleutelhangerreeksen",
    ]) {
      await copier.copyAll(table);
    }

    const exploitants = requestedExploitants.length > 0
      ? requestedExploitants
      : await copier.values(
          `SELECT DISTINCT parentSiteID FROM contact_contact WHERE childSiteID IN (${placeholders(requestedOwners)})`,
          requestedOwners,
        );

    const [stallingRows] = await source.query<RowDataPacket[]>(
      `SELECT ID, StallingsID FROM fietsenstallingen WHERE ID IN (${placeholders(requestedStallings)}) AND SiteID IN (${placeholders(requestedOwners)})`,
      [...requestedStallings, ...requestedOwners],
    );
    const stallingUuids = stallingRows.map((row) => String(row.ID));
    const stallingShortIds = stallingRows.map((row) => row.StallingsID).filter((value) => value != null).map((value) => String(value));
    if (stallingUuids.length === 0) throw new TestEnvError("Geen stallingen binnen de gekozen organisaties");

    const operatorIds = await copier.values(
      `SELECT DISTINCT OperatorID FROM fmsservice_permit WHERE BikeparkID IN (${placeholders(stallingUuids)}) OR SiteID IN (${placeholders(requestedOwners)})`,
      [...stallingUuids, ...requestedOwners],
    );
    const seedContacts = [...new Set(["1", ...requestedOwners, ...exploitants, ...operatorIds])];
    const contactIds = await copier.values(
      `SELECT ID FROM contacts WHERE ID IN (${placeholders(seedContacts)}) OR ParentID IN (${placeholders(seedContacts)})`,
      [...seedContacts, ...seedContacts],
    );

    await copier.copyIn("contacts", "ID", contactIds);
    const contactLink = exploitants.length > 0
      ? `childSiteID IN (${placeholders(requestedOwners)}) OR parentSiteID IN (${placeholders(exploitants)})`
      : `childSiteID IN (${placeholders(requestedOwners)})`;
    await copier.copyWhere(
      "contact_contact",
      contactLink,
      exploitants.length > 0 ? [...requestedOwners, ...exploitants] : requestedOwners,
    );
    await copier.copyIn("contact_fietsenstalling", "SiteID", contactIds);
    await copier.copyIn("contact_report_settings", "siteID", contactIds);
    await copier.copyIn("modules_contacts", "SiteID", contactIds);
    await copier.copyIn("contacts_faq", "SiteID", contactIds);

    await copier.copyIn("fietsenstallingen", "ID", stallingUuids);
    await copier.copyIn("fietsenstalling_sectie", "fietsenstallingsId", stallingUuids);
    const sectionIds = await copier.values(
      `SELECT sectieId FROM fietsenstalling_sectie WHERE fietsenstallingsId IN (${placeholders(stallingUuids)})`,
      stallingUuids,
    );
    await copier.copyIn("fietsenstalling_plek", "sectie_id", sectionIds);
    const placeIds = sectionIds.length === 0
      ? []
      : await copier.values(
          `SELECT id FROM fietsenstalling_plek WHERE sectie_id IN (${placeholders(sectionIds)})`,
          sectionIds,
        );
    await copier.copyIn("fietsenstalling_plek_bezetting", "plek_id", placeIds);
    await copier.copyIn("plaats_fietstype", "plaats_id", placeIds);
    await copier.copyIn("fietsenstalling_sectie_kostenperioden", "sectieId", sectionIds);
    await copier.copyIn("sectie_fietstype", "StallingsID", stallingUuids);
    await copier.copyIn("fietsenstallingen_services", "FietsenstallingID", stallingUuids);
    await copier.copyIn("fietsenstallingen_winkansen", "FietsenstallingID", stallingUuids);
    await copier.copyIn("uitzonderingenopeningstijden", "fietsenstallingsID", stallingUuids);

    const subscriptionWhere = exploitants.length > 0
      ? `siteID IN (${placeholders(contactIds)}) OR exploitantSiteID IN (${placeholders(exploitants)})`
      : `siteID IN (${placeholders(contactIds)})`;
    await copier.copyWhere(
      "abonnementsvormen",
      subscriptionWhere,
      exploitants.length > 0 ? [...contactIds, ...exploitants] : contactIds,
    );
    const subscriptionIds = await copier.values(
      `SELECT ID FROM abonnementsvormen WHERE siteID IN (${placeholders(contactIds)}) ${exploitants.length ? `OR exploitantSiteID IN (${placeholders(exploitants)})` : ""}`,
      exploitants.length ? [...contactIds, ...exploitants] : contactIds,
    );
    await copier.copyIn("abonnementsvorm_fietsenstalling", "BikeparkID", stallingUuids);
    await copier.copyIn("abonnementsvorm_fietstype", "SubscriptiontypeID", subscriptionIds);
    await copier.copyIn("tariefregels", "stallingsID", [...stallingUuids, ...stallingShortIds]);
    await copier.copyIn("fmsservice_permit", "BikeparkID", stallingUuids);
    await copier.copyIn("externe_apis_locaties", "BikeparkID", [...stallingUuids, ...stallingShortIds]);

    const userIds = [...new Set([
      ...await copier.values(
        `SELECT UserID FROM user_contact_role WHERE ContactID IN (${placeholders(contactIds)})`,
        contactIds,
      ),
      ...await copier.values(
        `SELECT UserID FROM security_users WHERE SiteID IN (${placeholders(contactIds)})`,
        contactIds,
      ),
    ])];
    await copier.copyIn("security_users", "UserID", userIds);
    await copier.copyIn("user_contact_role", "UserID", userIds, `ContactID IN (${placeholders(contactIds)})`, contactIds);
    await copier.copyIn("security_users_sites", "UserID", userIds, `SiteID IN (${placeholders(contactIds)})`, contactIds);

    const accountIds = [...new Set([
      ...await copier.values(`SELECT AccountID FROM accounts_pasids WHERE SiteID IN (${placeholders(contactIds)})`, contactIds),
      ...await copier.values(`SELECT AccountID FROM gemeenteaccounts WHERE SiteID IN (${placeholders(contactIds)})`, contactIds),
      ...await copier.values(
        `SELECT AccountID FROM abonnementen WHERE siteID IN (${placeholders(contactIds)}) OR bikeparkID IN (${placeholders(stallingShortIds.length ? stallingShortIds : ["__none__"])})`,
        [...contactIds, ...(stallingShortIds.length ? stallingShortIds : ["__none__"])],
      ),
    ])];
    await copier.copyIn("accounts", "ID", accountIds);
    await copier.copyIn("accounts_pasids", "SiteID", contactIds);
    await copier.copyIn("gemeenteaccounts", "SiteID", contactIds);
    await copier.copyIn("historischesaldos", "accountID", accountIds);
    await copier.copyIn("abonnementen", "AccountID", accountIds);
    await copier.copyIn(
      "financialtransactions",
      "accountID",
      accountIds,
      "transactionDate IS NULL OR (transactionDate >= ? AND transactionDate < ?)",
      [from, to],
    );
    await copier.copyIn(
      "account_transacties",
      "accountId",
      accountIds,
      "boekdatum IS NULL OR (boekdatum >= ? AND boekdatum < ?)",
      [from, to],
    );
    await copier.copyIn("barcoderegister", "SiteID", contactIds);

    await copier.copyIn(
      "transacties",
      "FietsenstallingID",
      stallingUuids,
      "(Date_checkin >= ? AND Date_checkin < ?) OR Date_checkout IS NULL",
      [from, to],
    );
    if (stallingShortIds.length > 0) {
      await copier.copyIn(
        "transacties_archief",
        "locationid",
        stallingShortIds,
        "checkindate >= ? AND checkindate < ?",
        [from, to],
      );
      await copier.copyIn(
        "bezettingsdata",
        "bikeparkID",
        stallingShortIds,
        "timestamp >= ? AND timestamp < ?",
        [from, to],
      );
      await copier.copyIn("bulkreservering", "BikeparkExternalID", stallingShortIds);
    }
    const bulkIds = stallingShortIds.length === 0
      ? []
      : await copier.values(
          `SELECT ID FROM bulkreservering WHERE BikeparkExternalID IN (${placeholders(stallingShortIds)})`,
          stallingShortIds,
        );
    await copier.copyIn("bulkreserveringuitzondering", "BulkreservationID", bulkIds);

    const gemeenteCodes = await copier.values(
      `SELECT Gemeentecode FROM contacts WHERE ID IN (${placeholders(requestedOwners)}) AND Gemeentecode IS NOT NULL`,
      requestedOwners,
    );
    if (gemeenteCodes.length > 0) {
      await copier.copyWhere(
        "transacties_gemeente_totaal",
        `zipID IN (${placeholders(gemeenteCodes)}) AND jaar >= ? AND jaar <= ?`,
        [...gemeenteCodes, from.getFullYear(), to.getFullYear()],
      );
    }

    await copier.copyIn("presentations", "SiteID", contactIds);
    await copier.copyIn("presentations_ticker", "SiteID", contactIds);
    await copier.copyIn("prijzen", "SiteID", contactIds);

    const waitingItemIds = accountIds.length === 0
      ? []
      : await copier.values(
          `SELECT wachtlijst_item_id FROM wachtlijst_item WHERE account_id IN (${placeholders(accountIds)})`,
          accountIds,
        );
    const waitingListIds = waitingItemIds.length === 0
      ? []
      : await copier.values(
          `SELECT DISTINCT wachtlijst_id FROM wachtlijst_item WHERE wachtlijst_item_id IN (${placeholders(waitingItemIds)})`,
          waitingItemIds,
        );
    await copier.copyIn("wachtlijst", "id", waitingListIds);
    await copier.copyIn("wachtlijst_item", "wachtlijst_item_id", waitingItemIds);
    await copier.copyIn("wachtlijst_fietstype", "wachtlijst_id", waitingItemIds);

    await target.query("UPDATE instellingen SET productionserver = 0, MollieAPIKey = ?, MollieID = ?", [mollieKey, mollieId]);

    job.libraryFiles = await downloadLibrary(target, (step) => {
      job.step = step;
    });

    const [loginRows] = await target.query<RowDataPacket[]>(
      `SELECT u.UserName AS username
       FROM security_users u
       INNER JOIN user_contact_role r ON r.UserID = u.UserID
       WHERE r.ContactID = '1'`,
    );
    job.logins = loginRows
      .map((row) => String(row.username ?? ""))
      .filter(Boolean)
      .map((username) => ({ username, password: TEST_LOGIN_PASSWORD }));
    job.counts = { ...copier.counts };
    job.warnings = copier.warnings.slice(-40);
    job.step = "klaar";
    job.status = "done";
    job.finishedAt = new Date().toISOString();
  } finally {
    await source.end();
    await target.end();
  }
}
