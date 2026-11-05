import type { NextApiRequest, NextApiResponse } from "next";
import { requireSuperadmin, sendError } from "~/server/background/api";
import { getSettings } from "~/server/background/db";
import { decideInternalTick } from "~/server/background/internal-tick";
import { scheduleRunStats } from "~/server/background/queue";
import { TASKS } from "~/server/background/registry";
import { listSchedules } from "~/server/background/scheduler";

export default async function handle(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (!(await requireSuperadmin(req, res))) return;

  try {
    const [schedules, stats, settings] = await Promise.all([listSchedules(), scheduleRunStats(), getSettings()]);
    return res.status(200).json({
      now: new Date().toISOString(),
      settings,
      internalTick: {
        ...decideInternalTick(process.env),
        running: Boolean((globalThis as { __vsBackgroundTimer?: unknown }).__vsBackgroundTimer),
      },
      taskTypes: Object.entries(TASKS).map(([type, def]) => ({ type, label: def.label })),
      schedules: schedules.map((schedule) => ({
        ...schedule,
        lastRun: stats.get(schedule.key)?.last ?? null,
        avgDurationMs: stats.get(schedule.key)?.avgDurationMs ?? null,
      })),
    });
  } catch (error) {
    return sendError(res, error);
  }
}
