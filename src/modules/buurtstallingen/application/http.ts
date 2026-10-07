import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth";
import { authOptions } from "~/pages/api/auth/[...nextauth]";
import { prisma } from "~/server/db";
import { validateUserSession } from "~/utils/server/database-tools";
import { getRights } from "~/utils/securitycontext";
import { VSSecurityTopic } from "~/types/securityprofile";
import { DomainError } from "../domain/types";
import { EngineDisabledError } from "./service";

export function sendBuurtstallingenError(res: NextApiResponse, error: unknown) {
  if (error instanceof EngineDisabledError) {
    res.status(409).json({ error: error.message });
    return;
  }
  if (error instanceof DomainError) {
    res.status(400).json({ error: error.message });
    return;
  }
  console.error(error);
  res.status(500).json({ error: "Er ging iets mis" });
}

export async function requireBuurtstallingenOperator(
  req: NextApiRequest,
  res: NextApiResponse,
  mode: "read" | "write" | "delete",
) {
  const session = await getServerSession(req, res, authOptions);
  if (!session?.user) {
    res.status(401).json({ error: "Niet ingelogd" });
    return null;
  }
  const validated = await validateUserSession(session, "organizations");
  if ("error" in validated) {
    res.status(validated.status).json({ error: validated.error });
    return null;
  }
  const siteId = validated.activeContactId;
  if (!siteId || siteId === "1") {
    res.status(403).json({ error: "Kies eerst een organisatie" });
    return null;
  }
  const rights = getRights(session.user.securityProfile, VSSecurityTopic.buurtstallingen_beheer);
  const allowed = mode === "read" ? rights.read : mode === "delete" ? rights.delete : rights.create || rights.update;
  if (!allowed) {
    res.status(403).json({ error: "Geen rechten voor buurtstallingen" });
    return null;
  }
  const moduleLink = await prisma.modules_contacts.findFirst({
    where: { SiteID: siteId, ModuleID: "buurtstallingen" },
  });
  if (!moduleLink) {
    res.status(403).json({ error: "De module buurtstallingen staat uit voor deze organisatie" });
    return null;
  }
  return { siteId, canWrite: rights.create || rights.update, canDelete: rights.delete };
}
