import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth";
import { authOptions } from "~/pages/api/auth/[...nextauth]";
import { prisma } from "~/server/db";
import { validateUserSession } from "~/utils/server/database-tools";

export type ContactCoordinatenResponse = {
  coordinaten?: string | null;
  error?: string;
};

export default async function handle(
  req: NextApiRequest,
  res: NextApiResponse<ContactCoordinatenResponse>
) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method Not Allowed" });
    return;
  }

  const session = await getServerSession(req, res, authOptions);
  const validationResult = await validateUserSession(session, "any");
  if ("error" in validationResult) {
    res.status(401).json({ error: validationResult.error });
    return;
  }

  const id = typeof req.query.id === "string" ? req.query.id : "";
  if (!id || id === "1") {
    res.status(200).json({ coordinaten: null });
    return;
  }

  if (!validationResult.sites.includes(id)) {
    res.status(403).json({ error: "No access to this organization" });
    return;
  }

  const contact = await prisma.contacts.findFirst({
    where: { ID: id },
    select: { Coordinaten: true },
  });

  if (!contact) {
    res.status(404).json({ error: "Contact not found" });
    return;
  }

  res.status(200).json({ coordinaten: contact.Coordinaten });
}
