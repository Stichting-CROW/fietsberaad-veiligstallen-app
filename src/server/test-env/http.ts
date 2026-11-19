import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth";
import { authOptions } from "~/pages/api/auth/[...nextauth]";
import { userHasRight } from "~/types/utils";
import { VSSecurityTopic } from "~/types/securityprofile";
import { assertBootstrapEnabled, TestEnvError } from "./guard";

export async function assertTestEnvUser(req: NextApiRequest, res: NextApiResponse): Promise<boolean> {
  try {
    assertBootstrapEnabled();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(403).json({ error: message });
    return false;
  }
  const session = await getServerSession(req, res, authOptions);
  if (!session?.user) {
    res.status(401).json({ error: "Niet ingelogd" });
    return false;
  }
  const profile = session.user.securityProfile;
  const allowed = userHasRight(profile, VSSecurityTopic.fietsberaad_superadmin)
    && userHasRight(profile, VSSecurityTopic.acceptatie_ontwikkeling);
  if (!allowed) {
    res.status(403).json({ error: "Geen rechten voor de testomgeving" });
    return false;
  }
  return true;
}

export function sendTestEnvError(res: NextApiResponse, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  const status = error instanceof TestEnvError ? 400 : 500;
  res.status(status).json({ error: message });
}
