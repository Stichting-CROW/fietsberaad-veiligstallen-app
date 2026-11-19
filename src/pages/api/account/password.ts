import type { NextApiRequest, NextApiResponse } from "next";
import { AccountError, requestPasswordReset, resetPassword } from "~/modules/citizen-accounts/service";
import { siteOrigin } from "~/utils/server/site-origin";

export default async function handle(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Methode niet toegestaan" });
    return;
  }
  try {
    const origin = siteOrigin(req);
    if (req.body?.token) {
      await resetPassword(String(req.body.token), String(req.body.password ?? ""));
      res.status(200).json({ ok: true });
      return;
    }
    await requestPasswordReset(String(req.body?.email ?? ""), origin);
    res.status(200).json({ ok: true });
  } catch (error) {
    const message = error instanceof AccountError ? error.message : "Wachtwoord niet gewijzigd";
    res.status(400).json({ error: message });
  }
}
