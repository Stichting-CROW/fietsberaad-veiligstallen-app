import type { NextApiRequest, NextApiResponse } from "next";
import { AccountError, parkingVisits, paymentList, sessionAccountId } from "~/modules/citizen-accounts/service";

export default async function handle(req: NextApiRequest, res: NextApiResponse) {
  const accountId = sessionAccountId(req);
  if (!accountId) {
    res.status(401).json({ error: "Log in om verder te gaan" });
    return;
  }
  if (req.method !== "GET") {
    res.status(405).json({ error: "Methode niet toegestaan" });
    return;
  }
  try {
    const now = new Date();
    const year = Number(req.query.year ?? now.getFullYear());
    const month = Number(req.query.month ?? now.getMonth() + 1);
    const [visits, payments] = await Promise.all([parkingVisits(accountId, year, month), paymentList(accountId)]);
    res.status(200).json({ visits, payments });
  } catch (error) {
    const message = error instanceof AccountError ? error.message : "Transacties niet geladen";
    res.status(400).json({ error: message });
  }
}
