/**
 * GET /api/reporting/occupation/surveys
 *
 * Port of getSurveys from the ColdFusion v2_occupation.cfc: all gemeenten in
 * the 'fms' module (unscoped, parity with the old API).
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { authenticateReportingRequest } from "~/server/services/reporting/reporting-request";
import { getSurveys } from "~/server/services/reporting/occupation-service";

export default async function handle(req: NextApiRequest, res: NextApiResponse) {
  const auth = await authenticateReportingRequest(req, res);
  if (!auth) return;

  try {
    const surveys = await getSurveys();
    res.status(200).json({ result: surveys });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal error";
    console.error("Reporting occupation surveys error:", error);
    res.status(400).json({ error: message });
  }
}
