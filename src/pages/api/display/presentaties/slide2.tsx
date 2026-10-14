import type { NextApiRequest, NextApiResponse } from "next";
import { getCouncilById } from "~/server/display/council";
import { renderDocument, displayNoStoreHeaders } from "~/server/display/render";
import { Slide2Shell, slide2HeadExtra } from "~/server/display/presentaties-html";
import { renderSlide2Html } from "~/server/display/slide-renderer";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") return res.status(405).end();
  const siteId = (req.query.siteID ?? req.query.siteId) as string | undefined;
  const bikeparkId = (req.query.bikeparkID ?? req.query.bikeparkId) as string | undefined;
  if (!siteId) return res.status(400).send("siteID required");

  const council = await getCouncilById(siteId);
  const { html, totalDuration } = await renderSlide2Html(siteId, bikeparkId);

  const theme1 = council?.themeColor1 ?? "1f99d2";
  const doc = renderDocument(
    "VeiligStallen",
    slide2HeadExtra(theme1),
    <Slide2Shell innerHtml={html} totalDurationSec={totalDuration} />
  );
  Object.entries(displayNoStoreHeaders()).forEach(([k, v]) => res.setHeader(k, v));
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  return res.status(200).send(doc);
}
