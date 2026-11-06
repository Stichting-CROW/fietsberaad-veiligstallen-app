import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth";
import { authOptions } from "~/pages/api/auth/[...nextauth]";
import { VSSecurityTopic } from "~/types/securityprofile";
import { userHasRight } from "~/types/utils";
import { validateUserSession } from "~/utils/server/database-tools";

/**
 * Beheer of citizen accounts, subscriptions and saldo: the abonnementsvormen right for the active
 * organisation, or Fietsberaad admin. `fietsberaadOnly` is for global data such as top-up products.
 */
export async function requireCitizenBeheer(
  req: NextApiRequest,
  res: NextApiResponse,
  options: { fietsberaadOnly?: boolean } = {},
): Promise<{ siteId: string } | null> {
  const session = await getServerSession(req, res, authOptions);
  const valid = await validateUserSession(session, "organizations");
  if ("error" in valid || !valid.activeContactId) {
    res.status(401).json({ error: "error" in valid ? valid.error : "Geen actieve organisatie" });
    return null;
  }
  const profile = session?.user?.securityProfile;
  const fietsberaad = userHasRight(profile, VSSecurityTopic.fietsberaad_admin) || userHasRight(profile, VSSecurityTopic.fietsberaad_superadmin);
  const allowed = options.fietsberaadOnly
    ? fietsberaad && valid.activeContactId === "1"
    : fietsberaad || userHasRight(profile, VSSecurityTopic.abonnementsvormen_beheerrecht);
  if (!allowed) {
    res.status(403).json({ error: "Geen rechten" });
    return null;
  }
  return { siteId: valid.activeContactId };
}
