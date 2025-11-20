import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "~/server/db";
import { getServerSession } from "next-auth";
import { authOptions } from '~/pages/api/auth/[...nextauth]'
import { validateUserSession } from "~/utils/server/database-tools";

export type Documenttemplate = {
  ID: string;
  name: string | null;
};

export type DocumenttemplatesResponse = {
  data?: Documenttemplate[];
  error?: string;
};

export default async function handle(
  req: NextApiRequest,
  res: NextApiResponse<DocumenttemplatesResponse>
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
    res.status(403).json({error: "Geen actieve organisatie geselecteerd"});
    return;
  }

  switch (req.method) {
    case "GET": {
      try {
        // Get documenttemplates for the active organization
        const templates = await prisma.documenttemplates.findMany({
          where: {
            siteID: activeContactId
          },
          orderBy: {
            name: 'asc'
          }
        });

        const data: Documenttemplate[] = templates.map(t => ({
          ID: t.ID,
          name: t.name
        }));

        res.status(200).json({ data });
      } catch (e) {
        console.error("Error fetching documenttemplates:", e);
        res.status(500).json({error: "Fout bij het ophalen van documenttemplates"});
      }
      break;
    }
    default: {
      res.status(405).json({error: "Methode niet toegestaan"});
    }
  }
}

