import type { NextApiRequest, NextApiResponse } from "next";
import {
  handleBulkServiceError,
  requireFietsenstallingBulkAccess,
} from "~/server/services/bulk-reservations/auth";
import { addBulkException } from "~/server/services/bulk-reservations/service";

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
    if (req.method === "POST") {
      const datum = req.body?.datum;
      if (!datum) {
        res.status(400).json({ error: "Datum is verplicht" });
        return;
      }
      const result = await addBulkException(access.fietsenstallingId, bulkId, String(datum));
      res.status(201).json({ data: result });
      return;
    }

    res.setHeader("Allow", "POST");
    res.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    handleBulkServiceError(res, error);
  }
}
