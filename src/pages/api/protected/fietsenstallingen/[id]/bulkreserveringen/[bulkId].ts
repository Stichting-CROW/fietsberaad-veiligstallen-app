import type { NextApiRequest, NextApiResponse } from "next";
import {
  handleBulkServiceError,
  requireFietsenstallingBulkAccess,
} from "~/server/services/bulk-reservations/auth";
import { deleteBulkReservation } from "~/server/services/bulk-reservations/service";

export default async function handle(req: NextApiRequest, res: NextApiResponse) {
  const access = await requireFietsenstallingBulkAccess(req, res);
  if (!access.ok) {
    res.status(access.status).json({ error: access.error });
    return;
  }

  const bulkId = Number(req.query.bulkId);
  if (!Number.isFinite(bulkId)) {
    res.status(400).json({ error: "Ongeldig bulkreservering ID" });
    return;
  }

  try {
    if (req.method === "DELETE") {
      await deleteBulkReservation(access.fietsenstallingId, bulkId);
      res.status(200).json({ ok: true });
      return;
    }

    res.setHeader("Allow", "DELETE");
    res.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    handleBulkServiceError(res, error);
  }
}
