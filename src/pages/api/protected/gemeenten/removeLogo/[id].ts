import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "~/server/db";
import { getServerSession } from "next-auth";
import { authOptions } from '~/pages/api/auth/[...nextauth]'
import { validateUserSession } from "~/utils/server/database-tools";
import { contactSelect } from "~/types/contacts";

export default async function handle(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const session = await getServerSession(req, res, authOptions);
  if (!session?.user) {
    console.error("Unauthorized - no session found");
    res.status(401).json({error: "Niet ingelogd - geen sessie gevonden"}); // Unauthorized
    return;
  }

  const validateUserSessionResult = await validateUserSession(session, "contacts");
  if ('error' in validateUserSessionResult) {
    console.error("Unauthorized - invalid session", validateUserSessionResult.error);
    res.status(401).json({error: validateUserSessionResult.error}); // Unauthorized
    return;
  }

  const { sites } = validateUserSessionResult;

  const id = req.query.id as string;
  if (!sites.includes(id)) {
    console.error("Unauthorized - no access to this contact", id);
    res.status(403).json({ error: "Geen toegang tot dit contact" });
    return;
  }

  try {
    console.log("==contactId", id);
    const updatedContact = await prisma.contacts.update({
      select: contactSelect,
      where: { ID: id },
      data: {
        CompanyLogo: null
      }
    });
    res.status(200).json({data: updatedContact});
  } catch (e) {
    console.error("Fout bij het verwijderen van het logo:", e);
    res.status(500).json({error: "Fout bij het verwijderen van het logo"});
  }
} 