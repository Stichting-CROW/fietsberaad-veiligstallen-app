import type { NextApiRequest, NextApiResponse } from "next";
import { requireSuperadmin, sendError, sessionUserLabel } from "~/server/background/api";
import { kickTask } from "~/server/background/runner";
import { runScheduleNow, updateSchedule } from "~/server/background/scheduler";

/** PATCH { enabled?, cron? } edits a schedule; POST runs it now. */
export default async function handle(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "PATCH" && req.method !== "POST") {
    res.setHeader("Allow", "PATCH, POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const session = await requireSuperadmin(req, res);
  if (!session) return;
  const key = String(req.query.key);

  try {
    if (req.method === "POST") {
      const taskId = await runScheduleNow(key, sessionUserLabel(session));
      kickTask(taskId);
      return res.status(200).json({ ok: true, taskId });
    }
    const body = (req.body ?? {}) as { enabled?: unknown; cron?: unknown };
    const schedule = await updateSchedule(key, {
      enabled: typeof body.enabled === "boolean" ? body.enabled : undefined,
      cron: typeof body.cron === "string" ? body.cron : undefined,
    });
    return res.status(200).json({ ok: true, schedule });
  } catch (error) {
    return sendError(res, error, 400);
  }
}
