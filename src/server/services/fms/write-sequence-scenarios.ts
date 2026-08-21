/**
 * Phase 2.2 — HTTP write sequences on testgemeente.
 * Derived from Utrecht Vredenburg (3500_005) CF wachtrij patterns, mapped to v4 twins.
 * POST /api/fms/v4 → new_wachtrij_* / new_bezettingsdata_tmp → processQueues → production tables.
 */

import { prisma } from "~/server/db";
import { processQueuesForPassPrefix } from "~/server/services/queue/processor";
import { processLumiguidePath } from "~/server/services/bezettingsdata/update-bezettingsdata-service";
import {
  fmsHttp,
  v4LocationPath,
  type ApiWriteScenario,
  type ApiWriteTestContext,
  type AssertionResult,
} from "./api-write-test-scenarios";

const PROCESSED_OK = 1;

function minutesAfter(ctx: ApiWriteTestContext, minutes: number): Date {
  return new Date(ctx.baseTime.getTime() + minutes * 60 * 1000);
}

function extId(ctx: ApiWriteTestContext, suffix: string): string {
  return `${ctx.passPrefix}mt_${suffix}`;
}

function occSource(ctx: ApiWriteTestContext): string {
  return `WTEST_${ctx.runId}`;
}

function syncMinDate(ctx: ApiWriteTestContext): Date {
  return new Date(ctx.baseTime.getTime() - 2000);
}

async function processThisRun(ctx: ApiWriteTestContext): Promise<void> {
  await processQueuesForPassPrefix(ctx.passPrefix, {
    bikeparkID: ctx.bikeparkID,
    minTransactionDate: syncMinDate(ctx),
  });
}

async function processUntilSyncDone(ctx: ApiWriteTestContext): Promise<void> {
  for (let i = 0; i < 8; i++) {
    await processThisRun(ctx);
    if (!ctx.createdSyncId) return;
    const row = await prisma.new_wachtrij_sync.findUnique({ where: { ID: ctx.createdSyncId } });
    if (row?.processed === PROCESSED_OK) return;
  }
}

async function requireOk(
  ctx: ApiWriteTestContext,
  method: string,
  path: string,
  body?: unknown
): Promise<Record<string, unknown>> {
  const res = await fmsHttp(ctx, method, path, body);
  if (!res.ok || (res.body.status != null && Number(res.body.status) === 0)) {
    throw new Error(`${method} ${path} failed: ${JSON.stringify(res.body)}`);
  }
  return res.body;
}

async function postBike(ctx: ApiWriteTestContext, suffix: string): Promise<void> {
  await requireOk(
    ctx,
    "POST",
    v4LocationPath(ctx, `/idcodes/0/${encodeURIComponent(ctx.pass(suffix))}/bike`),
    { bikeid: `BC_${ctx.runId}_${suffix}`, biketypeid: 1 }
  );
}

async function postManaged(
  ctx: ApiWriteTestContext,
  suffix: string,
  fields: Record<string, unknown>
): Promise<void> {
  await requireOk(
    ctx,
    "POST",
    v4LocationPath(ctx, `/sections/${ctx.sectionID}/managedtransactions`),
    {
      managedtransaction: {
        externaltransactionid: extId(ctx, suffix),
        idcode: ctx.pass(suffix),
        idtype: 0,
        checkintype: "user",
        sectionid: ctx.sectionID,
        ...fields,
      },
    }
  );
}

function rememberSyncId(ctx: ApiWriteTestContext, body: Record<string, unknown>): void {
  const id = Number(body.id);
  ctx.createdSyncId = Number.isFinite(id) && id > 0 ? id : undefined;
}

async function postOccupationBikes(
  ctx: ApiWriteTestContext,
  when: Date,
  suffixes: string[]
): Promise<void> {
  const body = await requireOk(ctx, "POST", v4LocationPath(ctx, `/sections/${ctx.sectionID}/occupation`), {
    data: {
      transactiondate: when.toISOString(),
      bikes: suffixes.map((suffix) => ({
        idcode: ctx.pass(suffix),
        idtype: 0,
        transactiondate: when.toISOString(),
      })),
    },
  });
  rememberSyncId(ctx, body);
}

