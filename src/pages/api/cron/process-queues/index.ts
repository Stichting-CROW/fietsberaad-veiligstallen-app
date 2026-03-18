import type { NextApiRequest, NextApiResponse } from "next";
import { processQueues } from "~/server/services/queue/processor";

/**
 * GET: Trigger the Next.js queue processor (new_wachtrij_* → new_*).
 * Secured via CRON_SECRET: Authorization: Bearer <CRON_SECRET>.
 * For use by Vercel Cron or external schedulers.
 */
export default async function handle(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ message: "Method not allowed" });
  }

  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  const expectedSecret = process.env.CRON_SECRET;

  if (expectedSecret && token !== expectedSecret) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  try {
    const result = await processQueues();
    return res.status(200).json({
      ok: true,
      result: {
        pasids: result.pasids,
        transacties: result.transacties,
        betalingen: result.betalingen,
        sync: result.sync,
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[cron/process-queues] Error:", msg);
    return res.status(500).json({ ok: false, message: "Fout: " + msg });
  }
}
