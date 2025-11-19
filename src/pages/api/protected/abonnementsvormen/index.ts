import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "~/server/db";
import { getServerSession } from "next-auth";
import { authOptions } from '~/pages/api/auth/[...nextauth]'
import { validateUserSession } from "~/utils/server/database-tools";
import type { VSAbonnementsvormInLijst } from "~/types/abonnementsvormen";

export type AbonnementsvormenResponse = {
  data?: VSAbonnementsvormInLijst[];
  error?: string;
};

export default async function handle(
  req: NextApiRequest,
  res: NextApiResponse<AbonnementsvormenResponse>
) {
  const session = await getServerSession(req, res, authOptions);
  if (!session?.user) {
    console.error("Unauthorized - no session found");
    res.status(401).json({error: "Niet ingelogd - geen sessie gevonden"});
    return;
  }

  const validateUserSessionResult = await validateUserSession(session, "organizations");
  if ('error' in validateUserSessionResult) {
    console.error("Unauthorized - invalid session", validateUserSessionResult.error);
    res.status(401).json({error: validateUserSessionResult.error});
    return;
  }

  const { activeContactId } = validateUserSessionResult;

  if (!activeContactId) {
    console.error("Unauthorized - no active contact ID");
    res.status(403).json({ error: "Geen actieve organisatie geselecteerd" });
    return;
  }

  switch (req.method) {
    case "GET": {
      try {
        // Get all abonnementsvormen for the active organization
        const [abonnementsvormen, fietsenstallingtypen] = await Promise.all([
          prisma.abonnementsvormen.findMany({
            where: {
              siteID: activeContactId
            },
            include: {
              abonnementen: {
                where: {
                  isActief: true,
                  ingangsdatum: { lte: new Date() },
                  afloopdatum: { gte: new Date() }
                },
                select: {
                  ID: true
                },
                take: 1 // We only need to know if there are any
              }
            },
            orderBy: [
              {
                isActief: 'desc' // Active items first
              },
              {
                tijdsduur: 'asc' // Then sort by duration (matching ColdFusion order)
              }
            ]
          }),
          prisma.fietsenstallingtypen.findMany()
        ]);

        // Create a map for quick lookup
        const bikeparkTypeMap = new Map(
          fietsenstallingtypen.map(type => [type.id, type.name])
        );

        // Transform to list format with hasSubscriptions
        const data: VSAbonnementsvormInLijst[] = abonnementsvormen.map(av => ({
          ID: av.ID,
          naam: av.naam,
          tijdsduur: av.tijdsduur,
          prijs: av.prijs ? Number(av.prijs) : null,
          bikeparkTypeName: av.bikeparkTypeID 
            ? (bikeparkTypeMap.get(av.bikeparkTypeID) || `Stallingtype ${av.bikeparkTypeID}`)
            : null,
          isActief: av.isActief,
          hasSubscriptions: av.abonnementen.length > 0
        }));

        res.status(200).json({ data });
      } catch (e) {
        console.error("Error fetching abonnementsvormen:", e);
        res.status(500).json({error: "Fout bij het ophalen van abonnementsvormen"});
      }
      break;
    }
    default: {
      res.status(405).json({error: "Methode niet toegestaan"});
    }
  }
}

