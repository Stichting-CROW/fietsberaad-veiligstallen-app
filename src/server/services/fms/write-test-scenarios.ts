/**
 * Write-side test scenarios (Tier A — behavioral golden tests).
 *
 * Each scenario seeds a deterministic start state, performs an FMS write through the
 * shadow input queues (new_wachtrij_*) via the wachtrij service with `useNewTables: true`,
 * runs the Next.js queue processor (processQueues), and asserts the resulting state in the
 * shadow output tables (new_transacties / new_accounts / new_accounts_pasids / ...).
 *
 * SCOPE & SAFETY
 * - All writes target the shadow new_* tables only — production tables are never touched.
 * - All synthetic passIDs are namespaced `WTEST_<runId>_<suffix>`, so seed/teardown can
 *   delete exactly this run's rows by prefix without affecting any other new_* data.
 * - The runner additionally guards that the chosen bikepark belongs to the testgemeente
 *   organization (assertTestgemeenteScope) before any write happens.
 *
 * COVERAGE NOTE
 * Only the v2 write methods that route through wachtrij-service honour the new_* target
 * (saveJsonBike, uploadJsonTransaction, addJsonSaldo, syncSector). The v3 write service and
 * the remaining v2 writes (addSubscription/subscribe/updateLocker/reportOccupationData) write
 * straight to production and ignore the target flag, so they cannot be Tier-A tested until a
 * new_*-aware path is added — see TODO in this file's accompanying runner.
 *
 * Assertions deliberately avoid `fietsenstalling_sectie.Bezetting` and `fietsenstalling_plek.status`,
 * which are not yet ported for the new_* path (parity prerequisites p1/p4).
 */

import { prisma } from "~/server/db";
import {
  addBikeToWachtrij,
  addSaldoToWachtrij,
  addSyncToWachtrij,
  addTransactionToWachtrij,
} from "./wachtrij-service";

/** Prefix for all synthetic passIDs created by the write tests. */
export const SYNTHETIC_PREFIX = "WTEST_";

/** Queue processor success marker (processor.ts PROCESSED.SUCCESS). */
const PROCESSED_SUCCESS = 1;

export type WriteTestContext = {
  /** testgemeente fietsenstalling StallingsID used as the FMS bikeparkID. */
  bikeparkID: string;
  /** Section external id (`${bikeparkID}_1`). */
  sectionID: string;
  /** testgemeente organization contact ID (SiteID). */
  siteID: string;
  /** Unique id for this run, embedded in every synthetic passID. */
  runId: string;
  /** Common prefix of every synthetic passID in this run (`WTEST_<runId>_`). */
  passPrefix: string;
  /** Builds a run-unique synthetic passID for the given suffix. */
  pass: (suffix: string) => string;
  /** Base timestamp (slightly in the past so `transactionDate <= NOW()` holds). */
  baseTime: Date;
};

export type AssertionResult = {
  label: string;
  ok: boolean;
  expected: string;
  actual: string;
};

export type Assertion = (ctx: WriteTestContext) => Promise<AssertionResult>;

export type WriteScenario = {
  id: string;
  label: string;
  description: string;
  /** FMS write methods exercised (for display only). */
  writeMethods: string[];
  /** Optional deterministic seed run before `act`. */
  seed?: (ctx: WriteTestContext) => Promise<void>;
  /** Performs the write(s) under test (always with `useNewTables: true`). */
  act: (ctx: WriteTestContext) => Promise<void>;
  /** Number of processQueues() runs after acting (default 1). */
  processRuns?: number;
  /** Golden-state assertions evaluated after processing. */
  assert: Assertion[];
};

// ---------------------------------------------------------------------------
// Assertion helpers
// ---------------------------------------------------------------------------

type WachtrijQueueWithPassID = "pasids" | "transacties" | "betalingen";

async function countQueue(
  queue: WachtrijQueueWithPassID,
  where: { passID: { startsWith: string }; processed?: number }
): Promise<number> {
  switch (queue) {
    case "pasids":
      return prisma.new_wachtrij_pasids.count({ where });
    case "transacties":
      return prisma.new_wachtrij_transacties.count({ where });
    case "betalingen":
      return prisma.new_wachtrij_betalingen.count({ where });
  }
}

/** Every synthetic row in the given input queue must have been processed successfully. */
function expectQueueProcessed(queue: WachtrijQueueWithPassID): Assertion {
  return async (ctx) => {
    const total = await countQueue(queue, { passID: { startsWith: ctx.passPrefix } });
    const done = await countQueue(queue, {
      passID: { startsWith: ctx.passPrefix },
      processed: PROCESSED_SUCCESS,
    });
    return {
      label: `new_wachtrij_${queue}: alle rijen verwerkt`,
      ok: total > 0 && done === total,
      expected: "alle (>0) synthetische rijen processed=1",
      actual: `${done}/${total} verwerkt`,
    };
  };
}

