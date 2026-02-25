import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth";
import { authOptions } from "~/pages/api/auth/[...nextauth]";
import { userHasRight } from "~/types/utils";
import { VSSecurityTopic } from "~/types/securityprofile";
import { env } from "~/env.mjs";

/**
 * Proxy for FMS API comparison. Fetches old and new API from the backend to avoid CORS.
 * Only fietsberaad_superadmin.
 */
export default async function handle(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ message: "Method not allowed" });
  }

  const session = await getServerSession(req, res, authOptions);
  if (!session?.user) {
    return res.status(401).json({ message: "Niet ingelogd" });
  }
  if (!userHasRight(session.user.securityProfile, VSSecurityTopic.fietsberaad_superadmin)) {
    return res.status(403).json({ message: "Geen rechten" });
  }

  const { oldUrl, newUrl, useApiCredentials, authorizationHeader } = req.body as {
    oldUrl?: string;
    newUrl?: string;
    useApiCredentials?: boolean;
    authorizationHeader?: string;
  };

  if (!oldUrl || !newUrl || typeof oldUrl !== "string" || typeof newUrl !== "string") {
    return res.status(400).json({ message: "oldUrl en newUrl verplicht" });
  }

  const headers: Record<string, string> = { Accept: "application/json" };
  if (useApiCredentials && env.FMS_TEST_USER && env.FMS_TEST_PASS) {
    headers.Authorization = `Basic ${Buffer.from(`${env.FMS_TEST_USER}:${env.FMS_TEST_PASS}`).toString("base64")}`;
  } else if (typeof authorizationHeader === "string" && authorizationHeader.startsWith("Basic ")) {
    headers.Authorization = authorizationHeader;
  }

  try {
    const [oldRes, newRes] = await Promise.all([
      fetch(oldUrl, { headers }).then((r) => r.text()),
      fetch(newUrl, { headers }).then((r) => r.text()),
    ]);

    return res.status(200).json({ oldResult: oldRes, newResult: newRes });
  } catch (err) {
    console.error("FMS API compare error:", err);
    return res.status(500).json({
      message: err instanceof Error ? err.message : "Fetch failed",
    });
  }
}
