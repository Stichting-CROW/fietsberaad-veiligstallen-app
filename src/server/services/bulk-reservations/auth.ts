import type { NextApiRequest, NextApiResponse } from "next";
import type { Session } from "next-auth";
import { getServerSession } from "next-auth";
import { authOptions } from "~/pages/api/auth/[...nextauth]";
import { userHasRight } from "~/types/utils";
import { VSSecurityTopic } from "~/types/securityprofile";
import { validateUserSession } from "~/utils/server/database-tools";
import { BulkValidationError } from "./domain";

export type FietsenstallingAccess =
  | { ok: true; session: Session; fietsenstallingId: string }
  | { ok: false; status: number; error: string };

export async function requireFietsenstallingBulkAccess(
  req: NextApiRequest,
  res: NextApiResponse
): Promise<FietsenstallingAccess> {
  const session = await getServerSession(req, res, authOptions);
  if (!session?.user) {
    return { ok: false, status: 401, error: "Unauthorized - no session found" };
  }

  const hasAdmin = userHasRight(
    session.user.securityProfile,
    VSSecurityTopic.instellingen_fietsenstallingen_admin
  );
  const hasBeperkt = userHasRight(
    session.user.securityProfile,
    VSSecurityTopic.instellingen_fietsenstallingen_beperkt
  );
  if (!hasAdmin && !hasBeperkt) {
    return { ok: false, status: 403, error: "Geen rechten voor fietsenstallingen" };
  }

  const validateUserSessionResult = await validateUserSession(session, "any");
  if ("error" in validateUserSessionResult) {
    return { ok: false, status: 401, error: validateUserSessionResult.error };
  }

  const fietsenstallingId = req.query.id as string;
  if (!fietsenstallingId) {
    return { ok: false, status: 400, error: "Stalling ID ontbreekt" };
  }

  const { prisma } = await import("~/server/db");
  const fietsenstalling = await prisma.fietsenstallingen.findFirst({
    where: { ID: fietsenstallingId },
    select: { SiteID: true },
  });
  if (!fietsenstalling?.SiteID || !validateUserSessionResult.sites.includes(fietsenstalling.SiteID)) {
    return { ok: false, status: 403, error: "No access to this fietsenstalling" };
  }

  return { ok: true, session, fietsenstallingId };
}

export function handleBulkServiceError(res: NextApiResponse, error: unknown): void {
  if (error instanceof BulkValidationError) {
    res.status(400).json({ error: error.message });
    return;
  }
  console.error(error);
  res.status(500).json({ error: "Internal server error" });
}
