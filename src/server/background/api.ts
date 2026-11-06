import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession, type Session } from "next-auth";
import { authOptions } from "~/pages/api/auth/[...nextauth]";
import { userHasRight } from "~/types/utils";
import { VSSecurityTopic } from "~/types/securityprofile";

export async function requireSuperadmin(req: NextApiRequest, res: NextApiResponse): Promise<Session | null> {
  const session = await getServerSession(req, res, authOptions);
  if (!session?.user) {
    res.status(401).json({ error: "Niet ingelogd" });
    return null;
  }
  if (!userHasRight(session.user.securityProfile, VSSecurityTopic.fietsberaad_superadmin)) {
    res.status(403).json({ error: "Alleen fietsberaad superadmin" });
    return null;
  }
  return session;
}

export function sessionUserLabel(session: Session): string {
  const user = session.user as { email?: string | null; name?: string | null; id?: string };
  return user.email || user.name || user.id || "onbekend";
}

export function sendError(res: NextApiResponse, error: unknown, status = 500) {
  const message = error instanceof Error ? error.message : String(error);
  res.status(status).json({ error: message });
}
