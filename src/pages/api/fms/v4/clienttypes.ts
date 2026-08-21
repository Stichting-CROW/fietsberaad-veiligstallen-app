/**
 * V4 aux: GET /api/fms/v4/clienttypes
 * V2 getJsonClientTypes / REST/v1/getClientTypes had no V3 catalog; this is the V4 stub.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { getClientTypes } from "~/server/services/fms/fms-service";

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
  const types = await getClientTypes();
  res.status(200).json(
    types.map((t) => ({
      id: t.clientTypeID,
      name: t.name,
    }))
  );
}
