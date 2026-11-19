import type { NextApiRequest, NextApiResponse } from "next";
import { requireSuperadmin, sendError } from "~/server/background/api";
import { runTick } from "~/server/background/runner";

/** "Tick nu": one scheduler pass plus a short queue run. Does not count as a clock tick for the health badge. */
export default async function handle(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (!(await requireSuperadmin(req, res))) return;

  try {
    const summary = await runTick({ source: "manual", budgetMs: 15_000 });
    return res.status(200).json({ ok: true, summary });
  } catch (error) {
    return sendError(res, error);
  }
}
