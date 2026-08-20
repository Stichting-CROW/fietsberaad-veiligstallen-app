/**
 * V4 citycodes API — delegates to V3 except legacy transaction writes (removed in v4).
 */
import type { NextApiRequest, NextApiResponse } from "next";
import handleV3 from "../../v3/citycodes/[[...path]]";

const REMOVED_MESSAGE =
  "Dit endpoint is verwijderd in API v4. Gebruik POST …/managedtransactions. Voor legacy in/out of completedtransactions: gebruik /api/fms/v3/…";

/** Legacy in/out and completedtransaction writes blocked on v4 paths. */
function isRemovedV4WritePath(path: string[], method: string | undefined): boolean {
  if (method !== "POST") return false;
  if (path[1] !== "locations" || !path[2]) return false;

  // POST …/locations/{id}/completedtransactions
  if (path[3] === "completedtransactions" && !path[4]) return true;

  if (path[3] !== "sections" || !path[4]) return false;

  // POST …/sections/{sec}/transactions
  if (path[5] === "transactions" && !path[6]) return true;

  // POST …/sections/{sec}/completedtransactions
  if (path[5] === "completedtransactions" && !path[6]) return true;

  // POST …/places/{place}/transactions
  if (path[5] === "places" && path[6] && path[7] === "transactions") return true;

  return false;
}

export default async function handle(req: NextApiRequest, res: NextApiResponse) {
  const path = (req.query.path as string[]) ?? [];
  if (isRemovedV4WritePath(path, req.method)) {
    res.status(410).json({ message: REMOVED_MESSAGE, status: 0 });
    return;
  }
  return handleV3(req, res);
}
