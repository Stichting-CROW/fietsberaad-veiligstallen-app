import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth";
import { authOptions } from "~/pages/api/auth/[...nextauth]";
import { userHasRight } from "~/types/utils";
import { VSSecurityTopic } from "~/types/securityprofile";
import { resolveTestFmsCredentials } from "~/server/services/fms/fms-test-credentials";

/**
 * Returns FMS test credentials for the API compare page.
 * Uses FMS_TEST_USER/FMS_TEST_PASS when both set; otherwise the testgemeente dataprovider in DB.
 * Not used by parkeersimulatie (browser localStorage there).
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

  const creds = await resolveTestFmsCredentials();

  if (!creds.password) {
    return res.status(200).json({
      username: "",
      password: "",
      source: creds.source,
      hint: "Stel FMS_TEST_USER/FMS_TEST_PASS in, of koppel een dataleverancier via gemeente → FMS rechten",
    });
  }

  return res.status(200).json({
    username: creds.username,
    password: creds.password,
    source: creds.source,
  });
}
