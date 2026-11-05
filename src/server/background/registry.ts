import { DEFAULT_TIMEZONE } from "./cron";

export type TaskContext = {
  taskId: number;
  payload: unknown;
  attempt: number;
  signal: AbortSignal;
};

export type TaskDefinition = {
  label: string;
  /** Default 1 for scheduled tasks: the next slot is the retry. */
  maxAttempts?: number;
  /** Seeded once into background_schedules; later edits on the beheer screen win. */
  schedule?: {
    cron: string;
    timezone?: string;
    enabledByDefault: () => boolean;
  };
  run: (ctx: TaskContext) => Promise<unknown>;
};

const isProduction = () => process.env.NEXT_PUBLIC_APP_ENV === "production";
const always = () => true;
const never = () => false;

function payloadObject(payload: unknown): Record<string, unknown> {
  return payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
}

export const TASKS: Record<string, TaskDefinition> = {
  "process-queues": {
    label: "Wachtrij verwerken (FMS)",
    // Production queues are still processed by ColdFusion.
    schedule: { cron: "* * * * *", enabledByDefault: () => !isProduction() },
    run: async () => {
      const { processQueues } = await import("~/server/services/queue/processor");
      const result = await processQueues();
      return {
        pasids: result.pasids,
        managedTransacties: result.managedTransacties,
        betalingen: result.betalingen,
        sync: result.sync,
        occupation: result.occupation,
      };
    },
  },
  "buurtstallingen-jobs": {
    label: "Buurtstallingen: reserveringen verlopen en wachtlijst mailen",
    schedule: { cron: "*/5 * * * *", enabledByDefault: always },
    run: async () => {
      const { expireDue, mailDueWaitingList } = await import("~/modules/buurtstallingen/application/service");
      const expired = await expireDue();
      const reminded = await mailDueWaitingList();
      return { expired, reminded };
    },
  },
  abonnementen: {
    label: "Abonnementen: verlengen en verlopen",
    schedule: { cron: "30 3 * * *", enabledByDefault: always },
    run: async () => {
      const { runSubscriptionLifecycle } = await import("~/modules/citizen-accounts/service");
      return runSubscriptionLifecycle(new Date());
    },
  },
  bulkreserveringen: {
    label: "Bulkreserveringen doorrollen",
    schedule: { cron: "2 4 * * *", enabledByDefault: always },
    run: async () => {
      const { runBulkReservationRollForward } = await import("~/server/services/bulk-reservations/service");
      return runBulkReservationRollForward(new Date());
    },
  },
  "transacties-gemeente-totaal": {
    label: "Transacties per gemeente (jaartotaal)",
    schedule: { cron: "15 4 * * *", enabledByDefault: always },
    run: async () => {
      const { updateTransactiesGemeenteTotaalForYear } = await import("~/server/services/transacties-gemeente-totaal-service");
      return updateTransactiesGemeenteTotaalForYear();
    },
  },
  overboeken: {
    label: "Overboeken (inhaalslag)",
    schedule: { cron: "52 4 * * *", enabledByDefault: always },
    run: async () => {
      if (process.env.OVERBOEKEN_CRON_ENABLED !== "1") {
        return { skipped: true, reason: "OVERBOEKEN_CRON_ENABLED is not 1" };
      }
      const { runOverboekenCatchUp } = await import("~/modules/citizen-accounts/service");
      return runOverboekenCatchUp();
    },
  },
  "ns-locations": {
    label: "NS-locaties synchroniseren",
    schedule: { cron: "5 5 * * *", enabledByDefault: always },
    run: async () => {
      const { syncNsLocations } = await import("~/server/services/ns-connector/sync");
      return syncNsLocations({ dryRun: false });
    },
  },
  "update-cache": {
    label: "Rapportage-caches bijwerken",
    schedule: { cron: "30 5 * * *", enabledByDefault: always },
    run: async (ctx) => {
      const { updateReportCaches } = await import("~/backend/services/reports/updateReportCaches");
      const from = payloadObject(ctx.payload).from;
      const logEntry = await updateReportCaches(typeof from === "string" ? from : undefined);
      if (!logEntry.success) {
        throw new Error(`Cache update deels mislukt:${logEntry.summaryText ?? ""}`);
      }
      return { summaryText: logEntry.summaryText };
    },
  },
  "info-files": {
    label: "Infobestanden genereren",
    // The ColdFusion Logic App vstinfofiles still serves these files.
    schedule: { cron: "*/30 0-2,5-23 * * *", timezone: "UTC", enabledByDefault: never },
    run: async () => {
      const { generateInfoFiles } = await import("~/server/services/info-files/generate");
      return generateInfoFiles();
    },
  },
  "privacy-retention": {
    label: "Privacy: retentie en anonimisering",
    schedule: { cron: "30 3 * * *", enabledByDefault: never },
    run: async (ctx) => {
      const { cronTick } = await import("~/server/privacy/retention-service");
      const write = payloadObject(ctx.payload).write === true;
      for (let step = 1; step <= 50; step++) {
        const result = await cronTick(write);
        if (result.done || ctx.signal.aborted) {
          return { done: result.done, steps: step, skipped: result.skipped ?? null, runId: result.run?.id ?? null, status: result.run?.status ?? null };
        }
      }
      throw new Error("Privacy-retentie niet klaar na 50 stappen");
    },
  },
  "contactpersonen-reminders": {
    label: "Herinneringsmail contactpersonen",
    schedule: { cron: "0 9 * * *", enabledByDefault: never },
    run: async () => {
      const { REMINDER_START_DATE_UTC, isReminderProductionEnvironment, sendAutoReminderEmails } = await import(
        "~/utils/server/contactpersonen-reminder-mail"
      );
      if (!isReminderProductionEnvironment()) {
        return { skipped: true, reason: "Not running in production environment" };
      }
      const now = new Date();
      if (now < REMINDER_START_DATE_UTC) {
        return { skipped: true, reason: "Start date not reached" };
      }
      return sendAutoReminderEmails(now);
    },
  },
  "cleanup-tasks": {
    label: "Achtergrondtaken: oude logregels opruimen",
    schedule: { cron: "45 2 * * *", enabledByDefault: always },
    run: async () => {
      const { cleanupOldTasks } = await import("./queue");
      return cleanupOldTasks();
    },
  },
};

export function getTask(type: string): TaskDefinition | undefined {
  return Object.prototype.hasOwnProperty.call(TASKS, type) ? TASKS[type] : undefined;
}

export function scheduleDefaults() {
  return Object.entries(TASKS)
    .filter(([, def]) => def.schedule)
    .map(([type, def]) => ({
      key: type,
      taskType: type,
      cron: def.schedule!.cron,
      timezone: def.schedule!.timezone ?? DEFAULT_TIMEZONE,
      enabled: def.schedule!.enabledByDefault(),
    }));
}
