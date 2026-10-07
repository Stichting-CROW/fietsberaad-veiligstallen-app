import type { NextApiRequest, NextApiResponse } from "next";
import { readAction } from "~/modules/buurtstallingen/auth";
import { renderContract } from "~/modules/buurtstallingen/application/service";
import { sendBuurtstallingenError } from "~/modules/buurtstallingen/application/http";
import { documentPage } from "~/modules/buurtstallingen/domain/documents";
import { prisma } from "~/server/db";

export default async function handle(req: NextApiRequest, res: NextApiResponse) {
  try {
    const action = readAction(typeof req.query.token === "string" ? req.query.token : undefined);
    if (!action || (action.action !== "contract" && action.action !== "machtiging")) {
      res.status(400).json({ error: "Deze link is ongeldig of verlopen" });
      return;
    }
    const occupation = await prisma.fietsenstalling_plek_bezetting.findFirst({
      where: { plek_id: BigInt(action.targetId), account_id: action.accountId },
    });
    if (!occupation) {
      res.status(403).json({ error: "Dit document hoort niet bij deze link" });
      return;
    }
    const place = await prisma.fietsenstalling_plek.findUnique({ where: { id: BigInt(action.targetId) } });
    const section = place?.sectie_id
      ? await prisma.fietsenstalling_sectie.findUnique({ where: { sectieId: Number(place.sectie_id) } })
      : null;
    if (!section?.fietsenstallingsId) {
      res.status(404).json({ error: "Stalling niet gevonden" });
      return;
    }
    const stalling = await prisma.fietsenstallingen.findUnique({ where: { ID: section.fietsenstallingsId } });
    if (!stalling?.SiteID) {
      res.status(404).json({ error: "Stalling niet gevonden" });
      return;
    }
    const rendered = await renderContract({
      siteId: stalling.SiteID,
      stallingId: stalling.ID,
      placeId: action.targetId,
      kind: action.action,
    });
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.status(200).send(documentPage({ title: rendered.title, body: rendered.html, logoUrl: rendered.logoUrl, logoAlt: rendered.logoAlt }));
  } catch (error) {
    sendBuurtstallingenError(res, error);
  }
}
