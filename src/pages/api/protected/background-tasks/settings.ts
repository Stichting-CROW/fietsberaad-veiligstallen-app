import type { NextApiRequest, NextApiResponse } from "next";
import { requireSuperadmin, sendError } from "~/server/background/api";
import { getSettings, setSetting } from "~/server/background/db";

function days(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 3650 ? parsed : null;
}

/** PATCH { paused?, retentionDoneDays?, retentionFailedDays? } */
export default async function handle(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "PATCH") {
    res.setHeader("Allow", "PATCH");
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (!(await requireSuperadmin(req, res))) return;

  const body = (req.body ?? {}) as Record<string, unknown>;
  try {
    if (typeof body.paused === "boolean") await setSetting("paused", body.paused ? "1" : "0");
    for (const [field, key] of [
      ["retentionDoneDays", "retention_done_days"],
      ["retentionFailedDays", "retention_failed_days"],
    ] as const) {
      if (body[field] === undefined) continue;
      const value = days(body[field]);
      if (value === null) return res.status(400).json({ error: `${field} moet tussen 1 en 3650 dagen liggen` });
      await setSetting(key, String(value));
    }
    return res.status(200).json({ ok: true, settings: await getSettings() });
  } catch (error) {
    return sendError(res, error);
  }
}
