import type { NextApiRequest, NextApiResponse } from "next";
import { siteOrigin } from "~/utils/server/site-origin";
import {
  AccountError,
  buySubscription,
  listSubscriptionCatalog,
  paySubscription,
  relinkSubscriptionPass,
  resolveSubscriptionRef,
  sessionAccountId,
  subscriptionRelinkCheckout,
  subscriptionCheckout,
  subscriptionDocument,
} from "~/modules/citizen-accounts/service";

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

async function subscriptionIdFrom(ref: unknown): Promise<number> {
  const id = await resolveSubscriptionRef(ref);
  if (id === null) throw new AccountError("Abonnement niet gevonden");
  return id;
}

async function optionalSubscriptionIdFrom(ref: unknown): Promise<number | undefined> {
  return ref ? subscriptionIdFrom(ref) : undefined;
}

export default async function handle(req: NextApiRequest, res: NextApiResponse) {
  const accountId = sessionAccountId(req);
  try {
    if (req.method === "GET") {
      if (req.query.id || req.query.formId || req.query.subscriptionId) {
        if (!accountId) {
          res.status(401).json({ error: "Log in om verder te gaan" });
          return;
        }
        if (req.query.id) {
          const transactionId = text(req.query.transactionID) || undefined;
          res.status(200).json(await subscriptionDocument(accountId, await subscriptionIdFrom(req.query.id), transactionId));
          return;
        }
        if (req.query.subscriptionId) {
          res.status(200).json(await subscriptionRelinkCheckout(accountId, await subscriptionIdFrom(req.query.subscriptionId)));
          return;
        }
        res.status(200).json(await subscriptionCheckout(accountId, Number(req.query.formId)));
        return;
      }
      if (!req.query.siteId) {
        res.status(400).json({ error: "Kies eerst een gemeente" });
        return;
      }
      res.status(200).json(await listSubscriptionCatalog(text(req.query.siteId), {
        parkingId: text(req.query.parkingId) || undefined,
        prolongId: await optionalSubscriptionIdFrom(req.query.prolongId),
        accountId,
      }));
      return;
    }
    if (req.method !== "POST") {
      res.status(405).json({ error: "Methode niet toegestaan" });
      return;
    }
    const origin = siteOrigin(req);
    if (req.body?.subscriptionId) {
      if (!accountId) {
        res.status(401).json({ error: "Log in om verder te gaan" });
        return;
      }
      if (req.body.mode === "relink") {
        res.status(200).json(await relinkSubscriptionPass({
          accountId,
          subscriptionId: await subscriptionIdFrom(req.body.subscriptionId),
          pass: {
            passID: text(req.body.passID),
            newPass: text(req.body.newPass),
            newPassName: text(req.body.newPassName),
          },
          acceptedConditions: req.body.acceptedConditions === true,
          source: text(req.body.source),
          origin,
        }));
        return;
      }
      res.status(200).json(await paySubscription(accountId, await subscriptionIdFrom(req.body.subscriptionId), origin));
      return;
    }
    const result = await buySubscription({
      accountId,
      formId: Number(req.body?.formId),
      origin,
      prolongId: await optionalSubscriptionIdFrom(req.body?.prolongId),
      pass: {
        passID: text(req.body?.passID),
        newPass: text(req.body?.newPass),
        newPassName: text(req.body?.newPassName),
      },
      acceptedConditions: req.body?.acceptedConditions === true,
    });
    res.status(200).json(result);
  } catch (error) {
    if (!(error instanceof AccountError)) console.error("account abonnement", error);
    const message = error instanceof AccountError ? error.message : "Abonnement niet aangemaakt";
    res.status(400).json({ error: message });
  }
}
