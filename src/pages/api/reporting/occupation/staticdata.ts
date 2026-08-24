/**
 * GET /api/reporting/occupation/staticdata
 *
 * Port of getStaticData from the ColdFusion v2_occupation.cfc: the static
 * sections (= FMS bikeparks) the authenticated user is authorized for.
 * Also served as /api/reporting/occupation/static (the CF canonical path).
 */
import type { NextApiRequest, NextApiResponse } from "next";
import {
  authenticateReportingRequest,
  listValue,
} from "~/server/services/reporting/reporting-request";
import { getStaticData } from "~/server/services/reporting/occupation-service";

export default async function handle(req: NextApiRequest, res: NextApiResponse) {
  const auth = await authenticateReportingRequest(req, res);
  if (!auth) return;

  try {
    const result = await getStaticData(auth, {
      staticSectionId: listValue(req.query.staticSectionId),
      surveyId: listValue(req.query.surveyId),
      authorityId: listValue(req.query.authorityId),
      geopolygon: listValue(req.query.geopolygon),
    });
    res.status(200).json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal error";
    console.error("Reporting occupation staticdata error:", error);
    res.status(400).json({ error: message });
  }
}
