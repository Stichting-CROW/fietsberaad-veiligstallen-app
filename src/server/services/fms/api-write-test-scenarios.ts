/**
 * Tier B — HTTP ingress write tests.
 * Calls real /api/fms/v4 routes; asserts queue rows or direct DB effects on testgemeente.
 */

import { prisma } from "~/server/db";
import { processQueues } from "~/server/services/queue/processor";
import { processLumiguidePath } from "~/server/services/bezettingsdata/update-bezettingsdata-service";

export const API_SYNTHETIC_PREFIX = "WTEST_API_";

export type AssertionResult = {
  label: string;
  ok: boolean;
  expected: string;
  actual: string;
};

export type ApiWriteTestContext = {
  runId: string;
  passPrefix: string;
  pass: (suffix: string) => string;
  baseUrl: string;
  authHeader: string;
  citycode: string;
  bikeparkID: string;
  sectionID: string;
  lockerBikeparkID: string;
  lockerSectionID: string;
  lockerPlaceID: string;
  subscriptionTypeID: number;
  baseTime: Date;
  /** Set during scenarios that create subscriptions etc. */
  createdSubscriptionID?: number;
  createdBezettingTmpId?: number;
  previousLockerUrl?: string | null;
  legacyGoneStatus?: { transactions: number; completed: number };
  lockerGoneStatus?: { updatePlace: number; logs: number; actions: number };
};

export type FmsHttpResult = {
  ok: boolean;
  status: number;
  body: Record<string, unknown>;
};

