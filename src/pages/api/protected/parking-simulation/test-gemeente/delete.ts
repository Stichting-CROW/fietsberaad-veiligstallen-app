import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth";
import { authOptions } from "~/pages/api/auth/[...nextauth]";
import { userHasRight } from "~/types/utils";
import { VSSecurityTopic } from "~/types/securityprofile";
import { prisma } from "~/server/db";
import { formatPrismaErrorCompact, logPrismaError } from "~/utils/formatPrismaError";
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

  if (req.method !== "POST") {
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

    if (!contact) {
      return res.status(200).json({
        success: true,
        message: "Test gemeente bestond niet",
      });
    }

    const contactId = contact.ID;

    await prisma.$transaction(async (tx) => {
      await tx.fmsservice_permit.deleteMany({ where: { SiteID: contactId } });
      await tx.user_contact_role.deleteMany({ where: { ContactID: contactId } });
      await tx.modules_contacts.deleteMany({ where: { SiteID: contactId } });
      await tx.documenttemplates.deleteMany({ where: { siteID: contactId } });
      await tx.contact_report_settings.deleteMany({ where: { siteID: contactId } });

      const secties = await tx.fietsenstalling_sectie.findMany({
        where: { fietsenstalling: { SiteID: contactId } },
        select: { sectieId: true },
      });
      const sectieIds = secties.map((s) => BigInt(s.sectieId));
      if (sectieIds.length > 0) {
        await tx.fietsenstalling_plek.deleteMany({
          where: { sectie_id: { in: sectieIds } },
        });
      }
      await tx.fietsenstalling_sectie.deleteMany({
        where: { fietsenstalling: { SiteID: contactId } },
      });
      await tx.fietsenstallingen.deleteMany({ where: { SiteID: contactId } });
      await tx.contacts.delete({ where: { ID: contactId } });
    });

    return res.status(200).json({
      success: true,
      message: "Test gemeente verwijderd",
    });
  } catch (error) {
    logPrismaError("test-gemeente delete", error);
    return res.status(500).json({
      error: formatPrismaErrorCompact(error),
    });
  }
}
