/**
 * FMS REST v2/v3 mutation policy.
 *
 * - `ENABLE_WRITE_API`: must be set to a truthy value (`true`, `1`, `yes`) for
 *   mutations to be allowed at all. This is an environment-level kill switch so
 *   writes can be disabled entirely (e.g. on environments where the FMS write
 *   API should never run).
 * - Authorization of writes is handled exactly like the legacy ColdFusion FMS
 *   REST API: by HTTP Basic Auth on the dataprovider/operator account plus its
 *   per-stalling `permit` (checked in the route handlers via `validateFmsAuth` /
 *   `requireV3Auth`). There is intentionally NO Next-Auth session requirement -
 *   the API is meant to be consumed by machine clients using Basic Auth.
 * - Reads are unchanged (no flag).
 */

import type { NextApiResponse } from "next";

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
 * Gate FMS writes on the ENABLE_WRITE_API environment kill switch.
 * Per-request authorization (Basic Auth + operator/dataprovider permit) is
 * enforced by the route handlers themselves.
 *
 * @returns false if a response (403) was sent
 */
export function assertFmsWriteApiEnabled(res: NextApiResponse): boolean {
  if (!isFmsWriteApiEnabled()) {
    res.status(403).json({ message: "FMS write API is disabled", status: 0 });
    return false;
  }
  return true;
}
