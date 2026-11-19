import React from "react";
import { Chip } from "@mui/material";

export type TaskRecord = {
  id: number;
  type: string;
  status: "queued" | "running" | "done" | "failed" | "cancelled";
  stuck: boolean;
  scheduleKey: string | null;
  trigger: "schedule" | "manual" | "app";
  triggeredBy: string | null;
  runAfter: string;
  attempts: number;
  maxAttempts: number;
  lockedBy: string | null;
  lockedUntil: string | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  durationMs: number | null;
};

export type TaskDetail = TaskRecord & {
  payload: unknown;
  result: unknown;
  lastError: string | null;
  dedupeKey: string | null;
};

export function formatWhen(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("nl-NL", { timeZone: "Europe/Amsterdam" });
}

export function formatDuration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return "—";
  if (ms < 1000) return `${Math.round(ms)} ms`;
  const totalSeconds = Math.round(ms / 1000);
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  if (minutes < 60) return `${minutes}m ${String(totalSeconds % 60).padStart(2, "0")}s`;
  return `${Math.floor(minutes / 60)}u ${String(minutes % 60).padStart(2, "0")}m`;
}

/** Final duration, or elapsed time in italics while still running. */
export function DurationCell({ task, now }: { task: TaskRecord; now: number }) {
  if (task.status === "running" && task.startedAt) {
    return <em>{formatDuration(now - new Date(task.startedAt).getTime())}</em>;
  }
  return <>{formatDuration(task.durationMs)}</>;
}

const STATUS_LABELS: Record<string, string> = {
  queued: "wachtrij",
  running: "bezig",
  done: "klaar",
  failed: "mislukt",
  cancelled: "geannuleerd",
  stuck: "vastgelopen",
};

const STATUS_COLORS: Record<string, "default" | "info" | "success" | "error" | "warning"> = {
  queued: "default",
  running: "info",
  done: "success",
  failed: "error",
  cancelled: "default",
  stuck: "warning",
};

export const STATUS_FILTERS = ["queued", "running", "stuck", "done", "failed", "cancelled"] as const;

export function statusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status;
}

export function StatusChip({ task }: { task: Pick<TaskRecord, "status" | "stuck" | "attempts" | "maxAttempts"> }) {
  const key = task.stuck ? "stuck" : task.status;
  const retrying = task.status === "queued" && task.attempts > 0;
  return (
    <Chip
      size="small"
      color={retrying ? "warning" : STATUS_COLORS[key]}
      label={retrying ? `opnieuw (${task.attempts}/${task.maxAttempts})` : statusLabel(key)}
    />
  );
}

export const TRIGGER_LABELS: Record<string, string> = {
  schedule: "schema",
  manual: "handmatig",
  app: "applicatie",
};
