import type { NextApiRequest, NextApiResponse } from "next";
/** Generated from reporting-api-v4.yaml (`npx --yes js-yaml src/lib/openapi/reporting-api-v4.yaml > src/lib/openapi/reporting-api-v4.json`). */
import reportingSpec from "~/lib/openapi/reporting-api-v4.json";

export default function handle(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }
  res.setHeader("Cache-Control", "no-store");
  res.status(200).json(reportingSpec);
}
