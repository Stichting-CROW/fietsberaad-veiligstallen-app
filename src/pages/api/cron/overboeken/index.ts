import type { NextApiRequest, NextApiResponse } from "next";
import { overboekenCronGate } from "~/modules/citizen-accounts/overboeken";
import { runOverboekenCatchUp } from "~/modules/citizen-accounts/service";

export default async function handle(req: NextApiRequest, res: NextApiResponse) {
  const authorization = Array.isArray(req.headers.authorization) ? req.headers.authorization[0] : req.headers.authorization;
  const gate = overboekenCronGate({
    method: req.method,
    authorization,
    cronSecret: process.env.CRON_SECRET,
    enabled: process.env.OVERBOEKEN_CRON_ENABLED,
  });
  if (gate.kind === "method") {
    res.setHeader("Allow", "GET, POST");
    res.status(405).json({ message: "Method not allowed" });
    return;
  }
  if (gate.kind === "unauthorized") {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }
  if (gate.kind === "disabled") {
    res.status(200).json({ ok: true, skipped: true, reason: "OVERBOEKEN_CRON_ENABLED is not 1" });
    return;
  }
  try {
    const result = await runOverboekenCatchUp();
    res.status(200).json({ ok: true, result });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ ok: false, message });
  }
}
