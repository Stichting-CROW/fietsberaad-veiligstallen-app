import type { NextApiRequest, NextApiResponse } from "next";
import fmsSpec from "~/lib/openapi/fms-api-v4.json";

export default function handle(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }
  res.setHeader("Cache-Control", "no-store");
  res.status(200).json(fmsSpec);
}
