import type { NextApiRequest, NextApiResponse } from "next";
import { runSubscriptionLifecycle } from "~/modules/citizen-accounts/service";

export default async function handle(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST" && req.method !== "GET") {
    res.setHeader("Allow", "GET, POST");
    res.status(405).json({ message: "Method not allowed" });
    return;
  }
  const token = req.headers.authorization?.startsWith("Bearer ") ? req.headers.authorization.slice(7) : null;
  const expected = process.env.CRON_SECRET;
  if (expected && token !== expected) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }
  try {
    const scopedAccount = process.env.BUURTSTALLINGEN_MAIL_CAPTURE && req.body?.accountId
      ? String(req.body.accountId)
      : undefined;
    const result = await runSubscriptionLifecycle(new Date(), scopedAccount);
    res.status(200).json({ ok: true, result });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ ok: false, message });
  }
}
