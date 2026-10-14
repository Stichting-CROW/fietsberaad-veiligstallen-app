import type { NextApiRequest, NextApiResponse } from "next";
import {
  AccountError,
  assertManagedAccount,
  creditorAccounts,
  deleteAccount,
  linkPass,
  operatorCreateAccount,
  operatorMailPasswordLink,
  operatorUpdateAccount,
  restituteSaldo,
  searchCitizenAccounts,
  searchSaldoAccounts,
  unlinkPass,
} from "~/modules/citizen-accounts/service";
import { requireCitizenBeheer } from "~/utils/server/citizen-beheer-access";
import { siteOrigin } from "~/utils/server/site-origin";

export default async function handle(req: NextApiRequest, res: NextApiResponse) {
  const access = await requireCitizenBeheer(req, res);
  if (!access) return;
  const { siteId } = access;
  try {
    if (req.method === "GET") {
      const query = String(req.query.q ?? "");
      if (req.query.saldo === "1") {
        res.status(200).json({ data: await searchSaldoAccounts(query, siteId) });
        return;
      }
      const creditors = req.query.creditors === "1";
      const data = creditors ? await creditorAccounts(siteId) : await searchCitizenAccounts(query, siteId);
      res.status(200).json({ data });
      return;
    }
    if (req.method === "POST") {
      const action = String(req.body?.action ?? "update");
      if (action === "create") {
        const created = await operatorCreateAccount({
          email: String(req.body.email ?? ""),
          firstName: String(req.body.firstName ?? ""),
          lastName: String(req.body.lastName ?? ""),
          siteId,
        });
        await operatorMailPasswordLink(created.accountId, siteId, siteOrigin(req));
        res.status(200).json(created);
        return;
      }
      const accountId = String(req.body?.accountId ?? "");
      await assertManagedAccount(accountId, siteId);
      if (action === "reset") {
        await operatorMailPasswordLink(accountId, siteId, siteOrigin(req));
        res.status(200).json({ ok: true });
        return;
      }
      if (action === "pass") {
        const result = await linkPass(accountId, {
          pasId: String(req.body.pasId ?? ""),
          pasType: req.body.pasType === "ovchip" ? "ovchip" : "sleutelhanger",
          name: req.body.name ? String(req.body.name) : undefined,
          siteId,
        });
        res.status(200).json(result);
        return;
      }
      if (action === "unlink") {
        await unlinkPass(accountId, String(req.body.passId));
        res.status(200).json({ ok: true });
        return;
      }
      if (action === "restitutie") {
        await restituteSaldo(accountId, Number(req.body.amount), String(req.body.exploitantId || siteId), siteId);
        res.status(200).json({ ok: true });
        return;
      }
      if (action === "delete") {
        await deleteAccount(accountId);
        res.status(200).json({ ok: true });
        return;
      }
      await operatorUpdateAccount(accountId, req.body);
      res.status(200).json({ ok: true });
      return;
    }
    res.status(405).json({ error: "Methode niet toegestaan" });
  } catch (error) {
    const message = error instanceof AccountError ? error.message : "Opslaan mislukt";
    res.status(400).json({ error: message });
  }
}
