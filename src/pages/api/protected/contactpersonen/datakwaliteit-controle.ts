import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "~/server/db";
import { getServerSession } from "next-auth";
import { authOptions } from "~/pages/api/auth/[...nextauth]";
import { userHasRight } from "~/types/utils";
import { VSSecurityTopic } from "~/types/securityprofile";

export default async function handle(
  req: NextApiRequest,
  res: NextApiResponse<{ ok?: boolean; error?: string }>
) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method Not Allowed" });
    return;
  }

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
