/**
 * FMS REST v2/v3 mutation policy:
 * - `ENABLE_WRITE_API`: must be set to a truthy value (`true`, `1`, `yes`) for mutations to be allowed.
 * - When enabled: writes require a logged-in fietsberaad_superadmin (Next-Auth), plus existing v2 Basic-auth validation.
 * - Reads are unchanged (no flag).
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";
import { authOptions } from "~/pages/api/auth/[...nextauth]";
import { VSSecurityTopic } from "~/types/securityprofile";
import { userHasRight } from "~/types/utils";

function isTruthyEnv(value: string | undefined): boolean {
  if (value == null || value === "") return false;
  const v = value.trim().toLowerCase();
  return v === "true" || v === "1" || v === "yes";
}

/** When false, all FMS v2/v3 write paths return 403. Set ENABLE_WRITE_API on environments that should allow writes (e.g. acceptance, local). */
export function isFmsWriteApiEnabled(): boolean {
  return isTruthyEnv(process.env.ENABLE_WRITE_API);
}

/**
 * Require ENABLE_WRITE_API and fietsberaad_superadmin session.
 * @returns false if response was sent
 */
export async function assertFmsWriteAllowedForSession(
  req: NextApiRequest,
  res: NextApiResponse
): Promise<boolean> {
  if (!isFmsWriteApiEnabled()) {
    res.status(403).json({ message: "FMS write API is disabled", status: 0 });
    return false;
  }
  const session = await getServerSession(req, res, authOptions);
  if (!session?.user?.securityProfile || !userHasRight(session.user.securityProfile, VSSecurityTopic.fietsberaad_superadmin)) {
    res.status(403).json({ message: "Forbidden", status: 0 });
    return false;
  }
  return true;
}
