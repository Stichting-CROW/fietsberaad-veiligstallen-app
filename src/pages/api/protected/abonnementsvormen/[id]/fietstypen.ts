import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "~/server/db";
import { getServerSession } from "next-auth";
import { authOptions } from '~/pages/api/auth/[...nextauth]'
import { validateUserSession } from "~/utils/server/database-tools";
import type { VSFietstype } from "~/types/fietstypen";

export type AbonnementsvormFietstypenResponse = {
  data?: VSFietstype[];
  error?: string;
};

export default async function handle(
  req: NextApiRequest,
  res: NextApiResponse<AbonnementsvormFietstypenResponse>
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

  if (req.method !== "GET") {
    res.status(405).json({error: "Methode niet toegestaan"});
    return;
  }

  const id = req.query.id as string;

  if (id === "new") {
    // For new abonnementsvorm, return empty array
    res.status(200).json({ data: [] });
    return;
  }

  try {
    // Check if abonnementsvorm exists and user has access
    const abonnementsvorm = await prisma.abonnementsvormen.findFirst({
      where: {
        ID: parseInt(id),
        siteID: activeContactId
      },
      select: {
        ID: true
      }
    });

    if (!abonnementsvorm) {
      res.status(404).json({error: "Abonnementsvorm niet gevonden"});
      return;
    }

    // Get fietstypes for this abonnementsvorm
    // Based on createMany: SubscriptiontypeID = abonnementsvorm.ID, BikeTypeID = fietstype.ID
    // The DELETE also uses SubscriptiontypeID to find records, so SubscriptiontypeID is the abonnementsvorm ID
    // However, the Prisma relation says BikeTypeID references abonnementsvormen, which is backwards
    // We'll query by SubscriptiontypeID (the actual abonnementsvorm ID) and get BikeTypeID (the fietstype ID)
    const abonnementsvormFietstypes = await prisma.abonnementsvorm_fietstype.findMany({
      where: {
        SubscriptiontypeID: parseInt(id) // This is the abonnementsvorm ID (as per createMany and DELETE)
      },
      select: {
        BikeTypeID: true, // This is the fietstype ID
        SubscriptiontypeID: true
      }
    });

    // Now fetch the actual fietstype records using the BikeTypeID values
    const fietstypeIDs = abonnementsvormFietstypes.map(avft => avft.BikeTypeID);
    
    if (fietstypeIDs.length === 0) {
      res.status(200).json({ data: [] });
      return;
    }

    const fietstypen = await prisma.fietstypen.findMany({
      where: {
        ID: { in: fietstypeIDs }
      },
      select: {
        ID: true,
        Name: true,
        naamenkelvoud: true
      }
    });

    const data: VSFietstype[] = fietstypen.map(ft => ({
      ID: ft.ID,
      Name: ft.Name,
      naamenkelvoud: ft.naamenkelvoud
    }));

    res.status(200).json({ data });
  } catch (e) {
    console.error("Error fetching abonnementsvorm fietstypen:", e);
    res.status(500).json({error: "Fout bij het ophalen van fietstypen"});
  }
}

