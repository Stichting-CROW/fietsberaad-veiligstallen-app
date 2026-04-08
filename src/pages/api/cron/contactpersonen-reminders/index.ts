import type { NextApiRequest, NextApiResponse } from "next";
import {
  REMINDER_START_DATE_UTC,
  sendAutoReminderEmails,
} from "~/utils/server/contactpersonen-reminder-mail";

function isProductionEnvironment(): boolean {
  const explicit = process.env.REMINDER_RUNTIME_ENV?.trim().toLowerCase();
  if (explicit) {
    return explicit === "production" || explicit === "prod";
  }

  const nodeEnv = process.env.NODE_ENV?.trim().toLowerCase();
  if (nodeEnv) {
    return nodeEnv === "production";
  }

  const genericEnv = process.env.APP_ENV?.trim().toLowerCase();
  if (genericEnv) {
    return genericEnv === "production" || genericEnv === "prod";
  }

  return false;
}

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

  if (!isProductionEnvironment()) {
    return res.status(200).json({
      ok: true,
      skipped: true,
      reason: "Not running in production environment",
    });
  }

  const now = new Date();
  if (now < REMINDER_START_DATE_UTC) {
    return res.status(200).json({
      ok: true,
      skipped: true,
      reason: "Start date not reached",
      startDate: REMINDER_START_DATE_UTC.toISOString(),
    });
  }

  try {
    const result = await sendAutoReminderEmails(now);
    return res.status(200).json({ ok: true, skipped: false, ...result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[cron/contactpersonen-reminders] Error:", msg);
    return res.status(500).json({ ok: false, message: `Fout: ${msg}` });
  }
}
