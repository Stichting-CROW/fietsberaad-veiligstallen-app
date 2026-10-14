import type { NextApiRequest, NextApiResponse } from "next";
import { cronTick } from "~/server/privacy/retention-service";

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
  const write = req.query.write === "1";
  try {
    const result = await cronTick(write);
    return res.status(200).json({ ok: true, done: result.done, skipped: result.skipped ?? null, run: result.run });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return res.status(500).json({ ok: false, done: false, message });
  }
}
