import type { NextApiRequest, NextApiResponse } from "next";
import {
  AccountError,
  assertManagedAccount,
  createManagedSubscriptions,
  listManagedSubscriptions,
  updateManagedSubscription,
} from "~/modules/citizen-accounts/service";
import { requireCitizenBeheer } from "~/utils/server/citizen-beheer-access";

function optionalNumber(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return null;
  const number = Number(String(value).replace(",", "."));
  return Number.isFinite(number) ? number : null;
}

export default async function handle(req: NextApiRequest, res: NextApiResponse) {
  const access = await requireCitizenBeheer(req, res);
  if (!access) return;
  const { siteId } = access;
  try {
    if (req.method === "GET") {
      const rows = await listManagedSubscriptions(siteId, {
        search: typeof req.query.q === "string" ? req.query.q : undefined,
        runningOnly: req.query.alle === "1",
      });
      res.status(200).json({
        data: rows.map((row) => ({
          id: row.ID,
          email: row.accounts?.Email ?? "",
          name: row.abonnementsvormen?.naam ?? "",
          passName: row.accounts_pasids?.Naam ?? "",
          passType: row.accounts_pasids?.Pastype ?? "",
          passNumber: row.accounts_pasids?.PasID ?? "",
          mollieId: row.mollieTransactionID,
          paymentMethod: row.paymentMethod,
          start: row.ingangsdatum,
          end: row.afloopdatum,
          price: row.prijsInclBtw === null ? 0 : Number(row.prijsInclBtw),
          active: Boolean(row.isActief),
          paid: row.isBetaald,
          accountId: row.AccountID,
          formId: row.subscriptiontypeID,
          passId: row.bikepassID,
          pass: row.accounts_pasids ? `${row.accounts_pasids.Pastype}: ${row.accounts_pasids.PasID}` : "",
          barcode: row.barcode,
        })),
      });
      return;
    }
    if (req.method === "POST") {
      const accountId = req.body?.accountId ? String(req.body.accountId).trim() : "";
      if (accountId) await assertManagedAccount(accountId, siteId);
      const ids = await createManagedSubscriptions({
        siteId,
        accountId: accountId || null,
        formId: Number(req.body?.formId),
        start: String(req.body?.start ?? ""),
        end: String(req.body?.end ?? ""),
        cost: optionalNumber(req.body?.cost),
        passNumber: req.body?.passNumber ? String(req.body.passNumber) : undefined,
        bikepassId: req.body?.bikepassId ? String(req.body.bikepassId) : undefined,
        barcode: req.body?.barcode ? String(req.body.barcode) : undefined,
        count: optionalNumber(req.body?.count) ?? 1,
      });
      res.status(200).json({ ids });
      return;
    }
    if (req.method === "PUT") {
      const id = await updateManagedSubscription({
        siteId,
        id: Number(req.body?.id),
        start: String(req.body?.start ?? ""),
        end: String(req.body?.end ?? ""),
        extraCost: optionalNumber(req.body?.extraCost),
        bikepass: String(req.body?.bikepass ?? ""),
      });
      res.status(200).json({ id });
      return;
    }
    res.status(405).json({ error: "Methode niet toegestaan" });
  } catch (error) {
    const message = error instanceof AccountError ? error.message : "Abonnement niet opgeslagen";
    res.status(400).json({ error: message });
  }
}
