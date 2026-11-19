import type { NextApiRequest, NextApiResponse } from "next";
import { getPublicDetailForAccount } from "~/modules/buurtstallingen/application/service";
import { sessionAccountId } from "~/modules/citizen-accounts/service";

export default async function handle(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Methode niet toegestaan" });
    return;
  }
  const siteId = typeof req.query.siteId === "string" ? req.query.siteId : "";
  const parkingId = typeof req.query.parkingId === "string" ? req.query.parkingId : "";
  if (!siteId || !parkingId) {
    res.status(400).json({ error: "siteId en parkingId zijn verplicht" });
    return;
  }
  if (!sessionAccountId(req)) {
    res.status(401).json({ error: "Log in om verder te gaan" });
    return;
  }
  const detail = await getPublicDetailForAccount(siteId, parkingId);
  if (!detail) {
    res.status(404).json({ error: "Stalling niet gevonden" });
    return;
  }
  res.status(200).json(detail);
}
