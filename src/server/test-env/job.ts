import type { CopyWarning } from "./copy";

export type SnapshotPhaseState = "pending" | "active" | "done" | "error";

export type SnapshotPhase = {
  id: string;
  label: string;
  state: SnapshotPhaseState;
  detail: string;
};

export const SNAPSHOT_PHASES: Array<{ id: string; label: string }> = [
  { id: "wipe", label: "Doeldatabase legen" },
  { id: "baseline", label: "Basisgegevens" },
  { id: "organisations", label: "Organisaties en contacten" },
  { id: "stallingen", label: "Stallingen" },
  { id: "subscriptions", label: "Abonnementen en tarieven" },
  { id: "users", label: "Gebruikers" },
  { id: "accounts", label: "Accounts en betalingen" },
  { id: "visits", label: "Bezoeken en bezetting" },
  { id: "content", label: "Presentaties, prijzen en wachtlijst" },
  { id: "library", label: "Bibliotheekbestanden" },
];

export type SnapshotJob = {
  id: string;
  status: "running" | "done" | "error";
  step: string;
  phases: SnapshotPhase[];
  counts: Record<string, number>;
  warnings: CopyWarning[];
  error?: string;
  startedAt: string;
  finishedAt?: string;
  logins: { username: string; password: string }[];
  libraryFiles: number;
};

export function activatePhase(job: SnapshotJob, id: string, detail = ""): void {
  let reached = false;
  for (const phase of job.phases) {
    if (phase.id === id) {
      phase.state = "active";
      phase.detail = detail;
      job.step = detail || phase.label;
      reached = true;
      continue;
    }
    if (!reached && phase.state !== "error") {
      phase.state = "done";
      phase.detail = "";
    }
  }
}

export function notePhase(job: SnapshotJob, detail: string): void {
  job.step = detail;
  const phase = job.phases.find((item) => item.state === "active");
  if (phase) phase.detail = detail;
}

export function completePhases(job: SnapshotJob): void {
  for (const phase of job.phases) {
    if (phase.state !== "error") {
      phase.state = "done";
      phase.detail = "";
    }
  }
  job.step = "klaar";
}

export function failActivePhase(job: SnapshotJob): void {
  const phase = job.phases.find((item) => item.state === "active");
  if (phase) phase.state = "error";
}

const jobs = globalThis as typeof globalThis & { __testEnvSnapshotJob?: SnapshotJob | null };

export function getSnapshotJob(): SnapshotJob | null {
  return jobs.__testEnvSnapshotJob ?? null;
}

export function beginSnapshotJob(): SnapshotJob {
  if (jobs.__testEnvSnapshotJob?.status === "running") {
    throw new Error("Er loopt al een snapshot");
  }
  const current: SnapshotJob = {
    id: new Date().toISOString(),
    status: "running",
    step: "starten",
    phases: SNAPSHOT_PHASES.map((phase) => ({ ...phase, state: "pending" as const, detail: "" })),
    counts: {},
    warnings: [],
    startedAt: new Date().toISOString(),
    logins: [],
    libraryFiles: 0,
  };
  jobs.__testEnvSnapshotJob = current;
  return current;
}
