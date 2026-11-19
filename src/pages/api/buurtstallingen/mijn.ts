import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "~/server/db";
import { CITIZEN_COOKIE, readCitizenSession, readCookie } from "~/modules/buurtstallingen/auth";
import { citizenPlaceAction } from "~/modules/buurtstallingen/application/citizen";
import { sendBuurtstallingenError } from "~/modules/buurtstallingen/application/http";

export default async function handle(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Methode niet toegestaan" });
    return;
  }
  try {
    const session = readCitizenSession(readCookie(req.headers.cookie, CITIZEN_COOKIE));
    if (!session) {
      res.status(401).json({ error: "Log eerst in" });
      return;
    }
    const council = await prisma.contacts.findFirst({
      where: { UrlName: String(req.body?.urlName ?? ""), Status: { not: "0" } },
      select: { ID: true },
    });
    if (!council) {
      res.status(404).json({ error: "Gemeente niet gevonden" });
      return;
    }
    const action = req.body?.action;
    if (action !== "accept" && action !== "decline" && action !== "cancel" && action !== "leave") {
      res.status(400).json({ error: "Onbekende actie" });
      return;
    }
    const result = await citizenPlaceAction({
      siteId: council.ID,
      accountId: session.accountId,
      action,
      placeId: typeof req.body?.placeId === "string" ? req.body.placeId : undefined,
      entryId: typeof req.body?.entryId === "string" ? req.body.entryId : undefined,
      subscriptionTypeId: Number.isFinite(Number(req.body?.subscriptionTypeId)) ? Number(req.body.subscriptionTypeId) : null,
    });
    res.status(200).json(result);
  } catch (error) {
    sendBuurtstallingenError(res, error);
  }
}