/** The sync input queue row inserted this run must have been processed successfully. */
function expectSyncProcessed(): Assertion {
  return async (ctx) => {
    const total = await prisma.new_wachtrij_sync.count({
      where: { bikeparkID: ctx.bikeparkID, transactionDate: { gte: ctx.baseTime } },
    });
    const done = await prisma.new_wachtrij_sync.count({
      where: {
        bikeparkID: ctx.bikeparkID,
        transactionDate: { gte: ctx.baseTime },
        processed: PROCESSED_SUCCESS,
      },
    });
    return {
      label: "new_wachtrij_sync: rij verwerkt",
      ok: total > 0 && done === total,
      expected: "alle (>0) sync-rijen processed=1",
      actual: `${done}/${total} verwerkt`,
    };
  };
}

/** Exactly one open (Date_checkout null) new_transacties row for the synthetic pass. */
function expectOpenTransactie(passSuffix: string): Assertion {
  return async (ctx) => {
    const passID = ctx.pass(passSuffix);
    const open = await prisma.new_transacties.count({
      where: { PasID: passID, Date_checkout: null },
    });
    return {
      label: `Open transactie voor ${passSuffix}`,
      ok: open === 1,
      expected: "1 open transactie (Date_checkout = null)",
      actual: `${open} open transactie(s)`,
    };
  };
}

/** At least one closed (Date_checkout set) new_transacties row for the synthetic pass and no open ones. */
function expectClosedTransactie(passSuffix: string): Assertion {
  return async (ctx) => {
    const passID = ctx.pass(passSuffix);
    const closed = await prisma.new_transacties.count({
      where: { PasID: passID, Date_checkout: { not: null } },
    });
    const open = await prisma.new_transacties.count({
      where: { PasID: passID, Date_checkout: null },
    });
    return {
      label: `Afgesloten transactie voor ${passSuffix}`,
      ok: closed >= 1 && open === 0,
      expected: "≥1 afgesloten transactie en 0 open",
      actual: `${closed} afgesloten, ${open} open`,
    };
  };
}

/** Total new_transacties rows for the synthetic pass equals `expected`. */
function expectTransactieCount(passSuffix: string, expected: number): Assertion {
  return async (ctx) => {
    const passID = ctx.pass(passSuffix);
    const count = await prisma.new_transacties.count({ where: { PasID: passID } });
    return {
      label: `Aantal transacties voor ${passSuffix}`,
      ok: count === expected,
      expected: `${expected} transactie(s)`,
      actual: `${count} transactie(s)`,
    };
  };
}

async function saldoForPass(passID: string): Promise<number | null> {
  const pasid = await prisma.new_accounts_pasids.findFirst({
    where: { PasID: passID },
    select: { AccountID: true },
  });
  if (!pasid?.AccountID) return null;
  const acc = await prisma.new_accounts.findUnique({
    where: { ID: pasid.AccountID },
    select: { saldo: true },
  });
  return acc ? Number(acc.saldo ?? 0) : null;
}

/** Account saldo for the synthetic pass equals `expected` (within a small epsilon). */
function expectSaldo(passSuffix: string, expected: number): Assertion {
  return async (ctx) => {
    const passID = ctx.pass(passSuffix);
    const saldo = await saldoForPass(passID);
    const ok = saldo != null && Math.abs(saldo - expected) < 0.005;
    return {
      label: `Saldo voor ${passSuffix}`,
      ok,
      expected: `${expected.toFixed(2)}`,
      actual: saldo == null ? "geen account" : saldo.toFixed(2),
    };
  };
}

/** The bikepass row exists for the synthetic pass and its barcodeFiets equals the resolved barcode. */
function expectPasidBarcode(passSuffix: string, barcode: (ctx: WriteTestContext) => string): Assertion {
  return async (ctx) => {
    const passID = ctx.pass(passSuffix);
    const expected = barcode(ctx);
    const pasid = await prisma.new_accounts_pasids.findFirst({
      where: { PasID: passID },
      select: { barcodeFiets: true },
    });
    return {
      label: `Pas/barcode voor ${passSuffix}`,
      ok: pasid != null && pasid.barcodeFiets === expected,
      expected: `bikepass met barcodeFiets='${expected}'`,
      actual: pasid == null ? "geen bikepass" : `barcodeFiets='${pasid.barcodeFiets ?? ""}'`,
    };
  };
}

/** Barcode used by the save-bike scenario (run-unique). */
const bikeBarcode = (ctx: WriteTestContext): string => "BC-" + ctx.runId;

// ---------------------------------------------------------------------------
// Scenario registry (first batch)
// ---------------------------------------------------------------------------

const NEW_TARGET = { useNewTables: true } as const;

