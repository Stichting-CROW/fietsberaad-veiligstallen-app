/**
 * Runner for the write-side (Tier A) golden tests.
 *
 * Resolves a testgemeente bikepark/section, then for each scenario:
 *   1. builds a run-unique context (synthetic passID prefix `WTEST_<runId>_`),
 *   2. (optional) seeds deterministic state in new_*,
 *   3. performs the write under test through wachtrij-service (useNewTables: true),
 *   4. runs processQueues() one or more times,
 *   5. evaluates the golden assertions,
 *   6. tears down every row it created (by synthetic prefix) — production is never touched.
 *
 * All operations are confined to the testgemeente organization (assertTestgemeenteScope)
 * and to the shadow new_* tables.
 *
 * TODO (follow-up): extend `target=new` support to the v3 write service and the remaining
 * v2 writes (addSubscription/subscribe/updateLocker/reportOccupationData) so those methods
 * can be added here as Tier-A scenarios. Today they write straight to production.
 */

import { prisma } from "~/server/db";
import { processQueues } from "~/server/services/queue/processor";
import { TESTGEMEENTE_NAME } from "~/data/testgemeente-data";
import {
  SYNTHETIC_PREFIX,
  WRITE_SCENARIOS,
  getScenarioById,
  type AssertionResult,
  type WriteScenario,
  type WriteTestContext,
} from "./write-test-scenarios";

export type WriteTestScope = {
  siteID: string;
  bikeparkID: string;
  sectionID: string;
  stallingLabel: string;
};

export type ScenarioRunResult = {
  id: string;
  label: string;
  description: string;
  writeMethods: string[];
  ok: boolean;
  durationMs: number;
  assertions: AssertionResult[];
  error?: string;
  teardownError?: string;
};

export class ScopeError extends Error {}

/**
 * Resolve a testgemeente bikepark + section to run the write tests against.
 * Picks the first section (externalId ending `_1`) of an active testgemeente fietsenstalling.
 */
export async function resolveTestgemeenteScope(): Promise<WriteTestScope> {
  const contact = await prisma.contacts.findFirst({
    where: { CompanyName: TESTGEMEENTE_NAME, ItemType: "organizations", Status: "1" },
    select: { ID: true },
  });
  if (!contact) {
    throw new ScopeError("Testgemeente organisatie niet gevonden");
  }

  const sectie = await prisma.fietsenstalling_sectie.findFirst({
    where: {
      externalId: { endsWith: "_1" },
      fietsenstalling: { SiteID: contact.ID, Status: "1" },
    },
    select: {
      externalId: true,
      fietsenstalling: { select: { StallingsID: true, Title: true } },
    },
    orderBy: { sectieId: "asc" },
  });

  const bikeparkID = sectie?.fietsenstalling?.StallingsID ?? undefined;
  const sectionID = sectie?.externalId ?? undefined;
  if (!bikeparkID || !sectionID) {
    throw new ScopeError(
      "Geen testgemeente stalling met sectie (externalId `_1`) gevonden om tegen te testen"
    );
  }

  return {
    siteID: contact.ID,
    bikeparkID,
    sectionID,
    stallingLabel: sectie?.fietsenstalling?.Title ?? bikeparkID,
  };
}

/** Verifies the bikepark belongs to the testgemeente organization. Throws otherwise. */
async function assertTestgemeenteScope(bikeparkID: string, siteID: string): Promise<void> {
  const bikepark = await prisma.fietsenstallingen.findFirst({
    where: { StallingsID: bikeparkID },
    select: { SiteID: true },
  });
  if (!bikepark || bikepark.SiteID !== siteID) {
    throw new ScopeError(
      `Stalling ${bikeparkID} valt buiten testgemeente scope — schrijftest geweigerd`
    );
  }
}

