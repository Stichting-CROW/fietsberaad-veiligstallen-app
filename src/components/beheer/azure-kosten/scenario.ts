import type { CostSummary } from "~/server/azure-costs/types";

export const REFERENCE_MONTHS = ["2026-07", "2026-08", "2026-09"] as const;
export const JUNE_MONTH = "2026-06";

export type CostScope = "both" | "prod" | "acc";

export type MonthBucket = {
  month: string;
  partial: boolean;
  acceptance: number;
  appService: number;
  otherProd: number;
  plans: Record<string, number>;
  total: number;
};

export type PlanFacts = {
  planNames: [string, string];
  livePlanName: string;
  emptyPlanName: string;
  emptyHasSites: boolean;
  juneLevel: number;
  liveLevel: number;
  emptyLevel: number;
  defaultRatio: number;
  sites: { name: string; platform: string }[];
};

export type RemovableService = {
  id: string;
  name: string;
  environment: string;
  platform: string;
  serviceName: string;
  monthly: number;
  emptyPlan: boolean;
};

export type ShutdownSettings = {
  /** Null keeps the June 2026 ratio. Otherwise a fraction of the July–September plan cost. */
  ratio: number | null;
  /** Resource ids that keep running. */
  excluded: string[];
  /** Unclassified production resources that stop. Absent means they keep running. */
  stoppedUnclassified: string[];
};

export type Projection = {
  facts: PlanFacts;
  ratio: number;
  usingJune: boolean;
  planTarget: number;
  planSaving: number;
  stopped: RemovableService[];
  stoppedMonthly: number;
  referenceMonthly: number;
  futureMonthly: number;
  savingMonthly: number;
  savingYearly: number;
  appServiceFuture: number;
};

