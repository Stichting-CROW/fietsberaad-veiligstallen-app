import type { NextApiRequest, NextApiResponse } from "next";
import { CITIZEN_PAGE_TITLES, citizenPageArticle } from "~/modules/citizen-accounts/service";

export default async function handle(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Methode niet toegestaan" });
    return;
  }
  const title = typeof req.query.title === "string" ? req.query.title : "";
  if (!CITIZEN_PAGE_TITLES.has(title)) {
    res.status(404).json({ error: "Pagina niet gevonden" });
    return;
  }
  const siteId = typeof req.query.siteId === "string" ? req.query.siteId : null;
  res.status(200).json({ page: await citizenPageArticle(siteId, title) });
}
