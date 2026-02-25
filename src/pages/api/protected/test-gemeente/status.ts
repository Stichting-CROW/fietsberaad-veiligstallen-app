import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth";
import { authOptions } from "~/pages/api/auth/[...nextauth]";
import { userHasRight } from "~/types/utils";
import { VSSecurityTopic } from "~/types/securityprofile";
import { prisma } from "~/server/db";
import { TESTGEMEENTE_NAME } from "~/data/testgemeente-data";

export default async function handle(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const session = await getServerSession(req, res, authOptions);
  if (!session?.user) {
    res.status(401).json({ error: "Niet ingelogd" });
    return;
  }
  if (!userHasRight(session.user.securityProfile, VSSecurityTopic.fietsberaad_superadmin)) {
    res.status(403).json({ error: "Geen rechten voor deze actie" });
    return;
  }

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const contact = await prisma.contacts.findFirst({
      where: {
        CompanyName: TESTGEMEENTE_NAME,
        ItemType: "organizations",
      },
      select: { ID: true },
    });
    return res.status(200).json({ exists: !!contact, id: contact?.ID ?? null });
  } catch (error) {
    console.error("test-gemeente status error:", error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : "Onbekende fout",
    });
  }
}
