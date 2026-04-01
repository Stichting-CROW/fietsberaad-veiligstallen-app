import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "~/server/db";
import { getServerSession } from "next-auth";
import { authOptions } from "~/pages/api/auth/[...nextauth]";
import { userHasRight } from "~/types/utils";
import { VSSecurityTopic } from "~/types/securityprofile";

type ResponseData = { ok?: boolean; error?: string } | { lastControleAt: string | null; error?: string };

export default async function handle(
  req: NextApiRequest,
  res: NextApiResponse<ResponseData>
) {
  const session = await getServerSession(req, res, authOptions);
  if (!session?.user?.id) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const hasFietsenstallingenAdmin = userHasRight(
    session.user.securityProfile,
    VSSecurityTopic.instellingen_fietsenstallingen_admin
  );
  const hasFietsenstallingenBeperkt = userHasRight(
    session.user.securityProfile,
    VSSecurityTopic.instellingen_fietsenstallingen_beperkt
  );
  if (!hasFietsenstallingenAdmin && !hasFietsenstallingenBeperkt) {
    res.status(403).json({ error: "Forbidden: fietsenstallingen access required" });
    return;
  }

  const contactId = session.user.activeContactId;
  if (!contactId) {
    res.status(400).json({ error: "No active contact selected" });
    return;
  }

  if (req.method === "GET") {
    try {
      const lastControle = await prisma.contacts_datakwaliteitcontroles.findFirst({
        where: { contact_id: contactId },
        orderBy: { createdAt: "desc" },
        select: { createdAt: true },
      });
      res.status(200).json({ lastControleAt: lastControle?.createdAt?.toISOString() ?? null });
    } catch (e) {
      console.error("datakwaliteit-controle GET - error:", e);
      res.status(500).json({ lastControleAt: null, error: "Failed to fetch last controle" });
    }
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ error: "Method Not Allowed" });
    return;
  }

  try {
    await prisma.contacts_datakwaliteitcontroles.create({
      data: {
        contact_id: contactId,
        user_id: session.user.id,
      },
    });
    res.status(200).json({ ok: true });
  } catch (e) {
    console.error("datakwaliteit-controle - error:", e);
    res.status(500).json({ error: "Failed to store datakwaliteit controle" });
  }
}
