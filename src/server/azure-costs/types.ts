export type CostEnvironment = "prod" | "acc" | "shared" | "unclassified";
export type CostPlatform =
  | "core"
  | "api"
  | "database"
  | "network"
  | "other"
  | "unclassified";

export type CostResource = {
  id: string;
  name: string;
  resourceGroup: string;
  serviceName: string;
  environment: CostEnvironment | string;
  platform: CostPlatform | string;
  hosts: string[];
  sharedPlan: boolean;
  costs: Record<string, number>;
};

export type MeterBucket = "compute" | "storage" | "backup" | "io" | "other";

export type CostMeter = {
  month: string;
  resourceId: string;
  resourceName: string;
  resourceGroup: string;
  serviceName: string;
  meter: string;
  bucket: MeterBucket | string;
  cost: number;
};

export type CostLine = {
  month: string;
  resourceId: string;
  resourceName: string;
  resourceGroup: string;
  serviceName: string;
  cost: number;
  environment: string;
  platform: string;
  hosts: string[];
  sharedPlan: boolean;
};

export type RunningService = {
  name: string;
  kind: string;
  state: string;
  resourceGroup: string;
  hosts: string[];
  planName: string;
  environment: string;
  platform: string;
};

export type CostJob = {
  name: string;
  source: string;
  host: string;
  url: string;
  interval: string;
  paused: boolean | null;
  port: string;
  plan: string;
  note: string;
  replacement: string;
  ported: boolean;
  replacementScheduled: boolean | null;
  seenLive: boolean | null;
  evidenceSource: string | null;
  gap: string;
};

export type CostMonth = {
  month: string;
  status: string;
  error: string | null;
};

export type CostSummary = {
  generatedAt: string;
  currency: string;
  months: CostMonth[];
  resources: CostResource[];
  lineItems: CostLine[];
  meters?: CostMeter[];
  services: RunningService[];
  jobs: CostJob[];
  notes: string[];
};
