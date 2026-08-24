/**
 * V4 citycodes API — public owner of the shared citycodes router.
 * Legacy In/Uit and completedtransaction writes return 410.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import handleCitycodes from "~/server/services/fms/fms-citycodes-router";

const REMOVED_MESSAGE =
  "Dit endpoint is verwijderd in API v4. Gebruik POST …/managedtransactions. Voor legacy in/out, completedtransactions of fietskluizen: gebruik v2/v3 op de ColdFusion-host.";

/** Legacy In/Uit, completedtransaction, locker writes, and unused place idcodes blocked on v4. */
function isRemovedV4WritePath(path: string[], method: string | undefined): boolean {
  if (path[1] !== "locations" || !path[2]) return false;

  if (method === "POST") {
    if (path[3] === "completedtransactions" && !path[4]) return true;
    if (path[3] === "sections" && path[4]) {
      if (path[5] === "transactions" && !path[6]) return true;
      if (path[5] === "completedtransactions" && !path[6]) return true;
      if (path[5] === "places" && path[6] && path[7] === "transactions") return true;
    }
  }

  // Place-level isAllowedToUse (GET) and koppelpas (POST) — unused on v4 (Java /v1 for buurtstallingen).
  if (
    path[3] === "sections" &&
    path[4] &&
    path[5] === "places" &&
    path[6] &&
    path[7] === "idcodes"
  ) {
    return true;
  }

  // Fietskluizen writes phased out on v4 (updatePlace / updateLocker / logs / actions / place subscriptions).
  if (
    (method === "PUT" || method === "POST") &&
    path[3] === "sections" &&
    path[4] &&
    path[5] === "places" &&
    path[6]
  ) {
    const placeSub = path[7];
    if (!placeSub) return true;
    if (placeSub === "logs" || placeSub === "actions" || placeSub === "subscriptions") return true;
  }

  return false;
}

export default async function handle(req: NextApiRequest, res: NextApiResponse) {
  const path = (req.query.path as string[]) ?? [];
  if (isRemovedV4WritePath(path, req.method)) {
    res.status(410).json({ message: REMOVED_MESSAGE, status: 0 });
    return;
  }
  return handleCitycodes(req, res);
}
