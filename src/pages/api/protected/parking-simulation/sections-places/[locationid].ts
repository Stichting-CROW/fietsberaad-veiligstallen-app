import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth";
import { authOptions } from "~/pages/api/auth/[...nextauth]";
import { userHasRight } from "~/types/utils";
import { VSSecurityTopic } from "~/types/securityprofile";
import { getLocation } from "~/server/services/fms/fms-v3-service";

/**
 * Get sections and places for a location. Fietsberaad superadmin only.
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

  const locationid = req.query.locationid as string;
  if (!locationid) {
    return res.status(400).json({ message: "locationid required" });
  }

  const location = await getLocation(locationid, 3);
  if (!location) {
    return res.status(404).json({ message: "Location not found" });
  }

  return res.status(200).json(location);
}
