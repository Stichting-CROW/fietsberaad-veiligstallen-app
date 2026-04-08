import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "~/server/db";
import { getServerSession } from "next-auth";
import { authOptions } from "~/pages/api/auth/[...nextauth]";
import { userHasRight } from "~/types/utils";
import { VSSecurityTopic } from "~/types/securityprofile";
import { generateID } from "~/utils/server/database-tools";
import { z } from "zod";

const ALLOWED_KEYS = ["mail-reminder-aan-contactpersonen"] as const;
const SITE_ID_FIETSBERAAD = "1";

const putSchema = z.object({
  body: z.string(),
});

export type MailTemplateResponse = {
  body?: string;
  error?: string;
};

export default async function handle(
  req: NextApiRequest,
  res: NextApiResponse<MailTemplateResponse>
) {
  const session = await getServerSession(req, res, authOptions);
  if (!session?.user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const hasSuperadmin = userHasRight(
    session.user.securityProfile,
    VSSecurityTopic.fietsberaad_superadmin
  );
  if (!hasSuperadmin) {
    res.status(403).json({ error: "Forbidden: fietsberaad_superadmin required" });
    return;
  }

  const templateKey = req.query.templateKey as string;
  if (!templateKey || !ALLOWED_KEYS.includes(templateKey as (typeof ALLOWED_KEYS)[number])) {
    res.status(400).json({ error: "Invalid template key" });
    return;
  }

  switch (req.method) {
    case "GET": {
      const template = await prisma.mailings_standaardteksten.findFirst({
        where: {
          Title: templateKey,
          SiteID: SITE_ID_FIETSBERAAD,
        },
        select: { Article: true },
      });
      res.status(200).json({ body: template?.Article ?? "" });
      break;
    }
    case "PUT": {
      const parsed = putSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: "Invalid request body" });
        return;
      }
      const { body } = parsed.data;

      const existing = await prisma.mailings_standaardteksten.findFirst({
        where: {
          Title: templateKey,
          SiteID: SITE_ID_FIETSBERAAD,
        },
      });

      const editorName = session.user.name ?? session.user.email ?? "unknown";

      if (existing) {
        await prisma.mailings_standaardteksten.update({
          where: { ID: existing.ID },
          data: {
            Article: body,
            EditorModified: editorName,
            DateModified: new Date(),
          },
        });
      } else {
        await prisma.mailings_standaardteksten.create({
          data: {
            ID: generateID(),
            SiteID: SITE_ID_FIETSBERAAD,
            Title: templateKey,
            Article: body,
            Status: "1",
            EditorCreated: editorName,
            DateCreated: new Date(),
            EditorModified: editorName,
            DateModified: new Date(),
          },
        });
      }
      res.status(200).json({ body });
      break;
    }
    default:
      res.status(405).json({ error: "Method Not Allowed" });
  }
}
