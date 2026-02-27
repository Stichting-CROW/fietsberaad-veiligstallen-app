import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth";
import { authOptions } from "~/pages/api/auth/[...nextauth]";
import { userHasRight } from "~/types/utils";
import { VSSecurityTopic } from "~/types/securityprofile";
import { env } from "~/env.mjs";

/**
 * Returns FMS test credentials for the API compare page.
 * Only fietsberaad_superadmin. Requires FMS_TEST_USER and FMS_TEST_PASS in env.
 */
export default async function handle(
  req: NextApiRequest,
  res: NextApiResponse
) {
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

  const username = env.FMS_TEST_USER ?? "testgemeente-api";
  const password = env.FMS_TEST_PASS ?? null;

  if (!password) {
    return res.status(200).json({ username: "", password: "" });
  }

  return res.status(200).json({ username, password });
}
