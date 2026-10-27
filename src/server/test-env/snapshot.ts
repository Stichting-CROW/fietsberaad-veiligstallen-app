import bcrypt from "bcryptjs";
import mysql, { type Connection, type RowDataPacket } from "mysql2/promise";
import { encryptPasswordForApi } from "~/utils/server/password-tools";
import { TEST_LOGIN_PASSWORD, type Anonymizer } from "./anonymize";
import { TableCopier } from "./copy";
import { assertTargetDatabase, TestEnvError } from "./guard";
import { activatePhase, completePhases, notePhase, type SnapshotJob } from "./job";
import { downloadLibrary } from "./library";
import { ensureTestAdmin, releaseTestAdminContact } from "./seed-admin";

export type SnapshotRequest = {
  ownerIds: string[];
  exploitantIds: string[];
  stallingIds: string[];
  from: string;
  to: string;
  /** When true, also copy every pass and account of the selected data owners. */
  copyAllOwnerAccounts: boolean;
  /** When true, copy every barcode of the selected data owners. */
  copyAllOwnerBarcodes: boolean;
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

const IN_CHUNK = 300;
const FINANCIAL_DATE = "(transactionDate IS NULL OR (transactionDate >= ? AND transactionDate < ?))";
const SUBSCRIPTION_OVERLAP = "(ingangsdatum IS NULL OR ingangsdatum < ?) AND (afloopdatum IS NULL OR afloopdatum >= ?)";
const VISIT_DATE = "((Date_checkin >= ? AND Date_checkin < ?) OR Date_checkout IS NULL)";

function remember(target: Set<string>, values: string[]): void {
  for (const value of values) target.add(value);
}

async function valuesIn(
  copier: TableCopier,
  ids: string[],
  build: (ph: string) => string,
  paramsAfter: unknown[] = [],
): Promise<string[]> {
  const found = new Set<string>();
  for (let index = 0; index < ids.length; index += IN_CHUNK) {
    const chunk = ids.slice(index, index + IN_CHUNK);
    if (chunk.length === 0) continue;
    remember(found, await copier.values(build(placeholders(chunk)), [...chunk, ...paramsAfter]));
  }
  return [...found];
}

async function rowsIn(
  copier: TableCopier,
  ids: string[],
  build: (ph: string) => string,
  paramsBefore: unknown[] = [],
): Promise<RowDataPacket[]> {
  const found: RowDataPacket[] = [];
  for (let index = 0; index < ids.length; index += IN_CHUNK) {
    const chunk = ids.slice(index, index + IN_CHUNK);
    if (chunk.length === 0) continue;
    found.push(...await copier.rows(build(placeholders(chunk)), [...paramsBefore, ...chunk]));
  }
  return found;
}

function cell(row: RowDataPacket, column: string): string {
  const value = row[column];
  return value == null || String(value) === "" ? "" : String(value);
}

type AccountGraph = {
  accountIds: string[];
  passIds: string[];
  councilIds: string[];
  subscriptionIds: string[];
  financialIds: string[];
};

async function selectAccountGraph(
  copier: TableCopier,
  owners: string[],
  stallingUuids: string[],
  stallingShortIds: string[],
  from: Date,
  to: Date,
  copyAllOwnerAccounts: boolean,
  note: (detail: string) => void,
): Promise<AccountGraph> {
  const accounts = new Set<string>();
  const passes = new Set<string>();
  const councils = new Set<string>();
  const candidates = new Set<string>();

  const subscriptionIds = owners.length === 0 ? [] : await copier.values(
    `SELECT ID FROM abonnementen WHERE siteID IN (${placeholders(owners)}) AND ${SUBSCRIPTION_OVERLAP}`,
    [...owners, to, from],
  );
  note(`${subscriptionIds.length} abonnementen in de periode`);
  remember(candidates, await valuesIn(copier, subscriptionIds, (ph) => `SELECT DISTINCT AccountID FROM abonnementen WHERE ID IN (${ph})`));
  remember(passes, await valuesIn(copier, subscriptionIds, (ph) => `SELECT DISTINCT bikepassID FROM abonnementen WHERE ID IN (${ph})`));

  const addPassesForPasIds = async (pasIds: string[]) => {
    if (pasIds.length === 0 || owners.length === 0) return;
    const passRows = await rowsIn(
      copier,
      pasIds,
      (ph) => `SELECT ID, AccountID FROM accounts_pasids WHERE SiteID IN (${placeholders(owners)}) AND PasID IN (${ph})`,
      owners,
    );
    for (const row of passRows) {
      const id = cell(row, "ID");
      const pointer = cell(row, "AccountID");
      if (id) passes.add(id);
      if (pointer) candidates.add(pointer);
    }
  };

  if (stallingUuids.length > 0) {
    note("Passen bij bezoeken opzoeken");
    const visitParams = [...stallingUuids, from, to];
    const visitWhere = `FietsenstallingID IN (${placeholders(stallingUuids)}) AND ${VISIT_DATE}`;
    await addPassesForPasIds(await copier.values(
      `SELECT DISTINCT PasID FROM transacties WHERE ${visitWhere}`,
      visitParams,
    ));
    remember(passes, await copier.values(
      `SELECT DISTINCT PassUUID FROM transacties WHERE ${visitWhere} AND PassUUID IS NOT NULL AND PassUUID <> ''`,
      visitParams,
    ));
  }

  if (stallingShortIds.length > 0) {
    note("Betalingen bij stallingen opzoeken");
    remember(candidates, await copier.values(
      `SELECT DISTINCT accountID FROM financialtransactions WHERE ${FINANCIAL_DATE} AND bikeparkID IN (${placeholders(stallingShortIds)})`,
      [from, to, ...stallingShortIds],
    ));
    await addPassesForPasIds(await copier.values(
      `SELECT DISTINCT t.PasID
       FROM financialtransactions f
       INNER JOIN transacties t ON t.ID = f.transactionID
       WHERE (f.transactionDate IS NULL OR (f.transactionDate >= ? AND f.transactionDate < ?))
         AND f.bikeparkID IN (${placeholders(stallingShortIds)})
         AND t.PasID <> ''`,
      [from, to, ...stallingShortIds],
    ));
  }
  remember(candidates, await valuesIn(
    copier,
    subscriptionIds,
    (ph) => `SELECT DISTINCT accountID FROM financialtransactions WHERE subscriptionID IN (${ph}) AND ${FINANCIAL_DATE}`,
    [from, to],
  ));

  const pointerRows = await rowsIn(copier, [...passes], (ph) => `SELECT AccountID FROM accounts_pasids WHERE ID IN (${ph})`);
  for (const row of pointerRows) {
    const pointer = cell(row, "AccountID");
    if (pointer) candidates.add(pointer);
  }

  if (copyAllOwnerAccounts && owners.length > 0) {
    note("Alle passen van de data-eigenaren opzoeken");
    const ownerPasses = await copier.rows(
      `SELECT ID, AccountID FROM accounts_pasids WHERE SiteID IN (${placeholders(owners)})`,
      owners,
    );
    for (const row of ownerPasses) {
      const id = cell(row, "ID");
      const pointer = cell(row, "AccountID");
      if (id) passes.add(id);
      if (pointer) candidates.add(pointer);
    }
    const ownerCouncils = await copier.rows(
      `SELECT ID, AccountID FROM gemeenteaccounts WHERE SiteID IN (${placeholders(owners)})`,
      owners,
    );
    for (const row of ownerCouncils) {
      const id = cell(row, "ID");
      const accountId = cell(row, "AccountID");
      if (id) councils.add(id);
      if (accountId) accounts.add(accountId);
    }
  }

  const resolveCandidates = async (ids: string[]) => {
    const councilRows = await rowsIn(copier, ids, (ph) => `SELECT ID, AccountID FROM gemeenteaccounts WHERE ID IN (${ph})`);
    const matched = new Set<string>();
    for (const row of councilRows) {
      const id = cell(row, "ID");
      const accountId = cell(row, "AccountID");
      if (id) {
        councils.add(id);
        matched.add(id);
      }
      if (accountId) accounts.add(accountId);
    }
    for (const id of ids) {
      if (!matched.has(id)) accounts.add(id);
    }
  };
  await resolveCandidates([...candidates].filter((id) => !councils.has(id)));

  if (owners.length > 0) {
    const councilsForAccounts = await rowsIn(
      copier,
      [...accounts],
      (ph) => `SELECT ID, AccountID FROM gemeenteaccounts WHERE SiteID IN (${placeholders(owners)}) AND AccountID IN (${ph})`,
      owners,
    );
    for (const row of councilsForAccounts) {
      const id = cell(row, "ID");
      if (id) councils.add(id);
    }
    const linkedPasses = await rowsIn(
      copier,
      [...new Set([...councils, ...accounts])],
      (ph) => `SELECT ID, AccountID FROM accounts_pasids WHERE SiteID IN (${placeholders(owners)}) AND AccountID IN (${ph})`,
      owners,
    );
    const extra: string[] = [];
    for (const row of linkedPasses) {
      const id = cell(row, "ID");
      const pointer = cell(row, "AccountID");
      if (id) passes.add(id);
      if (pointer && !councils.has(pointer) && !accounts.has(pointer)) extra.push(pointer);
    }
    if (extra.length > 0) await resolveCandidates(extra);
  }

  const financialIds = new Set<string>();
  if (stallingShortIds.length > 0) {
    remember(financialIds, await copier.values(
      `SELECT ID FROM financialtransactions WHERE ${FINANCIAL_DATE} AND bikeparkID IN (${placeholders(stallingShortIds)})`,
      [from, to, ...stallingShortIds],
    ));
  }
  remember(financialIds, await valuesIn(
    copier,
    subscriptionIds,
    (ph) => `SELECT ID FROM financialtransactions WHERE subscriptionID IN (${ph}) AND ${FINANCIAL_DATE}`,
    [from, to],
  ));
  remember(financialIds, await valuesIn(
    copier,
    [...accounts],
    (ph) => `SELECT ID FROM financialtransactions WHERE accountID IN (${ph}) AND ${FINANCIAL_DATE}`,
    [from, to],
  ));

  return {
    accountIds: [...accounts],
    passIds: [...passes],
    councilIds: [...councils],
    subscriptionIds,
    financialIds: [...financialIds],
  };
}

async function selectBarcodeIds(
  copier: TableCopier,
  owners: string[],
  stallingUuids: string[],
  passIds: string[],
  subscriptionIds: string[],
  financialIds: string[],
  from: Date,
  to: Date,
): Promise<string[]> {
  if (owners.length === 0) return [];
  const codes = new Set<string>();
  remember(codes, await valuesIn(
    copier,
    passIds,
    (ph) => `SELECT DISTINCT barcodeFiets FROM accounts_pasids WHERE ID IN (${ph}) AND barcodeFiets IS NOT NULL AND barcodeFiets <> ''`,
  ));
  remember(codes, await valuesIn(
    copier,
    subscriptionIds,
    (ph) => `SELECT DISTINCT barcode FROM abonnementen WHERE ID IN (${ph}) AND barcode IS NOT NULL AND barcode <> ''`,
  ));
  if (stallingUuids.length > 0) {
    const visitWhere = `FietsenstallingID IN (${placeholders(stallingUuids)}) AND ${VISIT_DATE}`;
    const visitParams = [...stallingUuids, from, to];
    remember(codes, await copier.values(
      `SELECT DISTINCT BarcodeFiets_in FROM transacties WHERE ${visitWhere} AND BarcodeFiets_in IS NOT NULL AND BarcodeFiets_in <> ''`,
      visitParams,
    ));
    remember(codes, await copier.values(
      `SELECT DISTINCT BarcodeFiets_uit FROM transacties WHERE ${visitWhere} AND BarcodeFiets_uit IS NOT NULL AND BarcodeFiets_uit <> ''`,
      visitParams,
    ));
  }
  remember(codes, await valuesIn(
    copier,
    financialIds,
    (ph) => `SELECT DISTINCT t.BarcodeFiets_in
      FROM financialtransactions f
      INNER JOIN transacties t ON t.ID = f.transactionID
      WHERE f.ID IN (${ph}) AND t.BarcodeFiets_in IS NOT NULL AND t.BarcodeFiets_in <> ''`,
  ));
  remember(codes, await valuesIn(
    copier,
    financialIds,
    (ph) => `SELECT DISTINCT t.BarcodeFiets_uit
      FROM financialtransactions f
      INNER JOIN transacties t ON t.ID = f.transactionID
      WHERE f.ID IN (${ph}) AND t.BarcodeFiets_uit IS NOT NULL AND t.BarcodeFiets_uit <> ''`,
  ));
  const rows = await rowsIn(
    copier,
    [...codes],
    (ph) => `SELECT ID FROM barcoderegister WHERE SiteID IN (${placeholders(owners)}) AND Barcode IN (${ph})`,
    owners,
  );
  return rows.map((row) => cell(row, "ID")).filter(Boolean);
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
  let groupSummary = "";
  let groupIndex = 0;
  let groupTotal = 0;
  const publish = (step: string) => {
    const detail = groupTotal > 0
      ? `${groupSummary} · tabel ${groupIndex} van ${groupTotal}: ${step}`
      : step;
    notePhase(job, detail);
    job.counts = { ...copier.counts };
    job.warnings = copier.warnings.slice(-40);
  };
  copier = new TableCopier(source, target, anonymizer, publish);

  async function group(phaseId: string, summary: string, tasks: Array<() => Promise<void>>): Promise<void> {
    activatePhase(job, phaseId, summary);
    groupSummary = summary;
    groupTotal = tasks.length;
    for (let index = 0; index < tasks.length; index += 1) {
      groupIndex = index + 1;
      await tasks[index]();
    }
    groupTotal = 0;
  }

  try {
    await source.query("SET SESSION TRANSACTION READ ONLY");
    activatePhase(job, "wipe", "Tabellen leegmaken");
    await copier.prepareTarget();
    await ensureTestAdmin();

    await group("baseline", "Basisgegevens", [
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
      "tariefcodes",
      "instellingen",
      "contacts_fietsberaad",
      "sleutelhangerreeksen",
    ].map((table) => () => copier.copyAll(table)));

    activatePhase(job, "organisations", "Organisaties opzoeken");
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

    const contactLink = exploitants.length > 0
      ? `childSiteID IN (${placeholders(requestedOwners)}) OR parentSiteID IN (${placeholders(exploitants)})`
      : `childSiteID IN (${placeholders(requestedOwners)})`;
    notePhase(job, `${contactIds.length} organisaties en contacten`);
    await group("organisations", `${contactIds.length} organisaties en contacten`, [
      () => releaseTestAdminContact().then(() => undefined),
      () => copier.copyIn("contacts", "ID", contactIds),
      () => ensureTestAdmin().then(() => undefined),
      () => copier.copyWhere(
        "contact_contact",
        contactLink,
        exploitants.length > 0 ? [...requestedOwners, ...exploitants] : requestedOwners,
      ),
      () => copier.copyIn("contact_fietsenstalling", "SiteID", contactIds),
      () => copier.copyIn("contact_report_settings", "siteID", contactIds),
      () => copier.copyIn("modules_contacts", "SiteID", contactIds),
      () => copier.copyIn("contacts_faq", "SiteID", contactIds),
    ]);

    activatePhase(job, "stallingen", `${stallingUuids.length} stallingen opzoeken`);
    const sectionIds = await copier.values(
      `SELECT sectieId FROM fietsenstalling_sectie WHERE fietsenstallingsId IN (${placeholders(stallingUuids)})`,
      stallingUuids,
    );
    const placeIds = sectionIds.length === 0
      ? []
      : await copier.values(
          `SELECT id FROM fietsenstalling_plek WHERE sectie_id IN (${placeholders(sectionIds)})`,
          sectionIds,
        );
    await group("stallingen", `${stallingUuids.length} stallingen`, [
      () => copier.copyIn("fietsenstallingen", "ID", stallingUuids),
      () => copier.copyIn("fietsenstalling_sectie", "fietsenstallingsId", stallingUuids),
      () => copier.copyIn("fietsenstalling_plek", "sectie_id", sectionIds),
      () => copier.copyIn("fietsenstalling_plek_bezetting", "plek_id", placeIds),
      () => copier.copyIn("plaats_fietstype", "plaats_id", placeIds),
      () => copier.copyIn("fietsenstalling_sectie_kostenperioden", "sectieId", sectionIds),
      () => copier.copyWhere(
        "sectie_fietstype",
        sectionIds.length > 0
          ? `StallingsID IN (${placeholders(stallingUuids)}) OR sectieID IN (${placeholders(sectionIds)})`
          : `StallingsID IN (${placeholders(stallingUuids)})`,
        sectionIds.length > 0 ? [...stallingUuids, ...sectionIds] : stallingUuids,
      ),
      () => copier.copyIn("fietsenstallingen_services", "FietsenstallingID", stallingUuids),
      () => copier.copyIn("fietsenstallingen_winkansen", "FietsenstallingID", stallingUuids),
      () => copier.copyIn("uitzonderingenopeningstijden", "fietsenstallingsID", stallingUuids),
    ]);

    activatePhase(job, "subscriptions", "Abonnementen opzoeken");
    const subscriptionWhere = exploitants.length > 0
      ? `siteID IN (${placeholders(contactIds)}) OR exploitantSiteID IN (${placeholders(exploitants)})`
      : `siteID IN (${placeholders(contactIds)})`;
    const subscriptionIds = await copier.values(
      `SELECT ID FROM abonnementsvormen WHERE siteID IN (${placeholders(contactIds)}) ${exploitants.length ? `OR exploitantSiteID IN (${placeholders(exploitants)})` : ""}`,
      exploitants.length ? [...contactIds, ...exploitants] : contactIds,
    );
    const bikeTypeLinkIds = await copier.values(
      `SELECT SectionBiketypeID FROM sectie_fietstype WHERE StallingsID IN (${placeholders(stallingUuids)})${sectionIds.length ? ` OR sectieID IN (${placeholders(sectionIds)})` : ""}`,
      sectionIds.length ? [...stallingUuids, ...sectionIds] : stallingUuids,
    );
    const tariffIds = [...stallingUuids, ...stallingShortIds];
    const tariffClauses = [`stallingsID IN (${placeholders(tariffIds)})`];
    const tariffParams: unknown[] = [...tariffIds];
    if (stallingShortIds.length > 0) {
      tariffClauses.push(`\`__stallingsID\` IN (${placeholders(stallingShortIds)})`);
      tariffParams.push(...stallingShortIds);
    }
    if (sectionIds.length > 0) {
      tariffClauses.push(`sectieID IN (${placeholders(sectionIds)})`);
      tariffParams.push(...sectionIds);
    }
    if (bikeTypeLinkIds.length > 0) {
      tariffClauses.push(`sectionBikeTypeID IN (${placeholders(bikeTypeLinkIds)})`);
      tariffParams.push(...bikeTypeLinkIds);
    }
    const tariffWhere = tariffClauses.join(" OR ");
    await group("subscriptions", "Abonnementen en tarieven", [
      () => copier.copyWhere(
        "abonnementsvormen",
        subscriptionWhere,
        exploitants.length > 0 ? [...contactIds, ...exploitants] : contactIds,
      ),
      () => copier.copyIn("abonnementsvorm_fietsenstalling", "BikeparkID", stallingUuids),
      () => copier.copyIn("abonnementsvorm_fietstype", "SubscriptiontypeID", subscriptionIds),
      () => copier.copyWhere("tariefregels", tariffWhere, tariffParams),
      () => copier.copyIn("fmsservice_permit", "BikeparkID", stallingUuids),
      () => copier.copyIn("externe_apis_locaties", "BikeparkID", [...stallingUuids, ...stallingShortIds]),
    ]);

    activatePhase(job, "users", "Gebruikers opzoeken");
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
    notePhase(job, `${userIds.length} gebruikers`);
    await group("users", `${userIds.length} gebruikers`, [
      () => copier.copyIn("security_users", "UserID", userIds),
      () => copier.copyIn("user_contact_role", "UserID", userIds, `ContactID IN (${placeholders(contactIds)})`, contactIds),
      () => copier.copyIn("security_users_sites", "UserID", userIds, `SiteID IN (${placeholders(contactIds)})`, contactIds),
      () => copier.copyIn("user_status", "UserID", userIds),
      () => userIds.length === 0
        ? Promise.resolve()
        : copier.copyWhere(
            "contacts_datakwaliteitcontroles",
            `contact_id IN (${placeholders(contactIds)}) AND user_id IN (${placeholders(userIds)})`,
            [...contactIds, ...userIds],
          ),
    ]);

    activatePhase(job, "accounts", "Accounts opzoeken");
    const graph = await selectAccountGraph(
      copier,
      requestedOwners,
      stallingUuids,
      stallingShortIds,
      from,
      to,
      input.copyAllOwnerAccounts,
      (detail) => notePhase(job, detail),
    );
    const accountIds = graph.accountIds;
    const barcodeIds = input.copyAllOwnerBarcodes
      ? []
      : await selectBarcodeIds(
        copier,
        requestedOwners,
        stallingUuids,
        graph.passIds,
        graph.subscriptionIds,
        graph.financialIds,
        from,
        to,
      );
    notePhase(job, `${accountIds.length} accounts, ${graph.passIds.length} passen`);
    await group("accounts", `${accountIds.length} accounts, ${graph.passIds.length} passen`, [
      () => copier.copyIn("accounts", "ID", accountIds),
      () => copier.copyIn("gemeenteaccounts", "ID", graph.councilIds),
      () => copier.copyIn("accounts_pasids", "ID", graph.passIds),
      () => copier.copyIn("historischesaldos", "accountID", accountIds),
      () => copier.copyIn("abonnementen", "ID", graph.subscriptionIds),
      () => copier.copyIn("financialtransactions", "ID", graph.financialIds),
      () => copier.copyIn(
        "account_transacties",
        "accountId",
        accountIds,
        "boekdatum IS NULL OR (boekdatum >= ? AND boekdatum < ?)",
        [from, to],
      ),
      () => input.copyAllOwnerBarcodes
        ? copier.copyIn("barcoderegister", "SiteID", requestedOwners)
        : copier.copyIn("barcoderegister", "ID", barcodeIds),
    ]);

    activatePhase(job, "visits", `${stallingUuids.length} stallingen, bezoeken opzoeken`);
    const bulkIds = stallingShortIds.length === 0
      ? []
      : await copier.values(
          `SELECT ID FROM bulkreservering WHERE BikeparkExternalID IN (${placeholders(stallingShortIds)})`,
          stallingShortIds,
        );
    const gemeenteCodes = await copier.values(
      `SELECT Gemeentecode FROM contacts WHERE ID IN (${placeholders(requestedOwners)}) AND Gemeentecode IS NOT NULL`,
      requestedOwners,
    );
    const visitTasks: Array<() => Promise<void>> = [
      () => copier.copyIn(
        "transacties",
        "FietsenstallingID",
        stallingUuids,
        "(Date_checkin >= ? AND Date_checkin < ?) OR Date_checkout IS NULL",
        [from, to],
      ),
    ];
    if (stallingShortIds.length > 0) {
      visitTasks.push(
        () => copier.copyIn(
          "transacties_archief",
          "locationid",
          stallingShortIds,
          "checkindate >= ? AND checkindate < ?",
          [from, to],
        ),
        () => copier.copyIn(
          "bezettingsdata",
          "bikeparkID",
          stallingShortIds,
          "timestamp >= ? AND timestamp < ?",
          [from, to],
        ),
        () => copier.copyIn(
          "transacties_archief_day_cache",
          "locationID",
          stallingShortIds,
          "checkoutdate >= ? AND checkoutdate < ?",
          [from, to],
        ),
        () => copier.copyIn(
          "stallingsduur_cache",
          "locationID",
          stallingShortIds,
          "checkoutdate >= ? AND checkoutdate < ?",
          [from, to],
        ),
        () => copier.copyIn(
          "bezettingsdata_day_hour_cache",
          "bikeparkID",
          stallingShortIds,
          "timestamp >= ? AND timestamp < ?",
          [from, to],
        ),
        () => copier.copyIn("bulkreservering", "BikeparkExternalID", stallingShortIds),
      );
    }
    visitTasks.push(() => copier.copyIn("bulkreserveringuitzondering", "BulkreservationID", bulkIds));
    if (gemeenteCodes.length > 0) {
      visitTasks.push(() => copier.copyWhere(
        "transacties_gemeente_totaal",
        `zipID IN (${placeholders(gemeenteCodes)}) AND jaar >= ? AND jaar <= ?`,
        [...gemeenteCodes, from.getFullYear(), to.getFullYear()],
      ));
    }
    await group("visits", `${stallingUuids.length} stallingen`, visitTasks);

    activatePhase(job, "content", "Wachtlijst opzoeken");
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
    await group("content", "Presentaties, prijzen en wachtlijst", [
      () => copier.copyIn("presentations", "SiteID", contactIds),
      () => copier.copyIn("presentations_ticker", "SiteID", contactIds),
      () => copier.copyIn("prijzen", "SiteID", contactIds),
      () => copier.copyIn("wachtlijst", "id", waitingListIds),
      () => copier.copyIn("wachtlijst_item", "wachtlijst_item_id", waitingItemIds),
      () => copier.copyIn("wachtlijst_fietstype", "wachtlijst_id", waitingItemIds),
    ]);

    await target.query("UPDATE instellingen SET productionserver = 0, MollieAPIKey = ?, MollieID = ?", [mollieKey, mollieId]);
    await ensureTestAdmin();

    activatePhase(job, "library", "Bestanden opzoeken");
    job.libraryFiles = await downloadLibrary(target, (step) => {
      notePhase(job, step);
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
    completePhases(job);
    job.status = "done";
    job.finishedAt = new Date().toISOString();
  } finally {
    await source.end();
    await target.end();
  }
}
