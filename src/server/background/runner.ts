import os from "os";
import { getSettings, setSetting } from "./db";
import {
  LEASE_MS,
  claimNextTask,
  completeTask,
  failTask,
  heartbeatTask,
  type ClaimedTask,
} from "./queue";
import { getTask } from "./registry";
import { enqueueDueSchedules, type SchedulerSummary } from "./scheduler";

export type TickSource = "external" | "internal" | "internal-dev" | "manual";

type FinishedTask = { id: number; type: string; status: "done" | "queued" | "failed" | "cancelled"; durationMs: number };

export type TickSummary = {
  source: TickSource;
  at: string;
  paused: boolean;
  scheduler: SchedulerSummary | null;
  started: { id: number; type: string }[];
  finished: FinishedTask[];
  stillRunning: { id: number; type: string }[];
};

type WorkerState = {
  workerId: string;
  active: Map<number, string>;
  claiming: Promise<void>;
  wake: () => void;
  wakeSignal: Promise<void>;
};

const globalForWorker = globalThis as unknown as { __vsBackgroundWorker?: WorkerState };

function workerState(): WorkerState {
  if (!globalForWorker.__vsBackgroundWorker) {
    const instance = process.env.WEBSITE_INSTANCE_ID?.slice(0, 8);
    const state: WorkerState = {
      workerId: [os.hostname(), instance, process.pid].filter(Boolean).join(":").slice(0, 128),
      active: new Map(),
      claiming: Promise.resolve(),
      wake: () => undefined,
      wakeSignal: Promise.resolve(),
    };
    resetWake(state);
    globalForWorker.__vsBackgroundWorker = state;
  }
  return globalForWorker.__vsBackgroundWorker;
}

function resetWake(state: WorkerState) {
  state.wakeSignal = new Promise<void>((resolve) => {
    state.wake = () => {
      resetWake(state);
      resolve();
    };
  });
}

function maxConcurrency(): number {
  const value = Number(process.env.BACKGROUND_CONCURRENCY);
  return Number.isFinite(value) && value >= 1 ? Math.floor(value) : 3;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, Math.max(0, ms)));

async function execute(task: ClaimedTask, state: WorkerState, onFinish: (finished: FinishedTask) => void) {
  const controller = new AbortController();
  const startedAt = Date.now();
  const heartbeat = setInterval(() => {
    heartbeatTask(task.id, state.workerId)
      .then((stillOurs) => {
        if (!stillOurs) controller.abort();
      })
      .catch((error) => console.error("[background] heartbeat failed", task.id, error));
  }, LEASE_MS / 4);
  let status: FinishedTask["status"];
  try {
    const def = getTask(task.type);
    if (!def) throw new Error(`Onbekend taaktype: ${task.type}`);
    const result = await def.run({ taskId: task.id, payload: task.payload, attempt: task.attempts, signal: controller.signal });
    if (controller.signal.aborted) {
      status = "cancelled";
    } else {
      await completeTask(task.id, state.workerId, result, Date.now() - startedAt);
      status = "done";
    }
  } catch (error) {
    console.error(`[background] task ${task.id} (${task.type}) failed:`, error instanceof Error ? error.message : error);
    status = controller.signal.aborted
      ? "cancelled"
      : await failTask(task, state.workerId, error, Date.now() - startedAt).catch(() => "failed" as const);
  } finally {
    clearInterval(heartbeat);
    state.active.delete(task.id);
  }
  onFinish({ id: task.id, type: task.type, status, durationMs: Date.now() - startedAt });
  state.wake();
}

/** Claims tasks until all slots are busy or nothing is due. Serialised per process. */
function fillSlots(
  state: WorkerState,
  onStart: (task: ClaimedTask) => void,
  onFinish: (finished: FinishedTask) => void,
  onlyTaskId?: number,
) {
  const run = state.claiming.then(async () => {
    while (state.active.size < maxConcurrency()) {
      const task = await claimNextTask(state.workerId, new Date(), onlyTaskId);
      if (!task) return;
      state.active.set(task.id, task.type);
      onStart(task);
      void execute(task, state, onFinish);
    }
  });
  state.claiming = run.catch(() => undefined);
  return run;
}

async function recordTick(source: TickSource, at: Date) {
  await setSetting("last_tick_at", at.toISOString());
  await setSetting("last_tick_source", source);
}

/**
 * Enqueues due schedules and works the queue for up to `budgetMs`.
 * Tasks still running when the budget ends keep running in this process; the summary lists them.
 * With `onlyTaskId` the scheduler is skipped and only that task is claimed, also while paused.
 */
export async function runTick(options: { source: TickSource; budgetMs?: number; onlyTaskId?: number }): Promise<TickSummary> {
  const state = workerState();
  const at = new Date();
  const deadline = at.getTime() + (options.budgetMs ?? 90_000);
  if (options.source !== "manual") await recordTick(options.source, at);
  const settings = await getSettings();
  const summary: TickSummary = {
    source: options.source,
    at: at.toISOString(),
    paused: settings.paused,
    scheduler: null,
    started: [],
    finished: [],
    stillRunning: [],
  };
  if (options.onlyTaskId === undefined) {
    summary.scheduler = await enqueueDueSchedules(at, { paused: settings.paused });
    if (settings.paused) return summary;
  }

  const mine = new Set<number>();
  const onStart = (task: ClaimedTask) => {
    mine.add(task.id);
    summary.started.push({ id: task.id, type: task.type });
  };
  const onFinish = (finished: FinishedTask) => {
    if (!mine.has(finished.id)) return;
    mine.delete(finished.id);
    summary.finished.push(finished);
  };

  while (Date.now() < deadline) {
    const wake = state.wakeSignal;
    await fillSlots(state, onStart, onFinish, options.onlyTaskId);
    if (mine.size === 0 && (state.active.size < maxConcurrency() || options.onlyTaskId !== undefined)) break;
    await Promise.race([wake, sleep(deadline - Date.now())]);
  }
  summary.stillRunning = [...mine].map((id) => ({ id, type: state.active.get(id) ?? "?" }));
  return summary;
}

/** Fire-and-forget run of one task, e.g. right after "Nu uitvoeren". */
export function kickTask(taskId: number): void {
  void runTick({ source: "manual", budgetMs: 5_000, onlyTaskId: taskId }).catch((error) =>
    console.error("[background] tick failed:", error instanceof Error ? error.message : error),
  );
}
