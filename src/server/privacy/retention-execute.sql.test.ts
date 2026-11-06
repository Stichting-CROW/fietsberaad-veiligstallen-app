import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { PrismaClient } from "../../generated/prisma-client";
import { executeActionChunk, type PrivacyDb } from "./retention-execute";
import { RetentionPostConditionError } from "./retention-rules";

const databaseUrl = process.env.PRIVACY_TEST_DATABASE_URL;
const databaseName = databaseUrl?.split("/").pop()?.split("?")[0] ?? "";
const safeDatabase = /test|privacy/i.test(databaseName);

function at<T>(rows: readonly T[], index: number): T {
  const row = rows[index];
  if (row === undefined) throw new Error(`missing row ${index}`);
  return row;
}

function adapt(client: { $queryRawUnsafe: Function; $executeRawUnsafe: Function }): PrivacyDb {
  return {
    async query<T>(sql: string, params: unknown[]): Promise<T[]> {
      return client.$queryRawUnsafe(sql, ...params);
    },
    async execute(sql: string, params: unknown[]): Promise<number> {
      return Number(await client.$executeRawUnsafe(sql, ...params));
    },
  };
}

async function untilDone(
  prisma: PrismaClient,
  action: Parameters<typeof executeActionChunk>[1],
  asOf: Date,
  chunkSize: number,
): Promise<number> {
  let cursor: string | null = null;
  let changed = 0;
  for (let i = 0; i < 20; i += 1) {
    const chunk = await prisma.$transaction(async (tx) =>
      executeActionChunk(adapt(tx), action, cursor, asOf, chunkSize, "write"),
    );
    changed += chunk.rowsChanged;
    if (chunk.doneAction) return changed;
    cursor = chunk.nextCursor;
  }
  throw new Error(`${action} did not finish`);
}

