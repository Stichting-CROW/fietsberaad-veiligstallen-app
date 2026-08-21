/**
 * Write-side test scenarios (Tier A — behavioral golden tests).
 * Current path: docs/analyse-api/fms-write-paths.md.
 *
 * Each scenario seeds a deterministic start state, performs an FMS write through the
 * Next.js input queues (new_wachtrij_*), runs processQueues, and asserts the resulting
 * state in production tables (transacties / accounts / accounts_pasids / ...).
 *
 * SCOPE & SAFETY
 * - Writes go through new_wachtrij_* and then production output, scoped to testgemeente.
 * - Stallingskosten come from API payloads (no FMS tariff / afboeking in Next.js; intentional).
 * - All synthetic passIDs are namespaced `WTEST_<runId>_<suffix>`, so seed/teardown can
 *   delete exactly this run's rows by prefix.
 * - The runner additionally guards that the chosen bikepark belongs to the testgemeente
 *   organization (assertTestgemeenteScope) before any write happens.
 *
 * Assertions deliberately avoid `fietsenstalling_sectie.Bezetting` and `fietsenstalling_plek.status`,
 * which are not yet ported (parity prerequisites p1/p4).
 */

import { prisma } from "~/server/db";
import {
  addBikeToWachtrij,
  addManagedTransactionToWachtrij,
  addSaldoToWachtrij,
  addSyncToWachtrij,
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
  /** Performs the write(s) under test (new_wachtrij_* → production). */
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

type WachtrijQueueWithPassID = "pasids" | "betalingen";

async function countQueue(
  queue: WachtrijQueueWithPassID,
  where: { passID: { startsWith: string }; processed?: number }
): Promise<number> {
  switch (queue) {
    case "pasids":
      return prisma.new_wachtrij_pasids.count({ where });
    case "betalingen":
      return prisma.new_wachtrij_betalingen.count({ where });
  }
}

function managedExtId(ctx: WriteTestContext, suffix: string): string {
  return `${ctx.passPrefix}mt_${suffix}`;
}

async function enqueueManaged(
  ctx: WriteTestContext,
  suffix: string,
  fields: Record<string, unknown>
): Promise<void> {
  await addManagedTransactionToWachtrij(ctx.bikeparkID, ctx.sectionID, {
    externaltransactionid: managedExtId(ctx, suffix),
    idcode: ctx.pass(suffix),
    idtype: 0,
    checkintype: "user",
    sectionid: ctx.sectionID,
    ...fields,
  });
}

function expectManagedQueueProcessed(): Assertion {
  return async (ctx) => {
    const where = { externalTransactionID: { startsWith: ctx.passPrefix } };
    const total = await prisma.new_wachtrij_managed_transacties.count({ where });
    const done = await prisma.new_wachtrij_managed_transacties.count({
      where: { ...where, processed: PROCESSED_SUCCESS },
    });
    return {
      label: "new_wachtrij_managed_transacties: alle rijen verwerkt",
      ok: total > 0 && done === total,
      expected: "alle (>0) synthetische rijen processed=1",
      actual: `${done}/${total} verwerkt`,
    };
  };
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

/** Exactly one open (Date_checkout null) transacties row for the synthetic pass. */
function expectOpenTransactie(passSuffix: string): Assertion {
  return async (ctx) => {
    const passID = ctx.pass(passSuffix);
    const open = await prisma.transacties.count({
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

/** At least one closed (Date_checkout set) transacties row for the synthetic pass and no open ones. */
function expectClosedTransactie(passSuffix: string): Assertion {
  return async (ctx) => {
    const passID = ctx.pass(passSuffix);
    const closed = await prisma.transacties.count({
      where: { PasID: passID, Date_checkout: { not: null } },
    });
    const open = await prisma.transacties.count({
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

/** Total transacties rows for the synthetic pass equals `expected`. */
function expectTransactieCount(passSuffix: string, expected: number): Assertion {
  return async (ctx) => {
    const passID = ctx.pass(passSuffix);
    const count = await prisma.transacties.count({ where: { PasID: passID } });
    return {
      label: `Aantal transacties voor ${passSuffix}`,
      ok: count === expected,
      expected: `${expected} transactie(s)`,
      actual: `${count} transactie(s)`,
    };
  };
}

async function saldoForPass(passID: string): Promise<number | null> {
  const pasid = await prisma.accounts_pasids.findFirst({
    where: { PasID: passID },
    select: { AccountID: true },
  });
  if (!pasid?.AccountID) return null;
  const acc = await prisma.accounts.findUnique({
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
    const pasid = await prisma.accounts_pasids.findFirst({
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
  );
  ctx.syncQueueIds.push(id);
}

async function latestTransactie(passID: string) {
  return prisma.transacties.findFirst({
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
  const pasid = await prisma.accounts_pasids.findFirst({
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

export const WRITE_SCENARIOS: WriteScenario[] = [
  {
    id: "save-bike",
    label: "Fiets/pas registreren (queue pasids)",
    description:
      "Voegt een pas met barcode toe via de pasids-wachtrij en controleert dat na verwerking de bikepass bestaat met de juiste barcode.",
    writeMethods: ["queue pasids"],
    act: async (ctx) => {
      await addBikeToWachtrij(
        ctx.bikeparkID,
        {
          barcode: bikeBarcode(ctx),
          passID: ctx.pass("bike"),
          biketypeID: 1,
          transactionDate: ctx.baseTime.toISOString(),
        },
      );
    },
    assert: [expectQueueProcessed("pasids"), expectPasidBarcode("bike", bikeBarcode)],
  },
  {
    id: "checkin",
    label: "Check-in (managedtransactions-wachtrij)",
    description:
      "Boekt een check-in via de managed-transacties-wachtrij en controleert dat er precies één open transactie ontstaat.",
    writeMethods: ["queue managedtransactions"],
    act: async (ctx) => {
      await enqueueManaged(ctx, "ci", { checkindate: ctx.baseTime.toISOString() });
    },
    assert: [expectManagedQueueProcessed(), expectOpenTransactie("ci")],
  },
  {
    id: "checkin-checkout",
    label: "Check-in + check-out (managedtransactions-wachtrij)",
    description:
      "Boekt één managed transactie met check-in en check-out (zelfde externaltransactionid) en controleert dat de transactie wordt afgesloten.",
    writeMethods: ["queue managedtransactions"],
    act: async (ctx) => {
      const checkout = new Date(ctx.baseTime.getTime() + 30 * 60 * 1000);
      await enqueueManaged(ctx, "co", {
        checkindate: ctx.baseTime.toISOString(),
        checkoutdate: checkout.toISOString(),
        checkouttype: "user",
      });
    },
    assert: [
      expectManagedQueueProcessed(),
      expectClosedTransactie("co"),
      expectTransactieCount("co", 1),
    ],
  },
  {
    id: "saldo",
    label: "Saldo opwaarderen (queue betalingen)",
    description:
      "Registreert eerst een pas en voegt daarna €10,00 saldo toe via de betalingen-wachtrij. Controleert dat het accountsaldo €10,00 is.",
    writeMethods: ["queue pasids", "queue betalingen"],
    act: async (ctx) => {
      await addBikeToWachtrij(
        ctx.bikeparkID,
        {
          barcode: "",
          passID: ctx.pass("saldo"),
          biketypeID: 1,
          transactionDate: ctx.baseTime.toISOString(),
        },
      );
      await addSaldoToWachtrij(
        ctx.bikeparkID,
        {
          passID: ctx.pass("saldo"),
          transactionDate: ctx.baseTime.toISOString(),
          paymentTypeID: 1,
          amount: 10,
        },
      );
    },
    assert: [
      expectQueueProcessed("pasids"),
      expectQueueProcessed("betalingen"),
      expectSaldo("saldo", 10),
    ],
  },
  {
    id: "sync",
    label: "Sector synchronisatie (queue sync)",
    description:
      "Stuurt een sync voor de sectie met één aanwezige fiets en controleert dat de sync-wachtrij verwerkt is.",
    writeMethods: ["queue sync"],
    act: async (ctx) => {
      await addSyncBikes(ctx, ctx.baseTime, ["sync"]);
    },
    assert: [expectSyncProcessed()],
  },
  {
    id: "sync-rescan-present",
    label: "Sync-plaatsing zonder check-in, opnieuw gescand bij inventarisatie",
    description:
      "Eerste sync plaatst de fiets; een tweede inventarisatie met dezelfde pas in de scanlijst laat één open sync-transactie staan.",
    writeMethods: ["queue sync"],
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
      "Na een managed check-in verdwijnt de fiets zonder check-out; een lege inventarisatie sluit de transactie via sync-checkout af.",
    writeMethods: ["queue managedtransactions", "queue sync"],
    steps: [
      {
        run: async (ctx) => {
          await enqueueManaged(ctx, "gone", { checkindate: minutesAfter(ctx, 0).toISOString() });
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
      expectManagedQueueProcessed(),
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
      "Na een managed check-in bevestigt een inventarisatie met de pas in de scanlijst dat alles klopt: open transactie blijft, fiets blijft geparkeerd.",
    writeMethods: ["queue managedtransactions", "queue sync"],
    steps: [
      {
        run: async (ctx) => {
          await enqueueManaged(ctx, "ok", { checkindate: minutesAfter(ctx, 0).toISOString() });
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
      expectManagedQueueProcessed(),
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
