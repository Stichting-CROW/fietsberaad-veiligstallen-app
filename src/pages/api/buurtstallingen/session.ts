import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "~/server/db";
import { signInCitizen } from "~/modules/buurtstallingen/application/citizen";
import { sendBuurtstallingenError } from "~/modules/buurtstallingen/application/http";
import { CITIZEN_COOKIE } from "~/modules/buurtstallingen/auth";

export default async function handle(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Methode niet toegestaan" });
    return;
  }
  try {
    const urlName = String(req.body?.urlName ?? "");
    const council = await prisma.contacts.findFirst({
      where: { UrlName: urlName, Status: { not: "0" } },
      select: { ID: true },
    });
    if (!council) {
      res.status(404).json({ error: "Gemeente niet gevonden" });
      return;
    }
    const result = await signInCitizen({
      siteId: council.ID,
      email: String(req.body?.email ?? ""),
      password: String(req.body?.password ?? ""),
      register: req.body?.register,
    });
    res.setHeader(
      "Set-Cookie",
      `${CITIZEN_COOKIE}=${result.token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 14}`,
    );
    res.status(200).json({ accountId: result.accountId });
  } catch (error) {
    sendBuurtstallingenError(res, error);
  }
}
