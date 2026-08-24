/**
 * Runner for Tier B HTTP ingress write tests.
 */

import { prisma } from "~/server/db";
import { env } from "~/env.mjs";
import { buildTestFmsAuthHeader } from "~/server/services/fms/fms-test-credentials";
import { TESTGEMEENTE_NAME } from "~/data/testgemeente-data";
import { resolveTestgemeenteScope, ScopeError, type WriteTestScope } from "./write-test-runner";
import {
  API_SYNTHETIC_PREFIX,
  API_WRITE_SCENARIOS,
  getApiWriteScenarioById,
  type ApiWriteTestContext,
  type AssertionResult,
  type ApiWriteScenario,
} from "./api-write-test-scenarios";
import {
  SEQUENCE_WRITE_SCENARIOS,
  getSequenceWriteScenarioById,
} from "./write-sequence-scenarios";
import {
  assertLockerPlaceConfigured,
  describeLockerPlaceProblem,
  inspectTestgemeenteLockerPlace,
  LOCKER_API_SCENARIO_IDS,
  TESTGEMEENTE_LOCKER_BIKEPARK_ID,
  TESTGEMEENTE_LOCKER_SECTION_ID,
  type TestgemeenteLockerPlaceStatus,
} from "./testgemeente-locker-place";

export type WriteTestSuite = "api" | "sequences";

const SEQUENCE_SUITE: ApiWriteScenario[] = [
  ...SEQUENCE_WRITE_SCENARIOS,
  ...API_WRITE_SCENARIOS.filter(
    (s) => s.id === "api-v4-legacy-transactions-gone" || s.id === "api-v4-locker-writes-gone"
  ),
];

function scenariosForSuite(suite: WriteTestSuite): ApiWriteScenario[] {
  return suite === "sequences" ? SEQUENCE_SUITE : API_WRITE_SCENARIOS;
}

function findScenario(id: string): ApiWriteScenario | undefined {
  return getSequenceWriteScenarioById(id) ?? getApiWriteScenarioById(id);
}

export type ApiScenarioRunResult = {
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

async function resolveSubscriptionTypeID(bikeparkID: string): Promise<number> {
  const stalling = await prisma.fietsenstallingen.findFirst({
    where: { StallingsID: bikeparkID },
    select: { ID: true },
  });
  if (!stalling) return 0;
  const link = await prisma.abonnementsvorm_fietsenstalling.findFirst({
    where: { BikeparkID: stalling.ID },
    select: { SubscriptiontypeID: true },
    orderBy: { SubscriptiontypeID: "asc" },
  });
  return link?.SubscriptiontypeID ?? 0;
}

function buildContext(scope: WriteTestScope, baseUrl: string, authHeader: string): ApiWriteTestContext {
  const runId = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)
    .toString(36)
    .padStart(3, "0")}`;
  const passPrefix = `${API_SYNTHETIC_PREFIX}${runId}_`;
  return {
    runId,
    passPrefix,
    pass: (suffix: string) => `${passPrefix}${suffix}`,
    baseUrl: baseUrl.replace(/\/$/, ""),
    authHeader,
    citycode: "9933",
    bikeparkID: scope.bikeparkID,
    sectionID: scope.sectionID,
    lockerBikeparkID: TESTGEMEENTE_LOCKER_BIKEPARK_ID,
    lockerSectionID: TESTGEMEENTE_LOCKER_SECTION_ID,
    lockerPlaceID: "",
    subscriptionTypeID: 0,
    baseTime: new Date(Date.now() - 60 * 60 * 1000),
  };
}

async function assertTestgemeenteScope(bikeparkID: string, siteID: string): Promise<void> {
  const bikepark = await prisma.fietsenstallingen.findFirst({
    where: { StallingsID: bikeparkID },
    select: { SiteID: true },
  });
  if (!bikepark || bikepark.SiteID !== siteID) {
    throw new ScopeError(`Stalling ${bikeparkID} valt buiten testgemeente scope`);
  }
}

async function runScenario(
  scenario: ApiWriteScenario,
  scope: WriteTestScope,
  baseUrl: string,
  authHeader: string
): Promise<ApiScenarioRunResult> {
  const started = Date.now();
  const ctx = buildContext(scope, baseUrl, authHeader);
  const lockerStatus = await inspectTestgemeenteLockerPlace();
  ctx.lockerPlaceID = lockerStatus.placeID;
  ctx.subscriptionTypeID = await resolveSubscriptionTypeID(ctx.bikeparkID);

  const base: Omit<ApiScenarioRunResult, "ok" | "durationMs" | "assertions"> = {
    id: scenario.id,
    label: scenario.label,
    description: scenario.description,
    writeMethods: scenario.writeMethods,
  };

  let assertions: AssertionResult[] = [];
  let error: string | undefined;
  let teardownError: string | undefined;

  try {
    if (!authHeader) {
      throw new Error(
        "Geen FMS-testcredentials (FMS_TEST_* in env, of dataleverancier via gemeente → FMS rechten)"
      );
    }
    if (env.ENABLE_WRITE_API !== "true") {
      throw new Error("ENABLE_WRITE_API moet 'true' zijn voor schrijftests");
    }
    if (ctx.subscriptionTypeID === 0 && scenario.writeMethods.some((m) => m.includes("Subscription"))) {
      throw new Error("Geen abonnementsvorm gevonden voor testgemeente stalling");
    }
    if (LOCKER_API_SCENARIO_IDS.has(scenario.id)) {
      assertLockerPlaceConfigured(ctx.lockerPlaceID, lockerStatus);
    }

    await assertTestgemeenteScope(ctx.bikeparkID, scope.siteID);
    await scenario.act(ctx);
    assertions = await scenario.assert(ctx);
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  } finally {
    try {
      await scenario.teardown(ctx);
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

export type RunApiWriteTestsResult = {
  scope: WriteTestScope;
  lockerPlace?: TestgemeenteLockerPlaceStatus;
  results: ApiScenarioRunResult[];
  passed: number;
  failed: number;
};

export async function getApiWriteTestPreflight(): Promise<{
  lockerPlace: TestgemeenteLockerPlaceStatus;
  lockerConfigurationWarning: string | null;
}> {
  const lockerPlace = await inspectTestgemeenteLockerPlace();
  return {
    lockerPlace,
    lockerConfigurationWarning: lockerPlace.ready ? null : describeLockerPlaceProblem(lockerPlace),
  };
}

export async function runApiWriteTests(
  baseUrl: string,
  scenarioId?: string,
  suite: WriteTestSuite = "api"
): Promise<RunApiWriteTestsResult> {
  const scope = await resolveTestgemeenteScope();
  const authHeader = (await buildTestFmsAuthHeader()) ?? "";
  const lockerPlace = await inspectTestgemeenteLockerPlace();

  const scenarios = scenarioId
    ? (() => {
        const s = findScenario(scenarioId);
        if (!s) throw new Error(`Onbekend scenario: ${scenarioId}`);
        return [s];
      })()
    : scenariosForSuite(suite);

  const results: ApiScenarioRunResult[] = [];
  for (const scenario of scenarios) {
    results.push(await runScenario(scenario, scope, baseUrl, authHeader));
  }

  return {
    scope,
    lockerPlace,
    results,
    passed: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
  };
}

export function listApiWriteScenarios(
  suite: WriteTestSuite = "api"
): Array<Pick<ApiWriteScenario, "id" | "label" | "description" | "writeMethods">> {
  return scenariosForSuite(suite).map((s) => ({
    id: s.id,
    label: s.label,
    description: s.description,
    writeMethods: s.writeMethods,
  }));
}

export { TESTGEMEENTE_NAME };