function average(values: number[]): number {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function okMonths(summary: CostSummary): string[] {
  return summary.months.filter((month) => month.status === "ok").map((month) => month.month);
}

function referenceMonths(summary: CostSummary): string[] {
  const ok = new Set(okMonths(summary));
  return REFERENCE_MONTHS.filter((month) => ok.has(month));
}

export function inScope(environment: string, scope: CostScope): boolean {
  if (scope === "both") return environment === "prod" || environment === "acc";
  return environment === scope;
}

/** Actual prod + acceptance cost. Both production App Service plans are one amount. */
export function buildActualMonths(summary: CostSummary, today = new Date()): MonthBucket[] {
  const currentMonth = today.toISOString().slice(0, 7);
  return okMonths(summary).map((month) => {
    let acceptance = 0;
    let prod = 0;
    let appService = 0;
    const plans: Record<string, number> = {};
    for (const line of summary.lineItems) {
      if (line.month !== month) continue;
      if (line.environment === "acc") acceptance += line.cost;
      if (line.environment === "prod") prod += line.cost;
      if (line.environment === "prod" && line.serviceName === "Azure App Service") {
        appService += line.cost;
        plans[line.resourceName] = (plans[line.resourceName] ?? 0) + line.cost;
      }
    }
    return {
      month,
      partial: month === currentMonth,
      acceptance: round(acceptance),
      appService: round(appService),
      otherProd: round(prod - appService),
      plans,
      total: round(acceptance + prod),
    };
  });
}

function planLevel(months: MonthBucket[], name: string, wanted: string[]): number {
  const found = wanted.flatMap((month) => {
    const bucket = months.find((item) => item.month === month);
    return bucket ? [bucket.plans[name] ?? 0] : [];
  });
  return round(average(found));
}

export function readPlanFacts(summary: CostSummary, today = new Date()): PlanFacts | null {
  const months = buildActualMonths(summary, today);
  const totals = new Map<string, number>();
  for (const month of months) {
    for (const [name, cost] of Object.entries(month.plans)) {
      totals.set(name, (totals.get(name) ?? 0) + cost);
    }
  }
  const planNames = [...totals.entries()]
    .filter(([, total]) => total >= 200)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([name]) => name);
  if (planNames.length < 2) return null;

  const ref = referenceMonths(summary);
  if (!ref.length) return null;
  const firstLevel = planLevel(months, planNames[0], ref);
  const secondLevel = planLevel(months, planNames[1], ref);
  const livePlanName = firstLevel >= secondLevel ? planNames[0] : planNames[1];
  const emptyPlanName = planNames.find((name) => name !== livePlanName) ?? livePlanName;
  const liveLevel = livePlanName === planNames[0] ? firstLevel : secondLevel;
  const emptyLevel = emptyPlanName === planNames[0] ? firstLevel : secondLevel;
  const juneBucket = months.find((item) => item.month === JUNE_MONTH);
  const juneLevel = round(juneBucket?.plans[livePlanName] ?? 0);
  const sites = summary.services
    .filter((service) => service.kind === "webapp" && service.planName === livePlanName)
    .map((service) => ({ name: service.name, platform: service.platform }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const emptyHasSites = summary.services.some((service) => service.kind === "webapp" && service.planName === emptyPlanName);

  return {
    planNames: [planNames[0], planNames[1]],
    livePlanName,
    emptyPlanName,
    emptyHasSites,
    juneLevel,
    liveLevel,
    emptyLevel,
    defaultRatio: liveLevel > 0 ? juneLevel / liveLevel : 1,
    sites,
  };
}

/** Services with their own bill that can stop. The live plan is resized, not removed. */
export function listRemovable(summary: CostSummary, facts: PlanFacts): RemovableService[] {
  const months = referenceMonths(summary);
  if (!months.length) return [];
  const buckets = new Map<string, RemovableService>();
  for (const line of summary.lineItems) {
    if (!months.includes(line.month) || line.cost === 0) continue;
    const isLive = line.environment === "prod" && line.serviceName === "Azure App Service" && line.resourceName === facts.livePlanName;
    if (isLive || line.serviceName === "Bandwidth") continue;
    const emptyPlan = line.environment === "prod" && line.serviceName === "Azure App Service" && line.resourceName === facts.emptyPlanName;
    if (!emptyPlan && line.environment !== "acc" && line.platform !== "core") continue;
    const id = (line.resourceId || `${line.resourceGroup}/${line.resourceName}`).toLowerCase();
    const existing = buckets.get(id);
    if (existing) {
      existing.monthly += line.cost;
      continue;
    }
    buckets.set(id, {
      id,
      name: line.resourceName,
      environment: line.environment,
      platform: line.platform,
      serviceName: line.serviceName,
      monthly: line.cost,
      emptyPlan,
    });
  }
  return [...buckets.values()]
    .map((item) => ({ ...item, monthly: round(item.monthly / months.length) }))
    .filter((item) => item.monthly >= 1)
    .sort((a, b) => Number(b.emptyPlan) - Number(a.emptyPlan) || b.monthly - a.monthly || a.name.localeCompare(b.name));
}

/** Production resources without a category. They keep running until assigned to stop. */
export function listUnassigned(summary: CostSummary, facts: PlanFacts): RemovableService[] {
  const months = referenceMonths(summary);
  const claimed = new Set(listRemovable(summary, facts).map((item) => item.id));
  return summary.resources
    .filter((resource) => resource.platform === "unclassified" && resource.environment !== "acc")
    .map((resource) => {
      const id = (resource.id || `${resource.resourceGroup}/${resource.name}`).toLowerCase();
      const monthly = months.length
        ? round(months.reduce((sum, month) => sum + (resource.costs[month] || 0), 0) / months.length)
        : 0;
      return {
        id,
        name: resource.name,
        environment: resource.environment,
        platform: resource.platform,
        serviceName: resource.serviceName,
        monthly,
        emptyPlan: false,
      };
    })
    .filter((item) => !claimed.has(item.id) && item.name !== facts.livePlanName && item.name !== facts.emptyPlanName)
    .sort((a, b) => b.monthly - a.monthly || a.serviceName.localeCompare(b.serviceName) || a.name.localeCompare(b.name));
}

export function buildProjection(summary: CostSummary, settings: ShutdownSettings, today = new Date()): Projection | null {
  const facts = readPlanFacts(summary, today);
  if (!facts) return null;
  const ref = referenceMonths(summary).flatMap((month) => {
    const found = buildActualMonths(summary, today).find((item) => item.month === month);
    return found ? [found] : [];
  });
  const referenceMonthly = round(average(ref.map((item) => item.total)));
  const ratio = settings.ratio == null ? facts.defaultRatio : settings.ratio;
  const planTarget = round(facts.liveLevel * ratio);
  const planSaving = round(facts.liveLevel - planTarget);
  const excluded = new Set(settings.excluded);
  const chosen = new Set(settings.stoppedUnclassified ?? []);
  const stopped = [
    ...listRemovable(summary, facts).filter((item) => !excluded.has(item.id)),
    ...listUnassigned(summary, facts).filter((item) => chosen.has(item.id)),
  ];
  const stoppedMonthly = round(stopped.reduce((sum, item) => sum + item.monthly, 0));
  const savingMonthly = round(planSaving + stoppedMonthly);
  const emptyStopped = stopped.some((item) => item.emptyPlan);
  return {
    facts,
    ratio,
    usingJune: settings.ratio == null,
    planTarget,
    planSaving,
    stopped,
    stoppedMonthly,
    referenceMonthly,
    futureMonthly: round(referenceMonthly - savingMonthly),
    savingMonthly,
    savingYearly: round(savingMonthly * 12),
    appServiceFuture: round(planTarget + (emptyStopped ? 0 : facts.emptyLevel)),
  };
}
