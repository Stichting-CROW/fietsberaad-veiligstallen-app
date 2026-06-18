import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth";
import { authOptions } from "~/pages/api/auth/[...nextauth]";
import { userHasRight } from "~/types/utils";
import { VSSecurityTopic } from "~/types/securityprofile";
import { getScopeOptions } from "~/server/services/reporting-compare/reporting-compare-service";

/**
 * GET /api/protected/reporting-compare/scope-options?dataOwnerId=...
 * Returns dataowners (organizations owning stallingen) and, when a dataOwnerId is given,
 * the stallingen for that dataowner. Used by the cascading scope selectors.
 * Fietsberaad superadmin only.
 */
export default async function handle(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ message: "Method not allowed" });
  }

  const session = await getServerSession(req, res, authOptions);
  if (!session?.user) {
    return res.status(401).json({ message: "Niet ingelogd" });
  }
  if (!userHasRight(session.user.securityProfile, VSSecurityTopic.fietsberaad_superadmin)) {
    return res.status(403).json({ message: "Geen rechten" });
  }

  const dataOwnerId = typeof req.query.dataOwnerId === "string" ? req.query.dataOwnerId : undefined;

  try {
    const options = await getScopeOptions(dataOwnerId);
    return res.status(200).json(options);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[reporting-compare/scope-options] error:", msg);
    return res.status(500).json({ message: "Fout: " + msg });
  }
}
