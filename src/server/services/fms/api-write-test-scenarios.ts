/**
 * Tier B — HTTP ingress write tests.
 * Calls real /api/fms/v2 and /api/fms/v3 routes; asserts queue rows or direct DB effects on testgemeente.
 */

import { prisma } from "~/server/db";
import { assertLockerPlaceConfigured } from "./testgemeente-locker-place";

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

function assertHttpOk(label: string, res: FmsHttpResult): AssertionResult {
  const status = Number(res.body.status ?? (res.ok ? 1 : 0));
  return {
    label,
    ok: res.ok && status === 1,
    expected: "HTTP 200, status=1",
    actual: `HTTP ${res.status}, status=${String(res.body.status ?? "?")}, message=${String(res.body.message ?? "")}`,
  };
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
    id: "api-v2-saveJsonBike",
    label: "HTTP saveJsonBike → new_wachtrij_pasids",
    description: "POST /api/fms/v2/saveJsonBike/{bikepark}?target=new en controleer wachtrijrij.",
    writeMethods: ["v2 saveJsonBike"],
    act: async (ctx) => {
      const res = await fmsHttp(
        ctx,
        "POST",
        `/api/fms/v2/saveJsonBike/${ctx.bikeparkID}`,
        { barcode: `BC_${ctx.runId}`, passID: ctx.pass("bike"), biketypeID: 1 },
        { target: "new" }
      );
      if (!res.ok) throw new Error(`saveJsonBike failed: ${JSON.stringify(res.body)}`);
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
    id: "api-v2-uploadJsonTransaction",
    label: "HTTP uploadJsonTransaction → new_wachtrij_transacties",
    description: "POST check-in via HTTP met target=new.",
    writeMethods: ["v2 uploadJsonTransaction"],
    act: async (ctx) => {
      const res = await fmsHttp(
        ctx,
        "POST",
        `/api/fms/v2/uploadJsonTransaction/${ctx.bikeparkID}/${ctx.sectionID}`,
        {
          type: "in",
          transactionDate: ctx.baseTime.toISOString(),
          passID: ctx.pass("tx"),
          idtype: 0,
        },
        { target: "new" }
      );
      if (!res.ok) throw new Error(`uploadJsonTransaction failed: ${JSON.stringify(res.body)}`);
    },
    assert: async (ctx) => {
      const row = await prisma.new_wachtrij_transacties.findFirst({
        where: { passID: ctx.pass("tx") },
        orderBy: { ID: "desc" },
      });
      return [
        {
          label: "new_wachtrij_transacties row",
          ok: !!row,
          expected: `passID=${ctx.pass("tx")}`,
          actual: row ? `id=${row.ID}` : "geen rij",
        },
      ];
    },
    teardown: async (ctx) => {
      await prisma.new_wachtrij_transacties.deleteMany({ where: { passID: { startsWith: ctx.passPrefix } } });
    },
  },
  {
    id: "api-v2-addJsonSaldo",
    label: "HTTP addJsonSaldo → new_wachtrij_betalingen",
    description: "POST saldo-opwaardering via HTTP met target=new.",
    writeMethods: ["v2 addJsonSaldo"],
    act: async (ctx) => {
      const res = await fmsHttp(
        ctx,
        "POST",
        `/api/fms/v2/addJsonSaldo/${ctx.bikeparkID}`,
        {
          passID: ctx.pass("saldo"),
          transactionDate: ctx.baseTime.toISOString(),
          paymentTypeID: 1,
          amount: 5,
        },
        { target: "new" }
      );
      if (!res.ok) throw new Error(`addJsonSaldo failed: ${JSON.stringify(res.body)}`);
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
    id: "api-v2-syncSector",
    label: "HTTP syncSector → new_wachtrij_sync",
    description: "POST sector-sync via HTTP met target=new.",
    writeMethods: ["v2 syncSector"],
    act: async (ctx) => {
      const res = await fmsHttp(
        ctx,
        "POST",
        `/api/fms/v2/syncSector/${ctx.bikeparkID}/${ctx.sectionID}`,
        {
          transactionDate: ctx.baseTime.toISOString(),
          bikes: [{ idcode: ctx.pass("sync"), idtype: 0, transactiondate: ctx.baseTime.toISOString() }],
        },
        { target: "new" }
      );
      if (!res.ok) throw new Error(`syncSector failed: ${JSON.stringify(res.body)}`);
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
    id: "api-v2-addSubscription",
    label: "HTTP addSubscription → abonnementen",
    description: "POST abonnement op testgemeente stalling.",
    writeMethods: ["v2 addSubscription"],
    act: async (ctx) => {
      const res = await fmsHttp(ctx, "POST", `/api/fms/v2/addSubscription/${ctx.bikeparkID}`, {
        subscriptiontypeID: ctx.subscriptionTypeID,
        passID: ctx.pass("sub"),
        amount: 0,
        paymentTypeID: 1,
        transactionDate: ctx.baseTime.toISOString(),
      });
      if (!res.ok || Number(res.body.status) !== 1) {
        throw new Error(`addSubscription failed: ${JSON.stringify(res.body)}`);
      }
      ctx.createdSubscriptionID = Number(res.body.id);
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
    id: "api-v2-subscribe",
    label: "HTTP subscribe → abonnement koppelen",
    description: "Maakt abonnement aan zonder pas, koppelt daarna via subscribe.",
    writeMethods: ["v2 addSubscription", "v2 subscribe"],
    act: async (ctx) => {
      const create = await fmsHttp(ctx, "POST", `/api/fms/v2/addSubscription/${ctx.bikeparkID}`, {
        subscriptiontypeID: ctx.subscriptionTypeID,
        amount: 0,
        paymentTypeID: 1,
        transactionDate: ctx.baseTime.toISOString(),
      });
      if (!create.ok || Number(create.body.status) !== 1) {
        throw new Error(`addSubscription failed: ${JSON.stringify(create.body)}`);
      }
      ctx.createdSubscriptionID = Number(create.body.id);
      const sub = await fmsHttp(ctx, "POST", `/api/fms/v2/subscribe/${ctx.bikeparkID}`, {
        subscriptionID: ctx.createdSubscriptionID,
        passID: ctx.pass("link"),
      });
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
    id: "api-v2-reportOccupationData",
    label: "HTTP reportOccupationData → bezettingsdata_tmp",
    description: "POST bezettingsdata voor testgemeente sectie.",
    writeMethods: ["v2 reportOccupationData"],
    act: async (ctx) => {
      const res = await fmsHttp(
        ctx,
        "POST",
        `/api/fms/v2/reportOccupationData/${ctx.bikeparkID}/${ctx.sectionID}`,
        { occupation: 42, timestamp: ctx.baseTime.toISOString(), source: `WTEST_${ctx.runId}` }
      );
      if (!res.ok || Number(res.body.status) !== 1) {
        throw new Error(`reportOccupationData failed: ${JSON.stringify(res.body)}`);
      }
      ctx.createdBezettingTmpId = Number(res.body.id);
    },
    assert: async (ctx) => {
      const row = ctx.createdBezettingTmpId
        ? await prisma.bezettingsdata_tmp.findFirst({ where: { ID: ctx.createdBezettingTmpId } })
        : null;
      return [
        {
          label: "bezettingsdata_tmp row",
          ok: !!row && row.occupation === 42,
          expected: "occupation=42",
          actual: row ? `occupation=${row.occupation}` : "geen rij",
        },
      ];
    },
    teardown: async (ctx) => {
      if (ctx.createdBezettingTmpId) {
        await prisma.bezettingsdata_tmp.delete({ where: { ID: ctx.createdBezettingTmpId } }).catch(() => undefined);
      }
    },
  },
  {
    id: "api-v2-updateLocker",
    label: "HTTP updateLocker (9933_003 fietskluizen)",
    description: "POST kluisstatus via V2 op fietskluizen-stalling.",
    writeMethods: ["v2 updateLocker"],
    act: async (ctx) => {
      assertLockerPlaceConfigured(ctx.lockerPlaceID);
      const res = await fmsHttp(
        ctx,
        "POST",
        `/api/fms/v2/updateLocker/${ctx.lockerBikeparkID}/${ctx.lockerSectionID}/${ctx.lockerPlaceID}`,
        { statuscode: 0, transactionDate: ctx.baseTime.toISOString(), typeCheck: "user" }
      );
      if (!res.ok) throw new Error(`updateLocker failed: ${JSON.stringify(res.body)}`);
    },
    assert: async (ctx) => {
      const res = await fmsHttp(
        ctx,
        "GET",
        `/api/fms/v2/getLockerInfo/${ctx.lockerBikeparkID}/${ctx.lockerSectionID}/${ctx.lockerPlaceID}`
      );
      return [assertHttpOk("getLockerInfo after update", res)];
    },
    teardown: async () => {
      /* status reset not required for smoke test */
    },
  },
  {
    id: "api-v2-setUrlWebserviceForLocker",
    label: "HTTP setUrlWebserviceForLocker (9933_003)",
    description: "POST callback-URL op kluisplek; herstelt oude waarde na test.",
    writeMethods: ["v2 setUrlWebserviceForLocker"],
    act: async (ctx) => {
      assertLockerPlaceConfigured(ctx.lockerPlaceID);
      const place = await prisma.fietsenstalling_plek.findFirst({
        where: { id: BigInt(ctx.lockerPlaceID) },
        select: { urlwebservice: true },
      });
      ctx.previousLockerUrl = place?.urlwebservice ?? null;
      const testUrl = `https://wtest.example/${ctx.runId}`;
      const res = await fmsHttp(
        ctx,
        "POST",
        `/api/fms/v2/setUrlWebserviceForLocker/${ctx.lockerBikeparkID}/${ctx.lockerSectionID}/${ctx.lockerPlaceID}`,
        { url: testUrl }
      );
      if (!res.ok || Number(res.body.status) !== 1) {
        throw new Error(`setUrlWebserviceForLocker failed: ${JSON.stringify(res.body)}`);
      }
    },
    assert: async (ctx) => {
      const place = await prisma.fietsenstalling_plek.findFirst({
        where: { id: BigInt(ctx.lockerPlaceID) },
        select: { urlwebservice: true },
      });
      const expected = `https://wtest.example/${ctx.runId}`;
      return [
        {
          label: "urlwebservice updated",
          ok: place?.urlwebservice === expected,
          expected,
          actual: place?.urlwebservice ?? "null",
        },
      ];
    },
    teardown: async (ctx) => {
      if (ctx.lockerPlaceID) {
        await prisma.fietsenstalling_plek.update({
          where: { id: BigInt(ctx.lockerPlaceID) },
          data: { urlwebservice: ctx.previousLockerUrl },
        }).catch(() => undefined);
      }
    },
  },
  {
    id: "api-v3-section-transaction",
    label: "HTTP V3 section transaction → wachtrij_transacties",
    description: "POST V3 sector-transactie (productie-wachtrij op testgemeente).",
    writeMethods: ["v3 uploadTransaction"],
    act: async (ctx) => {
      const res = await fmsHttp(
        ctx,
        "POST",
        `/api/fms/v3/citycodes/${ctx.citycode}/locations/${ctx.bikeparkID}/sections/${ctx.sectionID}/transactions`,
        {
          transaction: {
            idcode: ctx.pass("v3tx"),
            idtype: 0,
            transactiondate: ctx.baseTime.toISOString(),
            type: "in",
            typecheck: "user",
          },
        }
      );
      if (!res.ok || Number(res.body.status) !== 1) {
        throw new Error(`V3 transaction failed: ${JSON.stringify(res.body)}`);
      }
    },
    assert: async (ctx) => {
      const row = await prisma.wachtrij_transacties.findFirst({
        where: { passID: ctx.pass("v3tx") },
        orderBy: { ID: "desc" },
      });
      return [
        {
          label: "wachtrij_transacties row",
          ok: !!row,
          expected: ctx.pass("v3tx"),
          actual: row ? `id=${row.ID}` : "geen rij",
        },
      ];
    },
    teardown: async (ctx) => {
      await prisma.wachtrij_transacties.deleteMany({ where: { passID: { startsWith: ctx.passPrefix } } });
    },
  },
  {
    id: "api-v3-section-occupation",
    label: "HTTP V3 section occupation/sync",
    description: "POST V3 occupation endpoint.",
    writeMethods: ["v3 occupationAndSync"],
    act: async (ctx) => {
      const res = await fmsHttp(
        ctx,
        "POST",
        `/api/fms/v3/citycodes/${ctx.citycode}/locations/${ctx.bikeparkID}/sections/${ctx.sectionID}/occupation`,
        {
          data: {
            transactiondate: ctx.baseTime.toISOString(),
            occupation: 3,
            checkins: 0,
            checkouts: 0,
            intervalinminutes: 15,
          },
        }
      );
      if (!res.ok || Number(res.body.status) !== 1) {
        throw new Error(`V3 occupation failed: ${JSON.stringify(res.body)}`);
      }
      ctx.createdBezettingTmpId = Number(res.body.id);
    },
    assert: async (ctx) => {
      const row = ctx.createdBezettingTmpId
        ? await prisma.bezettingsdata_tmp.findFirst({ where: { ID: ctx.createdBezettingTmpId } })
        : null;
      return [
        {
          label: "bezettingsdata_tmp row",
          ok: !!row && row.occupation === 3,
          expected: "occupation=3",
          actual: row ? `occupation=${row.occupation}` : "geen rij",
        },
      ];
    },
    teardown: async (ctx) => {
      if (ctx.createdBezettingTmpId) {
        await prisma.bezettingsdata_tmp.delete({ where: { ID: ctx.createdBezettingTmpId } }).catch(() => undefined);
      }
    },
  },
  {
    id: "api-v3-location-subscription",
    label: "HTTP V3 location subscription",
    description: "POST abonnement via V3 location endpoint.",
    writeMethods: ["v3 addSubscription"],
    act: async (ctx) => {
      const res = await fmsHttp(
        ctx,
        "POST",
        `/api/fms/v3/citycodes/${ctx.citycode}/locations/${ctx.bikeparkID}/subscriptions`,
        {
          subscription: {
            subscriptiontypeid: ctx.subscriptionTypeID,
            idcode: ctx.pass("v3sub"),
            idtype: 0,
            startdate: ctx.baseTime.toISOString(),
            cost: 0,
          },
        }
      );
      if (!res.ok || Number(res.body.status) !== 1) {
        throw new Error(`V3 subscription failed: ${JSON.stringify(res.body)}`);
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
          expected: String(ctx.createdSubscriptionID),
          actual: row ? String(row.ID) : "geen rij",
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
    id: "api-v3-updatePlace",
    label: "HTTP V3 updatePlace (fietskluizen)",
    description: "PUT plek-eigenschappen op 9933_003.",
    writeMethods: ["v3 updatePlace"],
    act: async (ctx) => {
      assertLockerPlaceConfigured(ctx.lockerPlaceID);
      const res = await fmsHttp(
        ctx,
        "PUT",
        `/api/fms/v3/citycodes/${ctx.citycode}/locations/${ctx.lockerBikeparkID}/sections/${ctx.lockerSectionID}/places/${ctx.lockerPlaceID}`,
        { properties: { name: `WTEST_${ctx.runId}` } }
      );
      if (!res.ok || Number(res.body.status) !== 1) {
        throw new Error(`updatePlace failed: ${JSON.stringify(res.body)}`);
      }
    },
    assert: async (ctx) => {
      const place = await prisma.fietsenstalling_plek.findFirst({
        where: { id: BigInt(ctx.lockerPlaceID) },
        select: { titel: true },
      });
      return [
        {
          label: "plek titel",
          ok: place?.titel === `WTEST_${ctx.runId}`,
          expected: `WTEST_${ctx.runId}`,
          actual: place?.titel ?? "null",
        },
      ];
    },
    teardown: async (ctx) => {
      if (ctx.lockerPlaceID) {
        await prisma.fietsenstalling_plek.update({
          where: { id: BigInt(ctx.lockerPlaceID) },
          data: { titel: null },
        }).catch(() => undefined);
      }
    },
  },
  {
    id: "api-v3-place-log",
    label: "HTTP V3 place log (fietskluizen)",
    description: "POST …/places/{id}/logs.",
    writeMethods: ["v3 log"],
    act: async (ctx) => {
      assertLockerPlaceConfigured(ctx.lockerPlaceID);
      const res = await fmsHttp(
        ctx,
        "POST",
        `/api/fms/v3/citycodes/${ctx.citycode}/locations/${ctx.lockerBikeparkID}/sections/${ctx.lockerSectionID}/places/${ctx.lockerPlaceID}/logs`,
        {
          properties: {
            type: "info",
            description: `WTEST_${ctx.runId}`,
            timestamp: ctx.baseTime.toISOString(),
          },
        }
      );
      if (!res.ok || Number(res.body.status) !== 1) {
        throw new Error(`place log failed: ${JSON.stringify(res.body)}`);
      }
    },
    assert: async (ctx) => {
      const row = await prisma.fmsservicelog.findFirst({
        where: { StallingsID: ctx.lockerBikeparkID, Omschrijving: `WTEST_${ctx.runId}` },
        orderBy: { ID: "desc" },
      });
      return [
        {
          label: "fmsservicelog row",
          ok: !!row,
          expected: `WTEST_${ctx.runId}`,
          actual: row ? `id=${row.ID}` : "geen rij",
        },
      ];
    },
    teardown: async (ctx) => {
      await prisma.fmsservicelog.deleteMany({
        where: { Omschrijving: { startsWith: "WTEST_" }, StallingsID: ctx.lockerBikeparkID },
      });
    },
  },
  {
    id: "api-v3-place-action",
    label: "HTTP V3 place action (fietskluizen)",
    description: "POST …/places/{id}/actions.",
    writeMethods: ["v3 action"],
    act: async (ctx) => {
      assertLockerPlaceConfigured(ctx.lockerPlaceID);
      const res = await fmsHttp(
        ctx,
        "POST",
        `/api/fms/v3/citycodes/${ctx.citycode}/locations/${ctx.lockerBikeparkID}/sections/${ctx.lockerSectionID}/places/${ctx.lockerPlaceID}/actions`,
        {
          properties: {
            action: "test",
            type: "info",
            description: `WTEST_ACT_${ctx.runId}`,
            timestamp: ctx.baseTime.toISOString(),
          },
        }
      );
      if (!res.ok || Number(res.body.status) !== 1) {
        throw new Error(`place action failed: ${JSON.stringify(res.body)}`);
      }
    },
    assert: async (ctx) => {
      const row = await prisma.fmsservicelog.findFirst({
        where: { StallingsID: ctx.lockerBikeparkID, Omschrijving: `WTEST_ACT_${ctx.runId}` },
        orderBy: { ID: "desc" },
      });
      return [
        {
          label: "fmsservicelog action row",
          ok: !!row,
          expected: `WTEST_ACT_${ctx.runId}`,
          actual: row ? `id=${row.ID}` : "geen rij",
        },
      ];
    },
    teardown: async (ctx) => {
      await prisma.fmsservicelog.deleteMany({
        where: { Omschrijving: { startsWith: "WTEST_ACT_" }, StallingsID: ctx.lockerBikeparkID },
      });
    },
  },
];

export function getApiWriteScenarioById(id: string): ApiWriteScenario | undefined {
  return API_WRITE_SCENARIOS.find((s) => s.id === id);
}
