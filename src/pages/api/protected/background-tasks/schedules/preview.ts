import type { NextApiRequest, NextApiResponse } from "next";
import { requireSuperadmin } from "~/server/background/api";
import { DEFAULT_TIMEZONE, describeCron, nextRuns, validateCron } from "~/server/background/cron";

export default async function handle(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (!(await requireSuperadmin(req, res))) return;

  const cron = String(req.query.cron ?? "");
  const timezone = typeof req.query.timezone === "string" && req.query.timezone ? req.query.timezone : DEFAULT_TIMEZONE;
  const problem = validateCron(cron, timezone);
  if (problem) return res.status(200).json({ valid: false, error: problem });
  return res.status(200).json({
    valid: true,
    description: describeCron(cron),
    nextRuns: nextRuns(cron, timezone, 5).map((date) => date.toISOString()),
  });
}
