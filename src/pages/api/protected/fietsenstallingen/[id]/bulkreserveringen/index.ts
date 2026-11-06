import type { NextApiRequest, NextApiResponse } from "next";
import {
  handleBulkServiceError,
  requireFietsenstallingBulkAccess,
} from "~/server/services/bulk-reservations/auth";
import {
  createBulkReservation,
  listBulkReservationsForStalling,
} from "~/server/services/bulk-reservations/service";

export default async function handle(req: NextApiRequest, res: NextApiResponse) {
  const access = await requireFietsenstallingBulkAccess(req, res);
  if (!access.ok) {
    res.status(access.status).json({ error: access.error });
    return;
  }

  try {
    if (req.method === "GET") {
      const sections = await listBulkReservationsForStalling(access.fietsenstallingId);
      res.status(200).json({ data: sections });
      return;
    }

    if (req.method === "POST") {
      const { sectieId, aantal, startDate, startTime, endTime, terugkerend } = req.body ?? {};
      if (sectieId == null || aantal == null || !startDate || !startTime || !endTime) {
        res.status(400).json({ error: "Ontbrekende velden" });
        return;
      }
      const result = await createBulkReservation(access.fietsenstallingId, {
        sectieId: Number(sectieId),
        aantal: Number(aantal),
        startDate: String(startDate),
        startTime: String(startTime),
        endTime: String(endTime),
        terugkerend: Boolean(terugkerend),
      });
      res.status(201).json({ data: result });
      return;
    }

    res.setHeader("Allow", "GET, POST");
    res.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    handleBulkServiceError(res, error);
  }
}
