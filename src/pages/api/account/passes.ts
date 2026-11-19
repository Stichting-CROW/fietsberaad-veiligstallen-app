import type { NextApiRequest, NextApiResponse } from "next";
import { AccountError, linkPass, sessionAccountId, unlinkPass } from "~/modules/citizen-accounts/service";

export default async function handle(req: NextApiRequest, res: NextApiResponse) {
  const accountId = sessionAccountId(req);
  if (!accountId) {
    res.status(401).json({ error: "Log in om verder te gaan" });
    return;
  }
  try {
    if (req.method === "POST") {
      const result = await linkPass(accountId, {
        pasId: String(req.body?.pasId ?? ""),
        pasType: req.body?.pasType === "ovchip" ? "ovchip" : "sleutelhanger",
        name: req.body?.name ? String(req.body.name) : undefined,
        siteId: req.body?.siteId ? String(req.body.siteId) : undefined,
      });
      res.status(200).json(result);
      return;
    }
    if (req.method === "DELETE") {
      await unlinkPass(accountId, String(req.body?.id ?? req.query.id ?? ""));
      res.status(200).json({ ok: true });
      return;
    }
    res.status(405).json({ error: "Methode niet toegestaan" });
  } catch (error) {
    const message = error instanceof AccountError ? error.message : "Pas niet opgeslagen";
    res.status(400).json({ error: message });
  }
}