function buildContext(scope: WriteTestScope): WriteTestContext {
  const runId = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)
    .toString(36)
    .padStart(3, "0")}`;
  const passPrefix = `${SYNTHETIC_PREFIX}${runId}_`;
  return {
    bikeparkID: scope.bikeparkID,
    sectionID: scope.sectionID,
    siteID: scope.siteID,
    runId,
    passPrefix,
    pass: (suffix: string) => `${passPrefix}${suffix}`,
    // 1 hour ago so `transactionDate <= NOW()` always holds for the processor.
    baseTime: new Date(Date.now() - 60 * 60 * 1000),
  };
}

/**
 * Delete every row created by this run, scoped by the synthetic passID prefix.
 * Order respects FK-ish dependencies (financial tx → accounts → pasids).
 */
async function teardownRun(ctx: WriteTestContext): Promise<void> {
  const prefix = ctx.passPrefix;

  // Collect synthetic accounts via their bikepasses before deleting the link rows.
  const synthPasids = await prisma.new_accounts_pasids.findMany({
    where: { PasID: { startsWith: prefix } },
    select: { ID: true, AccountID: true },
  });
  const accountIDs = Array.from(
    new Set(synthPasids.map((p) => p.AccountID).filter((id): id is string => !!id))
  );

  if (accountIDs.length > 0) {
    await prisma.new_financialtransactions.deleteMany({ where: { accountID: { in: accountIDs } } });
  }
  await prisma.new_transacties.deleteMany({ where: { PasID: { startsWith: prefix } } });
  await prisma.new_accounts_pasids.deleteMany({ where: { PasID: { startsWith: prefix } } });
  if (accountIDs.length > 0) {
    await prisma.new_accounts.deleteMany({ where: { ID: { in: accountIDs } } });
  }

  await prisma.new_wachtrij_pasids.deleteMany({ where: { passID: { startsWith: prefix } } });
  await prisma.new_wachtrij_transacties.deleteMany({ where: { passID: { startsWith: prefix } } });
  await prisma.new_wachtrij_betalingen.deleteMany({ where: { passID: { startsWith: prefix } } });
  // Sync queue has no passID — scope by bikepark + this run's baseTime.
  await prisma.new_wachtrij_sync.deleteMany({
    where: { bikeparkID: ctx.bikeparkID, transactionDate: { gte: ctx.baseTime } },
  });
}

async function runScenario(
  scenario: WriteScenario,
  scope: WriteTestScope
): Promise<ScenarioRunResult> {
  const started = Date.now();
  const ctx = buildContext(scope);
  const base: Omit<ScenarioRunResult, "ok" | "durationMs" | "assertions"> = {
    id: scenario.id,
    label: scenario.label,
    description: scenario.description,
    writeMethods: scenario.writeMethods,
  };

  let assertions: AssertionResult[] = [];
  let error: string | undefined;
  let teardownError: string | undefined;

  try {
    await assertTestgemeenteScope(ctx.bikeparkID, ctx.siteID);

    if (scenario.seed) await scenario.seed(ctx);
    await scenario.act(ctx);

    const runs = scenario.processRuns ?? 1;
    for (let i = 0; i < runs; i++) {
      await processQueues();
    }

    assertions = [];
    for (const assertion of scenario.assert) {
      try {
        assertions.push(await assertion(ctx));
      } catch (e) {
        assertions.push({
          label: "assertie-fout",
          ok: false,
          expected: "assertie voert uit zonder fout",
          actual: e instanceof Error ? e.message : String(e),
        });
      }
    }
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  } finally {
    try {
      await teardownRun(ctx);
    } catch (e) {
      teardownError = e instanceof Error ? e.message : String(e);
    }
  }

  const ok = !error && assertions.length > 0 && assertions.every((a) => a.ok);
  return {
    ...base,
    ok,
    durationMs: Date.now() - started,
    assertions,
    ...(error ? { error } : {}),
    ...(teardownError ? { teardownError } : {}),
  };
}

export type RunAllResult = {
  scope: WriteTestScope;
  results: ScenarioRunResult[];
  passed: number;
  failed: number;
};

/** Run a single scenario (or all when `scenarioId` is omitted). */
export async function runWriteTests(scenarioId?: string): Promise<RunAllResult> {
  const scope = await resolveTestgemeenteScope();

  const scenarios = scenarioId
    ? (() => {
        const s = getScenarioById(scenarioId);
        if (!s) throw new Error(`Onbekend scenario: ${scenarioId}`);
        return [s];
      })()
    : WRITE_SCENARIOS;

  const results: ScenarioRunResult[] = [];
  for (const scenario of scenarios) {
    results.push(await runScenario(scenario, scope));
  }

  return {
    scope,
    results,
    passed: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
  };
}

export function listWriteScenarios(): Array<
  Pick<WriteScenario, "id" | "label" | "description" | "writeMethods">
> {
  return WRITE_SCENARIOS.map((s) => ({
    id: s.id,
    label: s.label,
    description: s.description,
    writeMethods: s.writeMethods,
  }));
}
