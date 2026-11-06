import type { NextApiRequest, NextApiResponse } from "next";
import {
  handleBulkServiceError,
  requireFietsenstallingBulkAccess,
} from "~/server/services/bulk-reservations/auth";
import { deleteBulkException } from "~/server/services/bulk-reservations/service";

export default async function handle(req: NextApiRequest, res: NextApiResponse) {
  const access = await requireFietsenstallingBulkAccess(req, res);
  if (!access.ok) {
    res.status(access.status).json({ error: access.error });
    return;
  }

  const exceptionId = Number(req.query.exceptionId);
  if (!Number.isFinite(exceptionId)) {
    res.status(400).json({ error: "Ongeldig uitzondering ID" });
    return;
  }

  try {
    if (req.method === "DELETE") {
      await deleteBulkException(access.fietsenstallingId, exceptionId);
      res.status(200).json({ ok: true });
      return;
    }

    res.setHeader("Allow", "DELETE");
    res.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    handleBulkServiceError(res, error);
  }
}
