import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "~/pages/api/auth/[...nextauth]";
import { prisma } from "~/server/db";
import { VSSecurityTopic } from "~/types/securityprofile";
import { userHasRight } from "~/types/utils";
import { generateID } from "~/utils/server/database-tools";
import {
  FREQUENTIE_OPTIONS,
  REMINDER_FREQUENCY_KEY,
  SITE_ID_FIETSBERAAD,
  getMailfrequentieMap,
} from "~/utils/server/contactpersonen-reminder-mail";

const schema = z.record(z.enum(FREQUENTIE_OPTIONS));

type ResponseData = {
  data?: Record<string, (typeof FREQUENTIE_OPTIONS)[number]>;
  error?: string;
};

export default async function handle(req: NextApiRequest, res: NextApiResponse<ResponseData>) {
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

  if (req.method === "GET") {
    const data = await getMailfrequentieMap();
    res.status(200).json({ data });
    return;
  }

  if (req.method !== "PUT") {
    res.status(405).json({ error: "Method Not Allowed" });
    return;
  }

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  const body = parsed.data;
  const existing = await prisma.mailings_standaardteksten.findFirst({
    where: {
      Title: REMINDER_FREQUENCY_KEY,
      SiteID: SITE_ID_FIETSBERAAD,
    },
  });

  const editorName = session.user.name ?? session.user.email ?? "unknown";
  if (existing) {
    await prisma.mailings_standaardteksten.update({
      where: { ID: existing.ID },
      data: {
        Article: JSON.stringify(body),
        EditorModified: editorName,
        DateModified: new Date(),
      },
    });
  } else {
    await prisma.mailings_standaardteksten.create({
      data: {
        ID: generateID(),
        SiteID: SITE_ID_FIETSBERAAD,
        Title: REMINDER_FREQUENCY_KEY,
        Article: JSON.stringify(body),
        Status: "1",
        EditorCreated: editorName,
        DateCreated: new Date(),
        EditorModified: editorName,
        DateModified: new Date(),
      },
    });
  }

  res.status(200).json({ data: body });
}
