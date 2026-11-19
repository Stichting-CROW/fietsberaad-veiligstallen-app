import type { NextApiRequest, NextApiResponse } from "next";
import { runBulkReservationRollForward } from "~/server/services/bulk-reservations/service";

export default async function handle(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST" && req.method !== "GET") {
    res.setHeader("Allow", "GET, POST");
    res.status(405).json({ message: "Method not allowed" });
    return;
  }
  const token = req.headers.authorization?.startsWith("Bearer ")
    ? req.headers.authorization.slice(7)
    : null;
  const expected = process.env.CRON_SECRET;
  if (expected && token !== expected) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }
  try {
    const result = await runBulkReservationRollForward(new Date());
    res.status(200).json({ ok: true, result });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ ok: false, message });
  }
}