export async function fmsHttp(
  ctx: ApiWriteTestContext,
  method: string,
  path: string,
  body?: unknown,
  query?: Record<string, string>
): Promise<FmsHttpResult> {
  const url = new URL(`${ctx.baseUrl}${path}`);
  if (query) {
    for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
  }
  const res = await fetch(url.toString(), {
    method,
    headers: {
      Authorization: ctx.authHeader,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: body != null ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let parsed: Record<string, unknown> = {};
  try {
    parsed = JSON.parse(text) as Record<string, unknown>;
  } catch {
    parsed = { raw: text };
  }
  return { ok: res.ok, status: res.status, body: parsed };
}

function v4LocationPath(ctx: ApiWriteTestContext, extra = ""): string {
  return `/api/fms/v4/citycodes/${ctx.citycode}/locations/${ctx.bikeparkID}${extra}`;
}

function v4LockerPlacePath(ctx: ApiWriteTestContext, extra = ""): string {
  return `/api/fms/v4/citycodes/${ctx.citycode}/locations/${ctx.lockerBikeparkID}/sections/${ctx.lockerSectionID}/places/${ctx.lockerPlaceID}${extra}`;
}

export type ApiWriteScenario = {
  id: string;
  label: string;
  description: string;
  writeMethods: string[];
  act: (ctx: ApiWriteTestContext) => Promise<void>;
  assert: (ctx: ApiWriteTestContext) => Promise<AssertionResult[]>;
  teardown: (ctx: ApiWriteTestContext) => Promise<void>;
};

export const API_WRITE_SCENARIOS: ApiWriteScenario[] = [
  {
    id: "api-v4-save-bike",
    label: "HTTP V4 bike → new_wachtrij_pasids",
    description: "POST v4 …/idcodes/{idtype}/{idcode}/bike en controleer wachtrijrij.",
    writeMethods: ["v4 saveBike"],
    act: async (ctx) => {
      const res = await fmsHttp(
        ctx,
        "POST",
        v4LocationPath(ctx, `/idcodes/0/${encodeURIComponent(ctx.pass("bike"))}/bike`),
        { bikeid: `BC_${ctx.runId}`, biketypeid: 1 }
      );
      if (!res.ok) throw new Error(`saveBike failed: ${JSON.stringify(res.body)}`);
    },
    assert: async (ctx) => {
      const row = await prisma.new_wachtrij_pasids.findFirst({
        where: { passID: ctx.pass("bike") },
        orderBy: { ID: "desc" },
      });
      return [
        {
          label: "new_wachtrij_pasids row",
          ok: !!row,
          expected: `passID=${ctx.pass("bike")}`,
          actual: row ? `id=${row.ID}` : "geen rij",
        },
      ];
    },
    teardown: async (ctx) => {
      await prisma.new_wachtrij_pasids.deleteMany({ where: { passID: { startsWith: ctx.passPrefix } } });
    },
  },
  {
    id: "api-v4-add-saldo",
    label: "HTTP V4 balance → new_wachtrij_betalingen",
    description: "POST v4 …/idcodes/{idtype}/{idcode}/balance.",
    writeMethods: ["v4 addSaldo"],
    act: async (ctx) => {
      const res = await fmsHttp(
        ctx,
        "POST",
        v4LocationPath(ctx, `/idcodes/0/${encodeURIComponent(ctx.pass("saldo"))}/balance`),
        {
          amount: 5,
          paymenttypeid: 1,
          transactiondate: ctx.baseTime.toISOString(),
        },
      );
      if (!res.ok) throw new Error(`addSaldo failed: ${JSON.stringify(res.body)}`);
    },
    assert: async (ctx) => {
      const row = await prisma.new_wachtrij_betalingen.findFirst({
        where: { passID: ctx.pass("saldo") },
        orderBy: { ID: "desc" },
      });
      return [
        {
          label: "new_wachtrij_betalingen row",
          ok: !!row,
          expected: `passID=${ctx.pass("saldo")}`,
          actual: row ? `id=${row.ID}` : "geen rij",
        },
      ];
    },
    teardown: async (ctx) => {
      await prisma.new_wachtrij_betalingen.deleteMany({ where: { passID: { startsWith: ctx.passPrefix } } });
    },
  },
  {
    id: "api-v4-section-sync",
    label: "HTTP V4 occupation sync → new_wachtrij_sync",
    description: "POST v4 …/occupation met data.bikes.",
    writeMethods: ["v4 occupationAndSync"],
    act: async (ctx) => {
      const res = await fmsHttp(
        ctx,
        "POST",
        v4LocationPath(ctx, `/sections/${ctx.sectionID}/occupation`),
        {
          data: {
            transactiondate: ctx.baseTime.toISOString(),
            bikes: [{ idcode: ctx.pass("sync"), idtype: 0, transactiondate: ctx.baseTime.toISOString() }],
          },
        },
      );
      if (!res.ok) throw new Error(`occupation sync failed: ${JSON.stringify(res.body)}`);
    },
    assert: async (ctx) => {
      const row = await prisma.new_wachtrij_sync.findFirst({
        where: { bikeparkID: ctx.bikeparkID, transactionDate: { gte: ctx.baseTime } },
        orderBy: { ID: "desc" },
      });
      return [
        {
          label: "new_wachtrij_sync row",
          ok: !!row,
          expected: "sync row after baseTime",
          actual: row ? `id=${row.ID}` : "geen rij",
        },
      ];
    },
    teardown: async (ctx) => {
      await prisma.new_wachtrij_sync.deleteMany({
        where: { bikeparkID: ctx.bikeparkID, transactionDate: { gte: ctx.baseTime } },
      });
    },
  },
  {
    id: "api-v4-location-subscription",
    label: "HTTP V4 location subscription → abonnementen",
    description: "POST v4 …/subscriptions.",
    writeMethods: ["v4 addSubscription"],
    act: async (ctx) => {
      const res = await fmsHttp(ctx, "POST", v4LocationPath(ctx, "/subscriptions"), {
        subscription: {
          subscriptiontypeid: ctx.subscriptionTypeID,
          idcode: ctx.pass("sub"),
          idtype: 0,
          startdate: ctx.baseTime.toISOString(),
          cost: 0,
        },
      });
      if (!res.ok || Number(res.body.status) !== 1) {
        throw new Error(`addSubscription failed: ${JSON.stringify(res.body)}`);
      }
      ctx.createdSubscriptionID = Number(res.body.subscriptionid ?? res.body.id);
    },
    assert: async (ctx) => {
      const row = ctx.createdSubscriptionID
        ? await prisma.abonnementen.findFirst({ where: { ID: ctx.createdSubscriptionID } })
        : null;
      return [
        {
          label: "abonnementen row",
          ok: !!row,
          expected: `subscription id=${ctx.createdSubscriptionID}`,
          actual: row ? `id=${row.ID}` : "geen rij",
        },
      ];
    },
    teardown: async (ctx) => {
      if (ctx.createdSubscriptionID) {
        await prisma.financialtransactions.deleteMany({ where: { subscriptionID: ctx.createdSubscriptionID } });
        await prisma.abonnementen.delete({ where: { ID: ctx.createdSubscriptionID } }).catch(() => undefined);
      }
      await prisma.accounts_pasids.deleteMany({ where: { PasID: { startsWith: ctx.passPrefix } } });
    },
  },
  {
    id: "api-v4-subscribe",
    label: "HTTP V4 subscribe → abonnement koppelen",
    description: "Maakt abonnement aan zonder pas, koppelt daarna via POST …/subscriptions/{id}.",
    writeMethods: ["v4 addSubscription", "v4 subscribe"],
    act: async (ctx) => {
      const create = await fmsHttp(ctx, "POST", v4LocationPath(ctx, "/subscriptions"), {
        subscription: {
          subscriptiontypeid: ctx.subscriptionTypeID,
          startdate: ctx.baseTime.toISOString(),
          cost: 0,
        },
      });
      if (!create.ok || Number(create.body.status) !== 1) {
        throw new Error(`addSubscription failed: ${JSON.stringify(create.body)}`);
      }
      ctx.createdSubscriptionID = Number(create.body.subscriptionid ?? create.body.id);
      const sub = await fmsHttp(
        ctx,
        "POST",
        v4LocationPath(ctx, `/subscriptions/${ctx.createdSubscriptionID}`),
        { idcode: ctx.pass("link"), idtype: 0 }
      );
      if (!sub.ok || Number(sub.body.status) !== 1) {
        throw new Error(`subscribe failed: ${JSON.stringify(sub.body)}`);
      }
    },
    assert: async (ctx) => {
      const row = ctx.createdSubscriptionID
        ? await prisma.abonnementen.findFirst({
            where: { ID: ctx.createdSubscriptionID },
            select: { bikepassID: true },
          })
        : null;
      const pas = await prisma.accounts_pasids.findFirst({ where: { PasID: ctx.pass("link") } });
      return [
        {
          label: "abonnement heeft bikepass",
          ok: !!row?.bikepassID,
          expected: "bikepassID gezet",
          actual: row?.bikepassID ?? "null",
        },
        {
          label: "accounts_pasids row",
          ok: !!pas,
          expected: ctx.pass("link"),
          actual: pas ? pas.PasID : "geen pas",
        },
      ];
    },
    teardown: async (ctx) => {
      if (ctx.createdSubscriptionID) {
        const sub = await prisma.abonnementen.findFirst({
          where: { ID: ctx.createdSubscriptionID },
          select: { AccountID: true },
        });
        await prisma.abonnementen.update({
          where: { ID: ctx.createdSubscriptionID },
          data: { bikepassID: null },
        }).catch(() => undefined);
        await prisma.financialtransactions.deleteMany({ where: { subscriptionID: ctx.createdSubscriptionID } });
        await prisma.abonnementen.delete({ where: { ID: ctx.createdSubscriptionID } }).catch(() => undefined);
        if (sub?.AccountID) {
          await prisma.accounts.deleteMany({
            where: { ID: sub.AccountID, account_type: "SYSTEM" },
          }).catch(() => undefined);
        }
      }
      await prisma.accounts_pasids.deleteMany({ where: { PasID: { startsWith: ctx.passPrefix } } });
    },
  },
  {
    id: "api-v4-locker-writes-gone",
    label: "HTTP V4 locker writes → 410",
    description: "PUT/POST v4 plek (updatePlace), logs en actions moeten 410 geven — fietskluizen zijn uit v4.",
    writeMethods: ["v4 410"],
    act: async (ctx) => {
      const placePath = v4LockerPlacePath({ ...ctx, lockerPlaceID: ctx.lockerPlaceID || "1" });
      const updatePlace = await fmsHttp(ctx, "PUT", placePath, { properties: { name: "gone" } });
      const logs = await fmsHttp(ctx, "POST", `${placePath}/logs`, { properties: { type: "info" } });
      const actions = await fmsHttp(ctx, "POST", `${placePath}/actions`, { properties: { action: "test" } });
      ctx.lockerGoneStatus = {
        updatePlace: updatePlace.status,
        logs: logs.status,
        actions: actions.status,
      };
    },
    assert: async (ctx) => [
      {
        label: "updatePlace 410",
        ok: ctx.lockerGoneStatus?.updatePlace === 410,
        expected: "410",
        actual: String(ctx.lockerGoneStatus?.updatePlace ?? "?"),
      },
      {
        label: "place logs 410",
        ok: ctx.lockerGoneStatus?.logs === 410,
        expected: "410",
        actual: String(ctx.lockerGoneStatus?.logs ?? "?"),
      },
      {
        label: "place actions 410",
        ok: ctx.lockerGoneStatus?.actions === 410,
        expected: "410",
        actual: String(ctx.lockerGoneStatus?.actions ?? "?"),
      },
    ],
    teardown: async () => undefined,
  },
  {
    id: "api-v4-managedtransactions",
    label: "HTTP V4 managedtransaction → transacties",
    description: "POST v4 sector managedtransaction, processQueues, controleer transacties upsert.",
    writeMethods: ["v4 managedtransactions"],
    act: async (ctx) => {
      const res = await fmsHttp(
        ctx,
        "POST",
        `/api/fms/v4/citycodes/${ctx.citycode}/locations/${ctx.bikeparkID}/sections/${ctx.sectionID}/managedtransactions`,
        {
          managedtransaction: {
            externaltransactionid: `WTEST_API_${ctx.runId}_mt`,
            idcode: ctx.pass("mt"),
            idtype: 0,
            checkindate: ctx.baseTime.toISOString(),
            checkintype: "user",
            sectionid: ctx.sectionID,
          },
        }
      );
      if (!res.ok || Number(res.body.status) !== 1) {
        throw new Error(`V4 managedtransaction failed: ${JSON.stringify(res.body)}`);
      }
      await processQueues();
    },
    assert: async (ctx) => {
      const extId = `WTEST_API_${ctx.runId}_mt`;
      const queue = await prisma.new_wachtrij_managed_transacties.findFirst({
        where: { externalTransactionID: extId },
        orderBy: { ID: "desc" },
      });
      const tx = await prisma.transacties.findFirst({
        where: { ExternalTransactionID: extId },
      });
      return [
        {
          label: "new_wachtrij_managed_transacties processed",
          ok: queue?.processed === 1,
          expected: "processed=1",
          actual: queue ? `processed=${queue.processed}` : "geen rij",
        },
        {
          label: "transacties upsert",
          ok: !!tx && tx.PasID === ctx.pass("mt"),
          expected: ctx.pass("mt"),
          actual: tx ? `PasID=${tx.PasID}` : "geen rij",
        },
      ];
    },
    teardown: async (ctx) => {
      const extId = `WTEST_API_${ctx.runId}_mt`;
      await prisma.transacties.deleteMany({ where: { ExternalTransactionID: extId } });
      await prisma.new_wachtrij_managed_transacties.deleteMany({ where: { externalTransactionID: extId } });
    },
  },
  {
    id: "api-v4-managedtransactions-batch",
    label: "HTTP V4 managedtransactions batch → transacties",
    description: "POST v4 batch (2 items), processQueues, beide ExternalTransactionID in transacties.",
    writeMethods: ["v4 managedtransactions"],
    act: async (ctx) => {
      const res = await fmsHttp(
        ctx,
        "POST",
        `/api/fms/v4/citycodes/${ctx.citycode}/locations/${ctx.bikeparkID}/sections/${ctx.sectionID}/managedtransactions`,
        {
          managedtransactions: [
            {
              externaltransactionid: `WTEST_API_${ctx.runId}_mtb1`,
              idcode: ctx.pass("mtb1"),
              idtype: 0,
              checkindate: ctx.baseTime.toISOString(),
              checkintype: "user",
              sectionid: ctx.sectionID,
            },
            {
              externaltransactionid: `WTEST_API_${ctx.runId}_mtb2`,
              idcode: ctx.pass("mtb2"),
              idtype: 0,
              checkindate: ctx.baseTime.toISOString(),
              checkintype: "user",
              sectionid: ctx.sectionID,
            },
          ],
        }
      );
      if (!res.ok || Number(res.body.status) !== 1) {
        throw new Error(`V4 managedtransactions batch failed: ${JSON.stringify(res.body)}`);
      }
      await processQueues();
    },
    assert: async (ctx) => {
      const ids = [`WTEST_API_${ctx.runId}_mtb1`, `WTEST_API_${ctx.runId}_mtb2`];
      const rows = await prisma.transacties.findMany({
        where: { ExternalTransactionID: { in: ids } },
      });
      return [
        {
          label: "batch transacties",
          ok: rows.length === 2,
          expected: "2 rijen",
          actual: `${rows.length} rijen`,
        },
      ];
    },
    teardown: async (ctx) => {
      const ids = [`WTEST_API_${ctx.runId}_mtb1`, `WTEST_API_${ctx.runId}_mtb2`];
      await prisma.transacties.deleteMany({ where: { ExternalTransactionID: { in: ids } } });
      await prisma.new_wachtrij_managed_transacties.deleteMany({
        where: { externalTransactionID: { in: ids } },
      });
    },
  },
  {
    id: "api-v4-section-occupation",
    label: "HTTP V4 occupation → bezettingsdata",
    description: "POST v4 occupation, Lumiguide-rollup naar bezettingsdata.",
    writeMethods: ["v4 occupationAndSync"],
    act: async (ctx) => {
      const res = await fmsHttp(
        ctx,
        "POST",
        `/api/fms/v4/citycodes/${ctx.citycode}/locations/${ctx.bikeparkID}/sections/${ctx.sectionID}/occupation`,
        {
          data: {
            transactiondate: ctx.baseTime.toISOString(),
            occupation: 7,
            checkins: 0,
            checkouts: 0,
            intervalinminutes: 15,
            source: `WTEST_${ctx.runId}`,
          },
        }
      );
      if (!res.ok || Number(res.body.status) !== 1) {
        throw new Error(`V4 occupation failed: ${JSON.stringify(res.body)}`);
      }
      await processLumiguidePath([ctx.bikeparkID]);
    },
    assert: async (ctx) => {
      const row = await prisma.bezettingsdata.findFirst({
        where: { bikeparkID: ctx.bikeparkID, sectionID: ctx.sectionID, source: `WTEST_${ctx.runId}` },
        orderBy: { ID: "desc" },
      });
      return [
        {
          label: "bezettingsdata row",
          ok: !!row && row.occupation === 7,
          expected: "occupation=7",
          actual: row ? `occupation=${row.occupation}` : "geen rij",
        },
      ];
    },
    teardown: async (ctx) => {
      await prisma.bezettingsdata.deleteMany({
        where: { bikeparkID: ctx.bikeparkID, source: `WTEST_${ctx.runId}` },
      });
      await prisma.new_bezettingsdata_tmp.deleteMany({
        where: { bikeparkID: ctx.bikeparkID, source: `WTEST_${ctx.runId}` },
      });
    },
  },
  {
    id: "api-v4-legacy-transactions-gone",
    label: "HTTP V4 legacy transactions → 410",
    description: "POST v4 …/transactions en …/completedtransactions moeten 410 geven.",
    writeMethods: ["v4 410"],
    act: async (ctx) => {
      const tx = await fmsHttp(
        ctx,
        "POST",
        `/api/fms/v4/citycodes/${ctx.citycode}/locations/${ctx.bikeparkID}/sections/${ctx.sectionID}/transactions`,
        { transaction: { idcode: ctx.pass("gone"), type: "in" } }
      );
      const completed = await fmsHttp(
        ctx,
        "POST",
        `/api/fms/v4/citycodes/${ctx.citycode}/locations/${ctx.bikeparkID}/completedtransactions`,
        { completedtransaction: { idcode: ctx.pass("gone") } }
      );
      ctx.legacyGoneStatus = { transactions: tx.status, completed: completed.status };
    },
    assert: async (ctx) => [
      {
        label: "section transactions 410",
        ok: ctx.legacyGoneStatus?.transactions === 410,
        expected: "410",
        actual: String(ctx.legacyGoneStatus?.transactions ?? "?"),
      },
      {
        label: "completedtransactions 410",
        ok: ctx.legacyGoneStatus?.completed === 410,
        expected: "410",
        actual: String(ctx.legacyGoneStatus?.completed ?? "?"),
      },
    ],
    teardown: async () => undefined,
  },
];

export function getApiWriteScenarioById(id: string): ApiWriteScenario | undefined {
  return API_WRITE_SCENARIOS.find((s) => s.id === id);
}
