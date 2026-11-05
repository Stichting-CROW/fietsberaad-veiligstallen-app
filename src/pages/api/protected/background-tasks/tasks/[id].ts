import type { NextApiRequest, NextApiResponse } from "next";
import { requireSuperadmin, sendError } from "~/server/background/api";
import { cancelTask, getTaskDetail, releaseTask, retryTask } from "~/server/background/queue";
import { kickTask } from "~/server/background/runner";

/** GET returns the task; POST { action: "retry" | "release" | "cancel" } changes it. */
export default async function handle(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (!(await requireSuperadmin(req, res))) return;

  const id = Number(req.query.id);
  if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: "Ongeldig id" });

  try {
    if (req.method === "POST") {
      const action = (req.body as { action?: unknown } | undefined)?.action;
      let changed: boolean;
      if (action === "retry") changed = await retryTask(id);
      else if (action === "release") changed = await releaseTask(id);
      else if (action === "cancel") changed = await cancelTask(id);
      else return res.status(400).json({ error: "Onbekende actie" });
      if (!changed) return res.status(409).json({ error: "De taak heeft niet (meer) de juiste status voor deze actie" });
      if (action !== "cancel") kickTask(id);
    }
    const task = await getTaskDetail(id);
    if (!task) return res.status(404).json({ error: "Taak niet gevonden" });
    return res.status(200).json({ task });
  } catch (error) {
    return sendError(res, error);
  }
}
