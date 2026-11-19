import type { NextApiRequest, NextApiResponse } from "next";
import { citizenTheme } from "~/modules/citizen-accounts/service";

export default async function handle(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Methode niet toegestaan" });
    return;
  }
  const siteId = typeof req.query.siteId === "string" ? req.query.siteId : null;
  res.status(200).json(await citizenTheme(siteId));
}
