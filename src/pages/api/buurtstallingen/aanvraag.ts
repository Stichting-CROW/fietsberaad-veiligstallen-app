import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "~/server/db";
import { CITIZEN_COOKIE, readCitizenSession, readCookie } from "~/modules/buurtstallingen/auth";
import { ensureCitizenCouncilLink, updateCitizenProfile } from "~/modules/buurtstallingen/application/citizen";
import { joinWaitingList, reservePlace } from "~/modules/buurtstallingen/application/service";
import { sendBuurtstallingenError } from "~/modules/buurtstallingen/application/http";
import type { Qualification } from "~/modules/buurtstallingen/domain/types";

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
    await ensureCitizenCouncilLink(council.ID, session.accountId);
    if (req.body?.profile) await updateCitizenProfile(session.accountId, req.body.profile);
    const qualification: Qualification = req.body?.qualification === "UNDER" || req.body?.qualification === "ABOVE" ? req.body.qualification : "NONE";
    if (req.body?.wait) {
      const joined = await joinWaitingList({
        siteId: council.ID,
        stallingId: String(req.body.stallingId),
        accountId: session.accountId,
        qualification,
        bikeTypeId: Number(req.body.bikeTypeId),
      });
      res.status(200).json({ kind: "waiting", sequence: joined.sequenceNumber });
      return;
    }
    const reserved = await reservePlace({
      siteId: council.ID,
      stallingId: String(req.body.stallingId),
      accountId: session.accountId,
      qualification,
      bikeTypeId: Number(req.body.bikeTypeId),
      subscriptionTypeId: req.body.subscriptionTypeId ? Number(req.body.subscriptionTypeId) : null,
    });
    res.status(200).json({ kind: "reserved", expiry: reserved.expiryDate.toISOString() });
  } catch (error) {
    sendBuurtstallingenError(res, error);
  }
}