async function postEmptyOccupationBikes(ctx: ApiWriteTestContext, when: Date): Promise<void> {
  const body = await requireOk(ctx, "POST", v4LocationPath(ctx, `/sections/${ctx.sectionID}/occupation`), {
    data: { transactiondate: when.toISOString(), bikes: [] },
  });
  rememberSyncId(ctx, body);
}

async function findRunSync(ctx: ApiWriteTestContext) {
  if (ctx.createdSyncId) {
    return prisma.new_wachtrij_sync.findUnique({ where: { ID: ctx.createdSyncId } });
  }
  return prisma.new_wachtrij_sync.findFirst({
    where: { bikeparkID: ctx.bikeparkID, transactionDate: { gte: syncMinDate(ctx) } },
    orderBy: { ID: "desc" },
  });
}

function ok(label: string, pass: boolean, expected: string, actual: string): AssertionResult {
  return { label, ok: pass, expected, actual };
}

async function latestTx(passID: string) {
  return prisma.transacties.findFirst({
    where: { PasID: passID },
    orderBy: { Date_checkin: "desc" },
  });
}

async function teardownSequence(ctx: ApiWriteTestContext): Promise<void> {
  const prefix = ctx.passPrefix;
  const pasids = await prisma.accounts_pasids.findMany({
    where: { PasID: { startsWith: prefix } },
    select: { AccountID: true },
  });
  const accountIDs = [...new Set(pasids.map((p) => p.AccountID).filter((id): id is string => !!id))];
  if (accountIDs.length > 0) {
    await prisma.financialtransactions.deleteMany({ where: { accountID: { in: accountIDs } } });
  }
  await prisma.transacties.deleteMany({ where: { PasID: { startsWith: prefix } } });
  await prisma.accounts_pasids.deleteMany({ where: { PasID: { startsWith: prefix } } });
  if (accountIDs.length > 0) {
    await prisma.accounts.deleteMany({ where: { ID: { in: accountIDs } } });
  }
  await prisma.new_wachtrij_pasids.deleteMany({ where: { passID: { startsWith: prefix } } });
  await prisma.new_wachtrij_betalingen.deleteMany({ where: { passID: { startsWith: prefix } } });
  await prisma.new_wachtrij_managed_transacties.deleteMany({
    where: { externalTransactionID: { startsWith: prefix } },
  });
  await prisma.new_wachtrij_sync.deleteMany({
    where: { bikeparkID: ctx.bikeparkID, transactionDate: { gte: ctx.baseTime } },
  });
  await prisma.bezettingsdata.deleteMany({
    where: { bikeparkID: ctx.bikeparkID, source: occSource(ctx) },
  });
  await prisma.new_bezettingsdata_tmp.deleteMany({
    where: { bikeparkID: ctx.bikeparkID, source: occSource(ctx) },
  });
}

