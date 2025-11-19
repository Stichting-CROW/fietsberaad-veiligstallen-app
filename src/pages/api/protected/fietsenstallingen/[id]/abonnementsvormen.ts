import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth";
import { authOptions } from "~/pages/api/auth/[...nextauth]";
import { validateUserSession } from "~/utils/server/database-tools";
import { prisma } from "~/server/db";
import { z } from "zod";
import { userHasRight } from "~/types/utils";
import { VSSecurityTopic } from "~/types/securityprofile";

const updateSchema = z.object({
  subscriptionTypeIDs: z.array(z.number()).optional()
});

export default async function handle(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const session = await getServerSession(req, res, authOptions);
  if (!session?.user) {
    res.status(401).json({ error: "Niet ingelogd - geen sessie gevonden" });
    return;
  }

  const id = req.query.id as string;
  if (!id) {
    res.status(400).json({ error: "Geen stalling opgegeven" });
    return;
  }

  const validateUserSessionResult = await validateUserSession(session, "any");
  if ("error" in validateUserSessionResult) {
    res.status(401).json({ error: validateUserSessionResult.error });
    return;
  }

  const { sites } = validateUserSessionResult;

  const fietsenstalling = await prisma.fietsenstallingen.findFirst({
    where: { ID: id },
    select: { SiteID: true }
  });

  if (!fietsenstalling || !fietsenstalling.SiteID || !sites.includes(fietsenstalling.SiteID)) {
    res.status(403).json({ error: "Geen toegang tot deze stalling" });
    return;
  }

  switch (req.method) {
    case "GET": {
      const links = await prisma.abonnementsvorm_fietsenstalling.findMany({
        where: { BikeparkID: id },
        select: { SubscriptiontypeID: true }
      });

      res.status(200).json({ data: links.map(link => link.SubscriptiontypeID) });
      break;
    }
    case "PUT": {
      const hasAdminRights = userHasRight(session.user.securityProfile, VSSecurityTopic.instellingen_fietsenstallingen_admin);
      const hasLimitedRights = userHasRight(session.user.securityProfile, VSSecurityTopic.instellingen_fietsenstallingen_beperkt);

      if (!hasAdminRights && !hasLimitedRights) {
        res.status(403).json({ error: "Geen rechten om abonnementen te beheren" });
        return;
      }

      try {
        const parseResult = updateSchema.safeParse(req.body);
        if (!parseResult.success) {
          res.status(400).json({ error: "Ongeldige of ontbrekende gegevens" });
          return;
        }

        const { subscriptionTypeIDs = [] } = parseResult.data;

        await prisma.$transaction(async tx => {
          await tx.abonnementsvorm_fietsenstalling.deleteMany({
            where: { BikeparkID: id }
          });

          if (subscriptionTypeIDs.length > 0) {
            await tx.abonnementsvorm_fietsenstalling.createMany({
              data: subscriptionTypeIDs.map(subId => ({
                BikeparkID: id,
                SubscriptiontypeID: subId
              }))
            });
          }
        });

        res.status(200).json({ data: subscriptionTypeIDs });
      } catch (error) {
        console.error("Error updating abonnementsvormen for parking:", error);
        res.status(500).json({ error: "Fout bij het opslaan van abonnementen" });
      }

      break;
    }
    default: {
      res.status(405).json({ error: "Methode niet toegestaan" });
    }
  }
}


