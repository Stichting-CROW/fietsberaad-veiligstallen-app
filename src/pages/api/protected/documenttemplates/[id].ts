import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth";
import { authOptions } from "~/pages/api/auth/[...nextauth]";
import { prisma } from "~/server/db";
import { validateUserSession } from "~/utils/server/database-tools";
import { getRights } from "~/utils/securitycontext";
import { VSSecurityTopic } from "~/types/securityprofile";

export default async function handle(req: NextApiRequest, res: NextApiResponse) {
  const session = await getServerSession(req, res, authOptions);
  if (!session?.user) {
    res.status(401).json({ error: "Niet ingelogd" });
    return;
  }
  const validated = await validateUserSession(session, "organizations");
  if ("error" in validated) {
    res.status(validated.status).json({ error: validated.error });
    return;
  }
  const id = String(req.query.id ?? "");
  const template = await prisma.documenttemplates.findUnique({ where: { ID: id } });
  if (!template) {
    res.status(404).json({ error: "Document niet gevonden" });
    return;
  }
  const own = template.siteID === validated.activeContactId;
  if (req.method === "GET") {
    if (!own && template.siteID !== "1") {
      res.status(403).json({ error: "Geen toegang tot dit document" });
      return;
    }
    res.status(200).json({
      ID: template.ID,
      name: template.name,
      html: template.html,
      readOnly: !own,
      editorModified: template.EditorModified,
      dateModified: template.dateModified,
    });
    return;
  }
  const rights = getRights(session.user.securityProfile, VSSecurityTopic.abonnementsvormen_beheerrecht);
  if (!own || (!rights.create && !rights.update)) {
    res.status(403).json({ error: "Dit document kan niet worden gewijzigd" });
    return;
  }
  if (req.method === "PUT") {
    const updated = await prisma.documenttemplates.update({
      where: { ID: id },
      data: {
        name: typeof req.body?.name === "string" ? req.body.name : template.name,
        html: typeof req.body?.html === "string" ? req.body.html : template.html,
        EditorModified: session.user.name?.trim() || session.user.email?.trim() || "",
        dateModified: new Date(),
      },
    });
    res.status(200).json({ ID: updated.ID, name: updated.name });
    return;
  }
  if (req.method === "DELETE") {
    if (!rights.delete && !rights.update) {
      res.status(403).json({ error: "Geen rechten om documenten te verwijderen" });
      return;
    }
    const used = await prisma.abonnementsvormen.findFirst({
      where: {
        OR: [{ contractID: id }, { paymentAuthorizationID: id }, { conditionsID: id }],
      },
    });
    if (used) {
      res.status(409).json({ error: "Dit document is nog gekoppeld aan een abonnementsvorm" });
      return;
    }
    await prisma.documenttemplates.delete({ where: { ID: id } });
    res.status(200).json({ ok: true });
    return;
  }
  res.status(405).json({ error: "Methode niet toegestaan" });
}
