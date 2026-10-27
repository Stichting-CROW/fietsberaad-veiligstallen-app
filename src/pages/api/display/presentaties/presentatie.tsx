import type { NextApiRequest, NextApiResponse } from "next";
import { getPresentationBundle } from "~/server/display/presentation";
import { renderDocument, displayNoStoreHeaders } from "~/server/display/render";
import { resolvePresentationFromQuery, slide2QueryString } from "~/server/display/fms-display-resolve";
import { buildSlide2SrcFromQueryString } from "~/utils/display-urls";
import { PresentatieFramePage, presentatieFrameHeadExtra } from "~/server/display/presentaties-html";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") return res.status(405).end();
  const resolved = await resolvePresentationFromQuery(req.query);
  if (!resolved) {
    const hasFms = req.query.citycode && req.query.locationId;
    if (hasFms) return res.status(404).send("Stalling niet gevonden");
    res.writeHead(302, { Location: "/" });
    return res.end();
  }
  const { siteId, bikeparkIdFromUrl: bikeparkId } = resolved;
  const bundle = await getPresentationBundle(siteId);
  const theme1 = bundle.council?.ThemeColor1 ?? "1f99d2";
  const html = renderDocument(
    "Veiligstallen.nl",
    presentatieFrameHeadExtra(theme1),
    <PresentatieFramePage
      siteId={siteId}
      bikeparkId={bikeparkId}
      iframeSrc={buildSlide2SrcFromQueryString(req.headers.host, slide2QueryString(resolved))}
      logo2={bundle.council?.CompanyLogo2}
      tickerItems={(bundle.ticker ?? []).map((t) => t.Item ?? "").filter(Boolean)}
    />
  );
  Object.entries(displayNoStoreHeaders()).forEach(([k, v]) => res.setHeader(k, v));
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  return res.status(200).send(html);
}