describe("privacy retention SQL", { skip: !databaseUrl || !safeDatabase, concurrency: 1 }, () => {
  const asOf = new Date("2026-10-14T12:00:00Z");
  let prisma: PrismaClient;

  before(async () => {
    prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    const tables = [
      "transacties",
      "financialtransactions",
      "historischesaldos",
      "abonnementen",
      "accounts_pasids",
      "gemeenteaccounts",
      "winkansen",
      "winkansen_zelf_inzet",
      "wachtlijst_item",
      "fietsenstalling_plek_bezetting",
      "accounts",
      "prijswinnaars",
      "prijswinnaars_backup",
      "prijzenpot",
      "trekkingen",
    ];
    for (const table of tables) {
      await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS \`${table}\``);
    }
    await prisma.$executeRawUnsafe(`
      CREATE TABLE transacties (
        ID INT NOT NULL PRIMARY KEY,
        PasID VARCHAR(35) NOT NULL,
        PassUUID VARCHAR(35) NULL,
        BarcodeFiets_in VARCHAR(36) NULL,
        BarcodeFiets_uit VARCHAR(36) NULL,
        FietsenstallingID VARCHAR(35) NOT NULL,
        Stallingskosten DECIMAL(8,2) NULL,
        Date_checkout DATETIME NULL
      )`);
    await prisma.$executeRawUnsafe(`
      CREATE TABLE financialtransactions (
        ID VARCHAR(35) NOT NULL PRIMARY KEY,
        amount DECIMAL(8,2) NULL,
        transactionDate DATETIME NULL,
        status VARCHAR(10) NULL,
        accountID VARCHAR(35) NULL,
        paidToSiteID VARCHAR(35) NULL,
        paidBySiteID VARCHAR(35) NULL,
        sourceSiteID VARCHAR(35) NULL,
        siteID VARCHAR(35) NULL,
        transactionID INT NULL
      )`);
    await prisma.$executeRawUnsafe(`
      CREATE TABLE historischesaldos (
        accountID VARCHAR(35) NOT NULL,
        siteID VARCHAR(35) NOT NULL,
        exploitantID VARCHAR(35) NOT NULL,
        saldo DECIMAL(8,2) NOT NULL,
        dateCreated DATETIME NULL,
        dateModified DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (accountID, siteID, exploitantID)
      )`);
    await prisma.$executeRawUnsafe(`
      CREATE TABLE accounts (
        ID VARCHAR(35) NOT NULL PRIMARY KEY,
        Email VARCHAR(100) NULL,
        EncryptedPassword VARCHAR(60) NULL,
        Sex VARCHAR(10) NULL,
        FirstName VARCHAR(100) NULL,
        MiddleName VARCHAR(50) NULL,
        LastName VARCHAR(100) NULL,
        Address VARCHAR(255) NULL,
        Address_Nr VARCHAR(10) NULL,
        Zip VARCHAR(10) NULL,
        City VARCHAR(100) NULL,
        Phone VARCHAR(50) NULL,
        Mobile VARCHAR(50) NULL,
        Nieuwsbrief VARCHAR(4) NULL,
        Status VARCHAR(4) NULL,
        DateRegistration DATETIME NULL,
        LastLogin DATETIME NULL,
        DateDeleted DATETIME NULL,
        WinkansInzetMehode VARCHAR(20) NULL,
        saldo DECIMAL(10,2) NULL,
        account_type VARCHAR(20) NULL,
        dateLastSaldoUpdate DATETIME NULL,
        dateLastPrize DATETIME NULL,
        nameLastPrize VARCHAR(255) NULL
      )`);
    await prisma.$executeRawUnsafe(`
      CREATE TABLE accounts_pasids (
        ID VARCHAR(35) NOT NULL PRIMARY KEY,
        AccountID VARCHAR(35) NULL,
        PasID VARCHAR(36) NOT NULL,
        dateModified DATETIME NOT NULL
      )`);
    await prisma.$executeRawUnsafe(`
      CREATE TABLE gemeenteaccounts (
        ID VARCHAR(35) NOT NULL PRIMARY KEY,
        SiteID VARCHAR(35) NOT NULL,
        AccountID VARCHAR(35) NOT NULL
      )`);
    await prisma.$executeRawUnsafe(`
      CREATE TABLE winkansen (
        PasID VARCHAR(255) NOT NULL,
        Datum DATE NOT NULL,
        ZipID VARCHAR(35) NOT NULL,
        FietsenstallingID VARCHAR(35) NOT NULL,
        PRIMARY KEY (PasID, Datum, ZipID)
      )`);
    await prisma.$executeRawUnsafe(`
      CREATE TABLE winkansen_zelf_inzet (
        PasID VARCHAR(255) NOT NULL,
        Datum DATE NOT NULL,
        ZipID VARCHAR(35) NOT NULL,
        FietsenstallingID VARCHAR(35) NOT NULL,
        SectieID VARCHAR(255) NOT NULL,
        Winkans_zelf_inzet_prijsID VARCHAR(35) NOT NULL,
        PRIMARY KEY (PasID, Datum, ZipID, Winkans_zelf_inzet_prijsID)
      )`);
    await prisma.$executeRawUnsafe(`
      CREATE TABLE wachtlijst_item (
        wachtlijst_item_id INT NOT NULL PRIMARY KEY,
        account_id VARCHAR(35) NULL
      )`);
    await prisma.$executeRawUnsafe(`
      CREATE TABLE fietsenstalling_plek_bezetting (
        account_id VARCHAR(35) NOT NULL,
        plek_id INT NOT NULL,
        status VARCHAR(20) NULL,
        PRIMARY KEY (account_id, plek_id)
      )`);
    await prisma.$executeRawUnsafe(`
      CREATE TABLE abonnementen (
        ID INT NOT NULL PRIMARY KEY,
        barcode VARCHAR(12) NULL,
        AccountID VARCHAR(35) NULL,
        bikepassID VARCHAR(35) NULL,
        afloopdatum DATETIME NULL,
        prijsInclBtw DECIMAL(8,2) NULL
      )`);
    await prisma.$executeRawUnsafe(`
      CREATE TABLE trekkingen (
        ID VARCHAR(35) NOT NULL PRIMARY KEY,
        TijdstipTrekking DATETIME NULL
      )`);
    await prisma.$executeRawUnsafe(`
      CREATE TABLE prijzenpot (
        ID VARCHAR(35) NOT NULL PRIMARY KEY,
        TrekkingID VARCHAR(35) NULL,
        PrijsID VARCHAR(35) NULL
      )`);
    await prisma.$executeRawUnsafe(`
      CREATE TABLE prijswinnaars (
        ID INT NOT NULL PRIMARY KEY,
        TrekkingID VARCHAR(35) NULL,
        PrijsID VARCHAR(35) NULL,
        PasID VARCHAR(35) NULL
      )`);
    await prisma.$executeRawUnsafe(`
      CREATE TABLE prijswinnaars_backup (
        ID VARCHAR(35) NOT NULL PRIMARY KEY,
        TrekkingID VARCHAR(35) NULL,
        PasID VARCHAR(35) NULL,
        Email VARCHAR(100) NULL
      )`);

    await prisma.$executeRawUnsafe(`
      INSERT INTO transacties (ID, PasID, PassUUID, BarcodeFiets_in, BarcodeFiets_uit, FietsenstallingID, Stallingskosten, Date_checkout) VALUES
      (1, 'RECENT-PASS', 'recent-uuid', 'IN-RECENT', 'OUT-RECENT', 'stall-1', 1.25, '2025-04-15 12:00:00'),
      (2, 'OPEN-PASS', NULL, NULL, NULL, 'stall-1', 2.00, NULL),
      (3, 'OLD-PASS', 'old-uuid', 'IN-OLD', 'OUT-OLD', 'stall-9', 3.50, '2025-04-13 12:00:00'),
      (4, 'MID-PASS', 'mid-uuid', 'IN-MID', NULL, 'stall-4', 4.00, '2016-10-15 12:00:00'),
      (5, 'ANCIENT-PASS', 'ancient-uuid', 'IN-ANCIENT', 'OUT-ANCIENT', 'stall-5', 5.00, '2016-10-13 12:00:00')
    `);
    await prisma.$executeRawUnsafe(`
      INSERT INTO financialtransactions (ID, amount, transactionDate, status, accountID, paidToSiteID, siteID, transactionID) VALUES
      ('f-young', 8.00, '2025-12-01 00:00:00', 'ok', 'ACC-YOUNG', 'E1', 'S1', 111),
      ('f-a', 4.00, '2024-01-01 00:00:00', 'ok', 'ACC1', 'E1', 'S1', 222),
      ('f-b', 6.00, '2024-02-01 00:00:00', 'ok', 'ACC1', 'E1', 'S1', 333),
      ('f-exploitant', 9.00, '2024-01-01 00:00:00', 'ok', 'ACC1', '1', 'S1', 444),
      ('f-seven', 1.50, '2018-01-01 00:00:00', 'ok', 'ACC1', 'E1', 'S1', 555)
    `);
    await prisma.$executeRawUnsafe(`
      INSERT INTO accounts (ID, Email, FirstName, LastName, Phone, Status, DateRegistration, LastLogin, saldo, account_type) VALUES
      ('A1', 'old@example.com', 'Oud', 'Account', '0600000001', '1', '2019-01-01', '2020-01-01', 12.00, 'USER'),
      ('A2', 'recent@example.com', 'Recent', 'Account', '0600000002', '1', '2024-01-01', '2026-10-01', 3.00, 'USER'),
      ('A3', 'wait@example.com', 'Wacht', 'Account', '0600000003', '1', '2019-01-01', '2020-01-01', 1.00, 'USER'),
      ('A4', 'open@example.com', 'Open', 'Account', '0600000004', '1', '2019-01-01', '2020-01-01', 1.00, 'USER'),
      ('A5', 'system@example.com', 'Systeem', 'Account', '0600000005', '1', '2019-01-01', '2020-01-01', 1.00, 'SYSTEM'),
      ('A6', 'cancelled@example.com', 'Vervallen', 'Account', '0600000006', '1', '2019-01-01', '2020-01-01', 2.00, 'USER')
    `);
    await prisma.$executeRawUnsafe(`
      INSERT INTO accounts_pasids (ID, AccountID, PasID, dateModified) VALUES
      ('P1', 'A1', 'PAS-A1', '2020-01-01'),
      ('P2', 'A2', 'PAS-A2', '2026-09-01'),
      ('P6', 'A6', 'PAS-A6', '2020-01-01')
    `);
    await prisma.$executeRawUnsafe(`
      INSERT INTO gemeenteaccounts (ID, SiteID, AccountID) VALUES ('G1', 'S1', 'A1'), ('G6', 'S1', 'A6')
    `);
    await prisma.$executeRawUnsafe(`
      INSERT INTO winkansen (PasID, Datum, ZipID, FietsenstallingID) VALUES
      ('PAS-A1', '2020-01-01', '1000', 'stall-1'),
      ('PAS-A6', '2020-01-01', '1000', 'stall-1')
    `);
    await prisma.$executeRawUnsafe(`
      INSERT INTO winkansen_zelf_inzet (PasID, Datum, ZipID, FietsenstallingID, SectieID, Winkans_zelf_inzet_prijsID) VALUES
      ('PAS-A1', '2020-01-01', '1000', 'stall-1', '', 'prijs-1')
    `);
    await prisma.$executeRawUnsafe(`
      INSERT INTO wachtlijst_item (wachtlijst_item_id, account_id) VALUES (1, 'A3')
    `);
    await prisma.$executeRawUnsafe(`
      INSERT INTO fietsenstalling_plek_bezetting (account_id, plek_id, status) VALUES
      ('A4', 1, 'ACTIVE'),
      ('A6', 2, 'CANCELLED')
    `);
    await prisma.$executeRawUnsafe(`
      INSERT INTO abonnementen (ID, barcode, AccountID, bikepassID, afloopdatum, prijsInclBtw) VALUES
      (1, 'BC-OLD', 'A1', 'P1', '2020-01-01', 19.95),
      (2, 'BC-LIVE', 'A2', 'P2', '2027-01-01', 29.95)
    `);
    await prisma.$executeRawUnsafe(`
      INSERT INTO trekkingen (ID, TijdstipTrekking) VALUES ('T-OLD', '2010-01-01'), ('T-NEW', '2024-01-01')
    `);
    await prisma.$executeRawUnsafe(`
      INSERT INTO prijzenpot (ID, TrekkingID, PrijsID) VALUES ('pot-old', 'T-OLD', 'prijs-old'), ('pot-new', 'T-NEW', 'prijs-new')
    `);
    await prisma.$executeRawUnsafe(`
      INSERT INTO prijswinnaars (ID, TrekkingID, PrijsID, PasID) VALUES
      (1, 'T-OLD', 'prijs-old', 'PAS-OLD'),
      (2, 'T-NEW', 'prijs-new', 'PAS-NEW')
    `);
    await prisma.$executeRawUnsafe(`
      INSERT INTO prijswinnaars_backup (ID, TrekkingID, PasID, Email) VALUES
      ('b-old', 'T-OLD', 'PAS-OLD', 'old-winner@example.com'),
      ('b-new', 'T-NEW', 'PAS-NEW', 'new-winner@example.com')
    `);
  });

  after(async () => {
    await prisma?.$disconnect();
  });

  it("rolls a chunk back when a row outside the window changes", async () => {
    await assert.rejects(
      () => prisma.$transaction(async (tx) => {
        await executeActionChunk(adapt(tx), "cleartransactions", null, asOf, 10, "write", {
          tamper: async (db) => {
            await db.execute("UPDATE transacties SET PasID = ? WHERE ID = ?", ["tampered", 1]);
          },
        });
      }),
      RetentionPostConditionError,
    );
    const rows = await prisma.$queryRawUnsafe<{ ID: number; PasID: string }[]>(
      "SELECT ID, PasID FROM transacties WHERE ID IN (1, 3) ORDER BY ID",
    );
    assert.equal(at(rows, 0).PasID, "RECENT-PASS");
    assert.equal(at(rows, 1).PasID, "OLD-PASS");
  });

  it("deletes transactions older than 18 months and leaves recent and open rows", async () => {
    let cursor: string | null = null;
    for (let i = 0; i < 10; i += 1) {
      const chunk = await prisma.$transaction(async (tx) =>
        executeActionChunk(adapt(tx), "cleartransactions", cursor, asOf, 1, "write"),
      );
      if (i === 0) {
        const gone = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
          "SELECT COUNT(*) AS n FROM transacties WHERE ID = 3",
        );
        assert.equal(Number(at(gone, 0).n), 0);
      }
      if (chunk.doneAction) break;
      cursor = chunk.nextCursor;
    }

    const rows = await prisma.$queryRawUnsafe<{
      ID: number; PasID: string; PassUUID: string | null; BarcodeFiets_in: string | null;
      FietsenstallingID: string; Stallingskosten: { toString(): string } | number;
    }[]>("SELECT ID, PasID, PassUUID, BarcodeFiets_in, FietsenstallingID, Stallingskosten FROM transacties ORDER BY ID");
    const byId = new Map(rows.map((row) => [Number(row.ID), row]));
    assert.deepEqual([...byId.keys()], [1, 2]);
    assert.equal(byId.get(1)?.PasID, "RECENT-PASS");
    assert.equal(byId.get(1)?.PassUUID, "recent-uuid");
    assert.equal(byId.get(1)?.BarcodeFiets_in, "IN-RECENT");
    assert.equal(byId.get(1)?.FietsenstallingID, "stall-1");
    assert.equal(Number(byId.get(1)?.Stallingskosten), 1.25);
    assert.equal(byId.get(2)?.PasID, "OPEN-PASS");
    assert.equal(byId.get(2)?.PassUUID, null);

    const second = await untilDone(prisma, "cleartransactions", asOf, 10);
    assert.equal(second, 0);
    const still = await prisma.$queryRawUnsafe<{ PasID: string }[]>("SELECT PasID FROM transacties WHERE ID = 1");
    assert.equal(at(still, 0).PasID, "RECENT-PASS");
  });

  it("folds a balance once, drops zero balances, and archives the payment", async () => {
    await prisma.$executeRawUnsafe(`
      INSERT INTO historischesaldos (accountID, siteID, exploitantID, saldo) VALUES
      ('KEEP', 'S9', 'E9', 3.00),
      ('ZERO', 'S9', 'E0', 0.00)
    `);
    await untilDone(prisma, "archive_financial", asOf, 10);
    const saldo = await prisma.$queryRawUnsafe<{ accountID: string; exploitantID: string; saldo: unknown }[]>(
      "SELECT accountID, exploitantID, saldo FROM historischesaldos ORDER BY accountID",
    );
    assert.deepEqual(saldo.map((row) => row.accountID), ["ACC1", "KEEP"]);
    assert.equal(at(saldo, 0).exploitantID, "E1");
    assert.equal(Number(at(saldo, 0).saldo), 11.5);
    assert.equal(Number(at(saldo, 1).saldo), 3);

    const young = await prisma.$queryRawUnsafe<{ accountID: string; status: string; transactionID: number }[]>(
      "SELECT accountID, status, transactionID FROM financialtransactions WHERE ID = 'f-young'",
    );
    assert.equal(at(young, 0).accountID, "ACC-YOUNG");
    assert.equal(at(young, 0).status, "ok");
    assert.equal(Number(at(young, 0).transactionID), 111);

    const exploitant = await prisma.$queryRawUnsafe<{ accountID: string | null; status: string }[]>(
      "SELECT accountID, status FROM financialtransactions WHERE ID = 'f-exploitant'",
    );
    assert.equal(at(exploitant, 0).accountID, null);
    assert.equal(at(exploitant, 0).status, "archived");

    await untilDone(prisma, "archive_financial", asOf, 10);
    const again = await prisma.$queryRawUnsafe<{ accountID: string; saldo: unknown }[]>(
      "SELECT accountID, saldo FROM historischesaldos ORDER BY accountID",
    );
    assert.equal(Number(at(again, 0).saldo), 11.5);
    assert.equal(at(again, 1).accountID, "KEEP");
    assert.equal(Number(at(again, 1).saldo), 3);
  });

  it("clears transactionID only after 7 years", async () => {
    await untilDone(prisma, "clear_financial_transaction_id", asOf, 10);
    const rows = await prisma.$queryRawUnsafe<{ ID: string; transactionID: number | null; amount: unknown }[]>(
      "SELECT ID, transactionID, amount FROM financialtransactions WHERE ID IN ('f-a', 'f-seven', 'f-young') ORDER BY ID",
    );
    const byId = new Map(rows.map((row) => [row.ID, row]));
    assert.equal(Number(byId.get("f-a")?.transactionID), 222);
    assert.equal(Number(byId.get("f-a")?.amount), 4);
    assert.equal(byId.get("f-seven")?.transactionID, null);
    assert.equal(Number(byId.get("f-seven")?.amount), 1.5);
    assert.equal(Number(byId.get("f-young")?.transactionID), 111);
  });

  it("deletes prize rows older than 10 years and keeps younger ones", async () => {
    await untilDone(prisma, "delete_prijswinnaars", asOf, 10);
    await untilDone(prisma, "delete_prijswinnaars_backup", asOf, 10);
    const winners = await prisma.$queryRawUnsafe<{ ID: number; PasID: string }[]>("SELECT ID, PasID FROM prijswinnaars");
    assert.equal(winners.length, 1);
    assert.equal(Number(at(winners, 0).ID), 2);
    assert.equal(at(winners, 0).PasID, "PAS-NEW");
    const backup = await prisma.$queryRawUnsafe<{ ID: string; Email: string }[]>("SELECT ID, Email FROM prijswinnaars_backup");
    assert.equal(backup.length, 1);
    assert.equal(at(backup, 0).ID, "b-new");
    assert.equal(at(backup, 0).Email, "new-winner@example.com");
  });
});
