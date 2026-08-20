/**
 * GET /api/reporting/occupation/organisations
 *
 * Port of getOrganisations from the ColdFusion v2_occupation.cfc: the
 * hardcoded organisations plus all FMS-module gemeenten (surveys).
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { authenticateReportingRequest } from "~/server/services/reporting/reporting-request";
import {
  OCCUPATION_ORGANISATIONS,
  getSurveys,
} from "~/server/services/reporting/occupation-service";

export default async function handle(req: NextApiRequest, res: NextApiResponse) {
  const auth = await authenticateReportingRequest(req, res);
  if (!auth) return;

  try {
    const surveys = await getSurveys();
    res.status(200).json({ result: [...OCCUPATION_ORGANISATIONS, ...surveys] });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal error";
    console.error("Reporting occupation organisations error:", error);
    res.status(400).json({ error: message });
  }
}
