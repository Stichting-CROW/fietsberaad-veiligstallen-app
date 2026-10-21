import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "~/server/db";
import { getServerSession } from "next-auth";
import { authOptions } from '~/pages/api/auth/[...nextauth]'
import { validateUserSession } from "~/utils/server/database-tools";
import { getRights } from "~/utils/securitycontext";
import { VSSecurityTopic } from "~/types/securityprofile";
import { newId } from "~/modules/buurtstallingen/auth";

export type Documenttemplate = {
  ID: string;
  name: string | null;
};

export type DocumenttemplatesResponse = {
  data?: Documenttemplate[];
  standard?: Documenttemplate[];
  ID?: string;
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
        const standard = req.query.lists === "1" && activeContactId !== "1"
          ? (await prisma.documenttemplates.findMany({
              where: { siteID: "1" },
              orderBy: { name: "asc" },
              select: { ID: true, name: true },
            }))
          : [];

        res.status(200).json({ data, standard });
      } catch (e) {
        console.error("Error fetching documenttemplates:", e);
        res.status(500).json({error: "Fout bij het ophalen van documenttemplates"});
      }
      break;
    }
    case "POST": {
      const rights = getRights(session.user.securityProfile, VSSecurityTopic.abonnementsvormen_beheerrecht);
      if (!rights.create && !rights.update) {
        res.status(403).json({ error: "Geen rechten om documenten te beheren" });
        return;
      }
      const copyFrom = typeof req.body?.copyFrom === "string" ? req.body.copyFrom : "";
      let html = typeof req.body?.html === "string" ? req.body.html : "";
      let name = typeof req.body?.name === "string" ? req.body.name : "Nieuw document";
      if (copyFrom) {
        const source = await prisma.documenttemplates.findUnique({ where: { ID: copyFrom } });
        if (!source || (source.siteID !== activeContactId && source.siteID !== "1")) {
          res.status(404).json({ error: "Brondocument niet gevonden" });
          return;
        }
        html = source.html ?? "";
        name = `${source.name ?? "document"} (kopie)`;
      }
      const created = await prisma.documenttemplates.create({
        data: {
          ID: newId(),
          name,
          html,
          siteID: activeContactId,
          EditorModified: session.user.name?.trim() || session.user.email?.trim() || "",
          dateCreated: new Date(),
          dateModified: new Date(),
        },
      });
      res.status(201).json({ ID: created.ID, data: [{ ID: created.ID, name: created.name }] });
      break;
    }
    default: {
      res.status(405).json({error: "Methode niet toegestaan"});
    }
  }
}

