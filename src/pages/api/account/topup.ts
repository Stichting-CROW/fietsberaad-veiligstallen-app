import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "~/server/db";
import { siteOrigin } from "~/utils/server/site-origin";
import { AccountError, listProducts, recalculateSaldo, sessionAccountId, startTopup, topupStatus } from "~/modules/citizen-accounts/service";

export default async function handle(req: NextApiRequest, res: NextApiResponse) {
  try {
    const accountId = sessionAccountId(req);
    if (req.method === "GET") {
      const [products, settings] = await Promise.all([
        listProducts(),
        prisma.instellingen.findFirst({ select: { TransactiekostenIdeal: true, Ideal: true } }),
      ]);
      const transactionID = typeof req.query.transactionID === "string" ? req.query.transactionID : "";
      const paymentStatus = accountId && transactionID ? await topupStatus(accountId, transactionID) : null;
      res.status(200).json({
        products: products.map((product) => ({
          id: product.ID,
          titel: product.titel,
          credit: product.credit === null ? 0 : Number(product.credit),
          prijs: product.prijs === null ? 0 : Number(product.prijs),
        })),
        fee: Number(settings?.TransactiekostenIdeal ?? 0),
        ideal: settings?.Ideal ?? true,
        saldo: accountId ? await recalculateSaldo(accountId) : null,
        paymentStatus,
      });
      return;
    }
    if (req.method !== "POST") {
      res.status(405).json({ error: "Methode niet toegestaan" });
      return;
    }
    if (!accountId) {
      res.status(401).json({ error: "Log in om verder te gaan" });
      return;
    }
    const origin = siteOrigin(req);
    const productId = req.body?.productId === "saldotekort" ? "saldotekort" : Number(req.body?.productId);
    const result = await startTopup(accountId, productId, origin);
    res.status(200).json(result);
  } catch (error) {
    console.error("account topup", error);
    const message = error instanceof AccountError
      ? error.message
      : error instanceof Error && error.message
        ? error.message
        : "Opwaarderen mislukt";
    res.status(400).json({ error: message });
  }
}
