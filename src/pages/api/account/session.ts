import type { NextApiRequest, NextApiResponse } from "next";
import { citizenCookieHeader, clearCitizenCookieHeader } from "~/modules/citizen-accounts/auth";
import { AccountError, registerAccount, signInAccount } from "~/modules/citizen-accounts/service";

export default async function handle(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === "DELETE") {
    res.setHeader("Set-Cookie", clearCitizenCookieHeader());
    res.status(200).json({ ok: true });
    return;
  }
  if (req.method !== "POST") {
    res.status(405).json({ error: "Methode niet toegestaan" });
    return;
  }
  try {
    const email = String(req.body?.email ?? "");
    const password = String(req.body?.password ?? "");
    const result = req.body?.register
      ? await registerAccount({
          email,
          password,
          nieuwsbrief: Boolean(req.body?.nieuwsbrief),
          siteId: req.body?.siteId ? String(req.body.siteId) : null,
        })
      : await signInAccount(email, password);
    res.setHeader("Set-Cookie", citizenCookieHeader(result.token));
    res.status(200).json({ accountId: result.accountId });
  } catch (error) {
    const message = error instanceof AccountError ? error.message : "Inloggen mislukt";
    res.status(400).json({ error: message });
  }
}
