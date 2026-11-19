import type { NextApiRequest, NextApiResponse } from "next";
import { processQueues } from "~/server/services/queue/processor";

/**
 * GET: Trigger the Next.js queue processor (new_wachtrij_* / new_bezettingsdata_tmp → production tables).
 * A managed check-out also writes transacties_archief in the same queue run.
 * Secured via CRON_SECRET: Authorization: Bearer <CRON_SECRET>.
 * Local: curl http://localhost:3000/api/cron/process-queues
 * No in-repo schedule; production must call this (or the simulation Process action) or the queue sits.
 * For use by an external scheduler.
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
        managedTransacties: result.managedTransacties,
        betalingen: result.betalingen,
        sync: result.sync,
        occupation: result.occupation,
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[cron/process-queues] Error:", msg);
    return res.status(500).json({ ok: false, message: "Fout: " + msg });
  }
}
