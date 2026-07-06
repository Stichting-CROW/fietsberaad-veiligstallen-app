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
 * - Stallingskosten come from API payloads (no FMS tariff / afboeking in Next.js — see docs/nextjs-queue-processor-scope.md).
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
  /** new_wachtrij_sync IDs queued during this run (for precise assert/teardown). */
  syncQueueIds: number[];
};

export type AssertionResult = {
  label: string;
  ok: boolean;
  expected: string;
  actual: string;
};

export type Assertion = (ctx: WriteTestContext) => Promise<AssertionResult>;

export type WriteScenarioStep = {
  run: (ctx: WriteTestContext) => Promise<void>;
  /** processQueues runs after this step (default 1). */
  processRuns?: number;
};

export type WriteScenario = {
  id: string;
  label: string;
  description: string;
  /** FMS write methods exercised (for display only). */
  writeMethods: string[];
  /** Optional deterministic seed run before steps/act. */
  seed?: (ctx: WriteTestContext) => Promise<void>;
  /** Performs the write(s) under test (always with `useNewTables: true`). */
  act?: (ctx: WriteTestContext) => Promise<void>;
  /** Multi-phase flows: each step runs, then the queue processor (optional per step). */
  steps?: WriteScenarioStep[];
  /** Number of processQueues() runs after acting (default 1). Ignored when `steps` is set. */
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

/** The sync input queue rows inserted this run must have been processed successfully. */
function expectSyncProcessed(): Assertion {
  return async (ctx) => {
    if (ctx.syncQueueIds.length === 0) {
      return {
        label: "new_wachtrij_sync: rij verwerkt",
        ok: false,
        expected: "≥1 sync-rij in deze run",
        actual: "0 sync-rijen geregistreerd",
      };
    }
    const total = ctx.syncQueueIds.length;
    const done = await prisma.new_wachtrij_sync.count({
      where: { ID: { in: ctx.syncQueueIds }, processed: PROCESSED_SUCCESS },
    });
    return {
      label: "new_wachtrij_sync: rij verwerkt",
      ok: done === total,
      expected: "alle sync-rijen processed=1",
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

function minutesAfter(ctx: WriteTestContext, minutes: number): Date {
  return new Date(ctx.baseTime.getTime() + minutes * 60 * 1000);
}

async function addSyncBikes(
  ctx: WriteTestContext,
  when: Date,
  passSuffixes: string[]
): Promise<void> {
  const { id } = await addSyncToWachtrij(
    {
      bikeparkID: ctx.bikeparkID,
      sectionID: ctx.sectionID,
      transactionDate: when.toISOString(),
      bikes: passSuffixes.map((suffix) => ({
        idcode: ctx.pass(suffix),
        idtype: 0,
        transactiondate: when.toISOString(),
      })),
    },
    NEW_TARGET
  );
  ctx.syncQueueIds.push(id);
}

async function addEmptySync(ctx: WriteTestContext, when: Date): Promise<void> {
  const { id } = await addSyncToWachtrij(
    {
      bikeparkID: ctx.bikeparkID,
      sectionID: ctx.sectionID,
      transactionDate: when.toISOString(),
      bikes: [],
    },
    NEW_TARGET
  );
  ctx.syncQueueIds.push(id);
}

async function latestTransactie(passID: string) {
  return prisma.new_transacties.findFirst({
    where: { PasID: passID },
    orderBy: { Date_checkin: "desc" },
    select: {
      Type_checkin: true,
      Type_checkout: true,
      Date_checkout: true,
    },
  });
}

async function isParkedInSection(ctx: WriteTestContext, passID: string): Promise<boolean> {
  const pasid = await prisma.new_accounts_pasids.findFirst({
    where: { PasID: passID },
    select: { huidigeFietsenstallingId: true, huidigeSectieId: true },
  });
  return (
    pasid?.huidigeFietsenstallingId === ctx.bikeparkID && pasid?.huidigeSectieId === ctx.sectionID
  );
}

/** Pass is (not) marked as parked in the test section (huidigeFietsenstallingId/SectieId). */
function expectParked(passSuffix: string, expected: boolean): Assertion {
  return async (ctx) => {
    const passID = ctx.pass(passSuffix);
    const parked = await isParkedInSection(ctx, passID);
    return {
      label: `Geparkeerd in sectie voor ${passSuffix}`,
      ok: parked === expected,
      expected: expected ? "geparkeerd in sectie" : "niet geparkeerd in sectie",
      actual: parked ? "geparkeerd in sectie" : "niet geparkeerd in sectie",
    };
  };
}

function expectTypeCheckin(passSuffix: string, expected: string): Assertion {
  return async (ctx) => {
    const tx = await latestTransactie(ctx.pass(passSuffix));
    return {
      label: `Type_checkin voor ${passSuffix}`,
      ok: tx?.Type_checkin === expected,
      expected,
      actual: tx?.Type_checkin ?? "geen transactie",
    };
  };
}

function expectTypeCheckout(passSuffix: string, expected: string): Assertion {
  return async (ctx) => {
    const tx = await latestTransactie(ctx.pass(passSuffix));
    return {
      label: `Type_checkout voor ${passSuffix}`,
      ok: tx?.Type_checkout === expected,
      expected,
      actual: tx?.Type_checkout ?? "geen transactie",
    };
  };
}

/** Count of sync queue rows registered for this run. */
function expectSyncRowCount(expected: number): Assertion {
  return async (ctx) => {
    const count = ctx.syncQueueIds.length;
    return {
      label: "Aantal sync-wachtrijrijen deze run",
      ok: count === expected,
      expected: `${expected}`,
      actual: `${count}`,
    };
  };
}

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
        {
          barcode: bikeBarcode(ctx),
          passID: ctx.pass("bike"),
          biketypeID: 1,
          transactionDate: ctx.baseTime.toISOString(),
        },
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
        {
          barcode: "",
          passID: ctx.pass("saldo"),
          biketypeID: 1,
          transactionDate: ctx.baseTime.toISOString(),
        },
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
      await addSyncBikes(ctx, ctx.baseTime, ["sync"]);
    },
    assert: [expectSyncProcessed()],
  },
  {
    id: "sync-then-checkout",
    label: "Sync-plaatsing zonder check-in, daarna normaal uitchecken",
    description:
      "Inventarisatie/sync plaatst een fiets (Type_checkin=sync) zonder voorafgaande check-in; daarna sluit een normale check-out de transactie af.",
    writeMethods: ["v2 syncSector", "v2 uploadJsonTransaction"],
    steps: [
      {
        run: async (ctx) => {
          await addSyncBikes(ctx, minutesAfter(ctx, 0), ["inv"]);
        },
        processRuns: 1,
      },
      {
        run: async (ctx) => {
          await addTransactionToWachtrij(
            ctx.bikeparkID,
            ctx.sectionID,
            {
              type: "out",
              transactionDate: minutesAfter(ctx, 5).toISOString(),
              passID: ctx.pass("inv"),
              idtype: 0,
            },
            undefined,
            undefined,
            undefined,
            NEW_TARGET
          );
        },
        processRuns: 1,
      },
    ],
    assert: [
      expectSyncProcessed(),
      expectQueueProcessed("transacties"),
      expectClosedTransactie("inv"),
      expectTransactieCount("inv", 1),
      expectTypeCheckin("inv", "sync"),
      expectTypeCheckout("inv", "user"),
      expectParked("inv", false),
    ],
  },
  {
    id: "sync-rescan-present",
    label: "Sync-plaatsing zonder check-in, opnieuw gescand bij inventarisatie",
    description:
      "Eerste sync plaatst de fiets; een tweede inventarisatie met dezelfde pas in de scanlijst laat één open sync-transactie staan.",
    writeMethods: ["v2 syncSector"],
    steps: [
      {
        run: async (ctx) => {
          await addSyncBikes(ctx, minutesAfter(ctx, 0), ["rescan"]);
        },
        processRuns: 1,
      },
      {
        run: async (ctx) => {
          await addSyncBikes(ctx, minutesAfter(ctx, 5), ["rescan"]);
        },
        processRuns: 1,
      },
    ],
    assert: [
      expectSyncRowCount(2),
      expectSyncProcessed(),
      expectOpenTransactie("rescan"),
      expectTransactieCount("rescan", 1),
      expectTypeCheckin("rescan", "sync"),
      expectParked("rescan", true),
    ],
  },
  {
    id: "checkin-taken-sync-absent",
    label: "Normale check-in, fiets weg zonder check-out, niet in inventarisatie",
    description:
      "Na een normale check-in verdwijnt de fiets zonder check-out; een lege inventarisatie sluit de transactie via sync-checkout af.",
    writeMethods: ["v2 uploadJsonTransaction", "v2 syncSector"],
    steps: [
      {
        run: async (ctx) => {
          await addTransactionToWachtrij(
            ctx.bikeparkID,
            ctx.sectionID,
            {
              type: "in",
              transactionDate: minutesAfter(ctx, 0).toISOString(),
              passID: ctx.pass("gone"),
              idtype: 0,
            },
            undefined,
            undefined,
            undefined,
            NEW_TARGET
          );
        },
        processRuns: 1,
      },
      {
        run: async (ctx) => {
          await addEmptySync(ctx, minutesAfter(ctx, 5));
        },
        processRuns: 1,
      },
    ],
    assert: [
      expectQueueProcessed("transacties"),
      expectSyncProcessed(),
      expectClosedTransactie("gone"),
      expectTransactieCount("gone", 1),
      expectTypeCheckin("gone", "user"),
      expectTypeCheckout("gone", "sync"),
      expectParked("gone", false),
    ],
  },
  {
    id: "sync-inventory-ok",
    label: "Inventarisatie klopt (check-in + scan aanwezig)",
    description:
      "Na normale check-in bevestigt een inventarisatie met de pas in de scanlijst dat alles klopt: open transactie blijft, fiets blijft geparkeerd.",
    writeMethods: ["v2 uploadJsonTransaction", "v2 syncSector"],
    steps: [
      {
        run: async (ctx) => {
          await addTransactionToWachtrij(
            ctx.bikeparkID,
            ctx.sectionID,
            {
              type: "in",
              transactionDate: minutesAfter(ctx, 0).toISOString(),
              passID: ctx.pass("ok"),
              idtype: 0,
            },
            undefined,
            undefined,
            undefined,
            NEW_TARGET
          );
        },
        processRuns: 1,
      },
      {
        run: async (ctx) => {
          await addSyncBikes(ctx, minutesAfter(ctx, 5), ["ok"]);
        },
        processRuns: 1,
      },
    ],
    assert: [
      expectQueueProcessed("transacties"),
      expectSyncProcessed(),
      expectOpenTransactie("ok"),
      expectTransactieCount("ok", 1),
      expectTypeCheckin("ok", "user"),
      expectParked("ok", true),
    ],
  },
];

export function getScenarioById(id: string): WriteScenario | undefined {
  return WRITE_SCENARIOS.find((s) => s.id === id);
}
