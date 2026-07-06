/**
 * V3 aux: GET /api/fms/v3/paymenttypes
 * ColdFusion BaseRestService.getPaymenttypes → [{ paymenttypeid, name, description }]
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { getPaymentTypes } from "~/server/services/fms/fms-service";

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
  const types = await getPaymentTypes();
  res.status(200).json(
    types.map((t) => ({
      paymenttypeid: t.paymentTypeID,
      name: t.name,
      description: t.description,
    }))
  );
}
