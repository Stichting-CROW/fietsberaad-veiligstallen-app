import type { NextApiRequest, NextApiResponse } from "next";
import { clearCitizenCookieHeader } from "~/modules/citizen-accounts/auth";
import { AccountError, accountHome, deleteAccount, sessionAccountId, updateProfile } from "~/modules/citizen-accounts/service";

export default async function handle(req: NextApiRequest, res: NextApiResponse) {
  const accountId = sessionAccountId(req);
  if (!accountId) {
    res.status(401).json({ error: "Log in om verder te gaan" });
    return;
  }
  try {
    if (req.method === "GET") {
      res.status(200).json(await accountHome(accountId));
      return;
    }
    if (req.method === "POST") {
      await updateProfile(accountId, req.body ?? {});
      res.status(200).json({ ok: true });
      return;
    }
    if (req.method === "DELETE") {
      await deleteAccount(accountId);
      res.setHeader("Set-Cookie", clearCitizenCookieHeader());
      res.status(200).json({ ok: true });
      return;
    }
    res.status(405).json({ error: "Methode niet toegestaan" });
  } catch (error) {
    const message = error instanceof AccountError ? error.message : "Opslaan mislukt";
    res.status(400).json({ error: message });
  }
}
