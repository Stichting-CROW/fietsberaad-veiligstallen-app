import type { NextApiRequest, NextApiResponse } from "next";
import { accountBuurtstallingAction, listMineAllSites } from "~/modules/buurtstallingen/application/citizen";
import { DomainError } from "~/modules/buurtstallingen/domain/types";
import { mySubscriptions, sessionAccountId } from "~/modules/citizen-accounts/service";

const ACTIONS = new Set(["accept", "decline", "cancel", "leave"]);

export default async function handle(req: NextApiRequest, res: NextApiResponse) {
  const accountId = sessionAccountId(req);
  if (!accountId) {
    res.status(401).json({ error: "Log in om verder te gaan" });
    return;
  }
  if (req.method === "GET") {
    const [subscriptions, buurtstallingen] = await Promise.all([mySubscriptions(accountId), listMineAllSites(accountId)]);
    res.status(200).json({ subscriptions, ...buurtstallingen });
    return;
  }
  if (req.method !== "POST") {
    res.status(405).json({ error: "Methode niet toegestaan" });
    return;
  }
  const action = typeof req.body?.action === "string" ? req.body.action : "";
  if (!ACTIONS.has(action)) {
    res.status(400).json({ error: "Onbekende actie" });
    return;
  }
  try {
    const subscriptionTypeId = Number(req.body?.subscriptionTypeId);
    res.status(200).json(await accountBuurtstallingAction({
      accountId,
      action: action as "accept" | "decline" | "cancel" | "leave",
      placeId: typeof req.body?.placeId === "string" ? req.body.placeId : undefined,
      entryId: typeof req.body?.entryId === "string" ? req.body.entryId : undefined,
      subscriptionTypeId: Number.isInteger(subscriptionTypeId) && subscriptionTypeId > 0 ? subscriptionTypeId : null,
    }));
  } catch (error) {
    if (!(error instanceof DomainError)) console.error("account buurtstallingen", error);
    res.status(400).json({ error: error instanceof DomainError ? error.message : "De actie is mislukt" });
  }
}