export const WRITE_SCENARIOS: WriteScenario[] = [
  {
    id: "save-bike",
    label: "Fiets/pas registreren (saveJsonBike)",
    description:
      "Voegt een pas met barcode toe via de pasids-wachtrij en controleert dat na verwerking de bikepass bestaat met de juiste barcode.",
    writeMethods: ["v2 saveJsonBike"],
    act: async (ctx) => {
      await addBikeToWachtrij(
        ctx.bikeparkID,
        { barcode: bikeBarcode(ctx), passID: ctx.pass("bike"), biketypeID: 1 },
        NEW_TARGET
      );
    },
    assert: [expectQueueProcessed("pasids"), expectPasidBarcode("bike", bikeBarcode)],
  },
  {
    id: "checkin",
    label: "Check-in (uploadJsonTransaction In)",
    description:
      "Boekt een check-in via de transacties-wachtrij en controleert dat er precies één open transactie ontstaat.",
    writeMethods: ["v2 uploadJsonTransaction"],
    act: async (ctx) => {
      await addTransactionToWachtrij(
        ctx.bikeparkID,
        ctx.sectionID,
        {
          type: "in",
          transactionDate: ctx.baseTime.toISOString(),
          passID: ctx.pass("ci"),
          idtype: 0,
        },
        undefined,
        undefined,
        undefined,
        NEW_TARGET
      );
    },
    assert: [expectQueueProcessed("transacties"), expectOpenTransactie("ci")],
  },
  {
    id: "checkin-checkout",
    label: "Check-in + check-out (uploadJsonTransaction In/Out)",
    description:
      "Boekt een check-in gevolgd door een check-out voor dezelfde pas en controleert dat de transactie wordt afgesloten (Date_checkout gezet, geen open transactie).",
    writeMethods: ["v2 uploadJsonTransaction"],
    act: async (ctx) => {
      const checkin = ctx.baseTime;
      const checkout = new Date(ctx.baseTime.getTime() + 30 * 60 * 1000);
      await addTransactionToWachtrij(
        ctx.bikeparkID,
        ctx.sectionID,
        { type: "in", transactionDate: checkin.toISOString(), passID: ctx.pass("co"), idtype: 0 },
        undefined,
        undefined,
        undefined,
        NEW_TARGET
      );
      await addTransactionToWachtrij(
        ctx.bikeparkID,
        ctx.sectionID,
        { type: "out", transactionDate: checkout.toISOString(), passID: ctx.pass("co"), idtype: 0 },
        undefined,
        undefined,
        undefined,
        NEW_TARGET
      );
    },
    assert: [
      expectQueueProcessed("transacties"),
      expectClosedTransactie("co"),
      expectTransactieCount("co", 1),
    ],
  },
  {
    id: "saldo",
    label: "Saldo opwaarderen (addJsonSaldo)",
    description:
      "Registreert eerst een pas en voegt daarna €10,00 saldo toe via de betalingen-wachtrij. Controleert dat het accountsaldo €10,00 is.",
    writeMethods: ["v2 saveJsonBike", "v2 addJsonSaldo"],
    act: async (ctx) => {
      await addBikeToWachtrij(
        ctx.bikeparkID,
        { barcode: "", passID: ctx.pass("saldo"), biketypeID: 1 },
        NEW_TARGET
      );
      await addSaldoToWachtrij(
        ctx.bikeparkID,
        {
          passID: ctx.pass("saldo"),
          transactionDate: ctx.baseTime.toISOString(),
          paymentTypeID: 1,
          amount: 10,
        },
        NEW_TARGET
      );
    },
    assert: [
      expectQueueProcessed("pasids"),
      expectQueueProcessed("betalingen"),
      expectSaldo("saldo", 10),
    ],
  },
  {
    id: "payment-at-checkin",
    label: "Betaling bij check-in (uploadJsonTransaction + betaling)",
    description:
      "Boekt een check-in met een betaling (price=5). De transactie-wachtrij voegt automatisch een betalingsrij toe. Controleert open transactie én saldo €5,00.",
    writeMethods: ["v2 uploadJsonTransaction (met betaling)"],
    act: async (ctx) => {
      await addTransactionToWachtrij(
        ctx.bikeparkID,
        ctx.sectionID,
        {
          type: "in",
          transactionDate: ctx.baseTime.toISOString(),
          passID: ctx.pass("pay"),
          idtype: 0,
          price: 5,
          amountpaid: 5,
          paymenttypeid: 1,
        },
        undefined,
        undefined,
        undefined,
        NEW_TARGET
      );
    },
    assert: [
      expectQueueProcessed("transacties"),
      expectQueueProcessed("betalingen"),
      expectOpenTransactie("pay"),
      expectSaldo("pay", 5),
    ],
  },
  {
    id: "sync",
    label: "Sector synchronisatie (syncSector)",
    description:
      "Stuurt een sync voor de sectie met één aanwezige fiets en controleert dat de sync-wachtrij verwerkt is.",
    writeMethods: ["v2 syncSector"],
    act: async (ctx) => {
      await addSyncToWachtrij(
        {
          bikeparkID: ctx.bikeparkID,
          sectionID: ctx.sectionID,
          transactionDate: ctx.baseTime.toISOString(),
          bikes: [
            {
              idcode: ctx.pass("sync"),
              idtype: 0,
              transactiondate: ctx.baseTime.toISOString(),
            },
          ],
        },
        NEW_TARGET
      );
    },
    assert: [expectSyncProcessed()],
  },
];

export function getScenarioById(id: string): WriteScenario | undefined {
  return WRITE_SCENARIOS.find((s) => s.id === id);
}
