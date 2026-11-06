import type { NextApiRequest, NextApiResponse } from "next";
import { updateTransactiesGemeenteTotaalForYear } from "~/server/services/transacties-gemeente-totaal-service";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).end();
  }
  const token = req.headers.authorization?.startsWith("Bearer ")
    ? req.headers.authorization.slice(7)
    : null;
  const expected = process.env.CRON_SECRET;
  if (expected && token !== expected) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  try {
    const summary = await updateTransactiesGemeenteTotaalForYear();
    return res.status(200).json({ ok: true, summary });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return res.status(500).json({ ok: false, message });
  }
}
