import type { NextApiRequest, NextApiResponse } from "next";
import { runTick } from "~/server/background/runner";

/**
 * Single clock for all background tasks: call every minute with Authorization: Bearer <CRON_SECRET>.
 * Enqueues due schedules from background_schedules and works the queue for up to ~90 seconds.
 */
export default async function handle(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST" && req.method !== "GET") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ message: "Method not allowed" });
  }

  const token = req.headers.authorization?.startsWith("Bearer ") ? req.headers.authorization.slice(7) : null;
  const expected = process.env.CRON_SECRET;
  if (!expected && process.env.NODE_ENV === "production") {
    return res.status(503).json({ message: "CRON_SECRET is not configured" });
  }
  if (expected && token !== expected) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  try {
    const summary = await runTick({ source: "external" });
    return res.status(200).json({ ok: true, summary });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[cron/tick] Error:", message);
    return res.status(500).json({ ok: false, message });
  }
}
