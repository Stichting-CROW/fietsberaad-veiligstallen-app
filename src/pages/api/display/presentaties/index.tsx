import type { NextApiRequest, NextApiResponse } from "next";
import { listPresentationCouncils } from "~/server/display/presentation";
import { renderDocument, displayNoStoreHeaders } from "~/server/display/render";
import { PresentatiesIndexPage } from "~/server/display/presentaties-html";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") return res.status(405).end();
  const rows = await listPresentationCouncils();
  const html = renderDocument(
    "Veiligstallen.nl :: Presentaties",
    '<link rel="stylesheet" href="/display/presentaties/styles.css" />',
    <PresentatiesIndexPage
      rows={rows.map((r) => ({
        siteId: r.council.ID,
        companyName: r.council.CompanyName ?? "",
        stallings: r.stallings.map((s) => ({ id: s.ID, title: s.Title ?? "" })),
      }))}
    />
  );
  Object.entries(displayNoStoreHeaders()).forEach(([k, v]) => res.setHeader(k, v));
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  return res.status(200).send(html);
}
