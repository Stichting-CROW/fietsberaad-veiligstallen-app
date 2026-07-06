/**
 * V3 aux: GET /api/fms/v3/biketypes
 * ColdFusion BaseRestService.getbiketypes → [{ id, name, singular }]
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { getBikeTypes } from "~/server/services/fms/fms-service";

function setCors(res: NextApiResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
}

export default async function handle(req: NextApiRequest, res: NextApiResponse) {
  setCors(res);
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET, OPTIONS");
    res.status(405).json({ message: "Method not allowed", status: 0 });
    return;
  }
  const types = await getBikeTypes();
  res.status(200).json(
    types.map((t) => ({
      id: t.bikeTypeID,
      name: t.name,
      singular: t.naamenkelvoud,
    }))
  );
}
