import type { CopyWarning } from "./copy";

export type SnapshotJob = {
  id: string;
  status: "running" | "done" | "error";
  step: string;
  counts: Record<string, number>;
  warnings: CopyWarning[];
  error?: string;
  startedAt: string;
  finishedAt?: string;
  logins: { username: string; password: string }[];
  libraryFiles: number;
};

let current: SnapshotJob | null = null;

export function getSnapshotJob(): SnapshotJob | null {
  return current;
}

export function beginSnapshotJob(): SnapshotJob {
  if (current?.status === "running") {
    throw new Error("Er loopt al een snapshot");
  }
  current = {
    id: new Date().toISOString(),
    status: "running",
    step: "starten",
    counts: {},
    warnings: [],
    startedAt: new Date().toISOString(),
    logins: [],
    libraryFiles: 0,
  };
  return current;
}