export const SEQUENCE_WRITE_SCENARIOS: ApiWriteScenario[] = [
  {
    id: "seq-full-visit",
    label: "Full bike visit (register + check-in + check-out)",
    description:
      "POST bike → managed check-in → managed check-out (same externaltransactionid) → processQueues.",
    writeMethods: ["v4 saveBike", "v4 managedtransactions"],
    act: async (ctx) => {
      await postBike(ctx, "visit");
      await processThisRun(ctx);
      await postManaged(ctx, "visit", { checkindate: minutesAfter(ctx, 0).toISOString() });
      await processThisRun(ctx);
      await postManaged(ctx, "visit", {
        checkindate: minutesAfter(ctx, 0).toISOString(),
        checkoutdate: minutesAfter(ctx, 30).toISOString(),
        checkouttype: "user",
        stallingsduur: 30,
        stallingskosten: 0,
      });
      await processThisRun(ctx);
    },
    assert: async (ctx) => {
      const passID = ctx.pass("visit");
      const bikeQ = await prisma.new_wachtrij_pasids.findFirst({
        where: { passID },
        orderBy: { ID: "desc" },
      });
      const mtQ = await prisma.new_wachtrij_managed_transacties.findMany({
        where: { externalTransactionID: extId(ctx, "visit") },
      });
      const tx = await latestTx(passID);
      return [
        ok("new_wachtrij_pasids processed", bikeQ?.processed === PROCESSED_OK, "1", String(bikeQ?.processed ?? "geen rij")),
        ok(
          "new_wachtrij_managed_transacties processed",
          mtQ.length >= 1 && mtQ.every((r) => r.processed === PROCESSED_OK),
          "all processed=1",
          `${mtQ.filter((r) => r.processed === PROCESSED_OK).length}/${mtQ.length}`
        ),
        ok("transacties closed", !!tx?.Date_checkout, "Date_checkout set", tx?.Date_checkout ? "set" : "open/geen rij"),
        ok("Type_checkin", tx?.Type_checkin?.toLowerCase() === "user", "user", tx?.Type_checkin ?? "geen"),
        ok("Type_checkout", tx?.Type_checkout?.toLowerCase() === "user", "user", tx?.Type_checkout ?? "geen"),
        ok(
          "ExternalTransactionID",
          tx?.ExternalTransactionID === extId(ctx, "visit"),
          extId(ctx, "visit"),
          tx?.ExternalTransactionID ?? "geen"
        ),
      ];
    },
    teardown: teardownSequence,
  },
  {
    id: "seq-visit-inventory-ok",
    label: "Visit + inventory OK",
    description:
      "Managed check-in, then occupation sync with that pass still in bikes[]. Check-in stays open.",
    writeMethods: ["v4 managedtransactions", "v4 occupationAndSync"],
    act: async (ctx) => {
      await postManaged(ctx, "ok", { checkindate: minutesAfter(ctx, 0).toISOString() });
      await processThisRun(ctx);
      await postOccupationBikes(ctx, minutesAfter(ctx, 5), ["ok"]);
      await processUntilSyncDone(ctx);
    },
    assert: async (ctx) => {
      const passID = ctx.pass("ok");
      const sync = await findRunSync(ctx);
      const tx = await latestTx(passID);
      return [
        ok("new_wachtrij_sync processed", sync?.processed === PROCESSED_OK, "1", String(sync?.processed ?? "geen rij")),
        ok("transacties still open", !!tx && tx.Date_checkout == null, "Date_checkout null", tx?.Date_checkout ? "closed" : tx ? "open" : "geen"),
        ok("Type_checkin", tx?.Type_checkin?.toLowerCase() === "user", "user", tx?.Type_checkin ?? "geen"),
      ];
    },
    teardown: teardownSequence,
  },
  {
    id: "seq-visit-bike-gone",
    label: "Visit + bike gone (sync checkout)",
    description:
      "Managed check-in, then occupation sync with empty bikes. Expect Type_checkout=sync.",
    writeMethods: ["v4 managedtransactions", "v4 occupationAndSync"],
    act: async (ctx) => {
      await postManaged(ctx, "gone", { checkindate: minutesAfter(ctx, 0).toISOString() });
      await processThisRun(ctx);
      await postEmptyOccupationBikes(ctx, minutesAfter(ctx, 5));
      await processUntilSyncDone(ctx);
    },
    assert: async (ctx) => {
      const tx = await latestTx(ctx.pass("gone"));
      return [
        ok("transacties closed", !!tx?.Date_checkout, "Date_checkout set", tx?.Date_checkout ? "set" : "open/geen rij"),
        ok("Type_checkout", tx?.Type_checkout?.toLowerCase() === "sync", "sync", tx?.Type_checkout ?? "geen"),
      ];
    },
    teardown: teardownSequence,
  },
  {
    id: "seq-sync-only",
    label: "Sync-only placement",
    description: "Occupation data.bikes only — no managed check-in. Expect Type_checkin=sync.",
    writeMethods: ["v4 occupationAndSync"],
    act: async (ctx) => {
      await postOccupationBikes(ctx, minutesAfter(ctx, 1), ["sync"]);
      await processUntilSyncDone(ctx);
    },
    assert: async (ctx) => {
      const sync = await findRunSync(ctx);
      const tx = await latestTx(ctx.pass("sync"));
      return [
        ok("new_wachtrij_sync processed", sync?.processed === PROCESSED_OK, "1", String(sync?.processed ?? "geen rij")),
        ok("transacties open", !!tx && tx.Date_checkout == null, "open", tx ? (tx.Date_checkout ? "closed" : "open") : "geen"),
        ok("Type_checkin", tx?.Type_checkin?.toLowerCase() === "sync", "sync", tx?.Type_checkin ?? "geen"),
      ];
    },
    teardown: teardownSequence,
  },
  {
    id: "seq-lumiguide",
    label: "Lumiguide occupation",
    description:
      "POST occupation with data.occupation → new_bezettingsdata_tmp → rollup to bezettingsdata.",
    writeMethods: ["v4 occupation"],
    act: async (ctx) => {
      const res = await fmsHttp(ctx, "POST", v4LocationPath(ctx, `/sections/${ctx.sectionID}/occupation`), {
        data: {
          transactiondate: ctx.baseTime.toISOString(),
          occupation: 12,
          capacity: 40,
          checkins: 0,
          checkouts: 0,
          intervalinminutes: 1,
          source: occSource(ctx),
        },
      });
      if (!res.ok || Number(res.body.status) !== 1) {
        throw new Error(`occupation failed: ${JSON.stringify(res.body)}`);
      }
      const tmp = await prisma.new_bezettingsdata_tmp.findFirst({
        where: { bikeparkID: ctx.bikeparkID, source: occSource(ctx) },
        orderBy: { ID: "desc" },
      });
      const tmpId = tmp?.ID ?? Number(res.body.id);
      ctx.createdBezettingTmpId = Number.isFinite(tmpId) && tmpId > 0 ? tmpId : undefined;
      await processLumiguidePath([ctx.bikeparkID]);
    },
    assert: async (ctx) => {
      const row = await prisma.bezettingsdata.findFirst({
        where: { bikeparkID: ctx.bikeparkID, sectionID: ctx.sectionID, source: occSource(ctx) },
        orderBy: { ID: "desc" },
      });
      const tmpAfter = await prisma.new_bezettingsdata_tmp.findFirst({
        where: { bikeparkID: ctx.bikeparkID, source: occSource(ctx) },
      });
      return [
        ok(
          "new_bezettingsdata_tmp enqueued",
          ctx.createdBezettingTmpId != null && ctx.createdBezettingTmpId > 0,
          "tmp row before rollup",
          ctx.createdBezettingTmpId ? `id=${ctx.createdBezettingTmpId}` : "geen rij"
        ),
        ok("bezettingsdata rollup", row?.occupation === 12, "occupation=12", row ? `occupation=${row.occupation}` : "geen rij"),
        ok("new_bezettingsdata_tmp consumed", tmpAfter == null, "geen rij na rollup", tmpAfter ? `id=${tmpAfter.ID}` : "geen rij"),
      ];
    },
    teardown: teardownSequence,
  },
  {
    id: "seq-saldo",
    label: "Saldo top-up",
    description: "Register pass, POST balance, processQueues, assert account saldo.",
    writeMethods: ["v4 saveBike", "v4 addSaldo"],
    act: async (ctx) => {
      await postBike(ctx, "saldo");
      await processThisRun(ctx);
      await requireOk(
        ctx,
        "POST",
        v4LocationPath(ctx, `/idcodes/0/${encodeURIComponent(ctx.pass("saldo"))}/balance`),
        {
          amount: 10,
          paymenttypeid: 1,
          transactiondate: minutesAfter(ctx, 1).toISOString(),
        }
      );
      await processThisRun(ctx);
    },
    assert: async (ctx) => {
      const q = await prisma.new_wachtrij_betalingen.findFirst({
        where: { passID: ctx.pass("saldo") },
        orderBy: { ID: "desc" },
      });
      const pasid = await prisma.accounts_pasids.findFirst({
        where: { PasID: ctx.pass("saldo") },
        select: { AccountID: true },
      });
      const acc = pasid?.AccountID
        ? await prisma.accounts.findUnique({ where: { ID: pasid.AccountID }, select: { saldo: true } })
        : null;
      const saldo = acc != null ? Number(acc.saldo ?? 0) : null;
      return [
        ok("new_wachtrij_betalingen processed", q?.processed === PROCESSED_OK, "1", String(q?.processed ?? "geen rij")),
        ok("accounts.saldo", saldo != null && Math.abs(saldo - 10) < 0.005, "10.00", saldo == null ? "geen account" : saldo.toFixed(2)),
      ];
    },
    teardown: teardownSequence,
  },
];

export function getSequenceWriteScenarioById(id: string): ApiWriteScenario | undefined {
  return SEQUENCE_WRITE_SCENARIOS.find((s) => s.id === id);
}
