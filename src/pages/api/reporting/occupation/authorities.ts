/**
 * GET /api/reporting/occupation/authorities
 *
 * Port of getAuthorities from the ColdFusion v2_occupation.cfc: the unique
 * authorities (gemeenten) derived from the user's static sections.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import {
  authenticateReportingRequest,
  listValue,
} from "~/server/services/reporting/reporting-request";
import {
  getStaticData,
  getAuthorityById,
} from "~/server/services/reporting/occupation-service";

export default async function handle(req: NextApiRequest, res: NextApiResponse) {
  const auth = await authenticateReportingRequest(req, res);
  if (!auth) return;

  try {
    const staticSections = (
      await getStaticData(auth, { geopolygon: listValue(req.query.geopolygon) })
    ).result;

    // CF SetAppend: dedupe by id, keeping first-encountered order
    const authorityIds: string[] = [];
    for (const section of staticSections) {
      for (const surveyId of section.surveyIds) {
        if (surveyId && !authorityIds.includes(surveyId)) {
          authorityIds.push(surveyId);
        }
      }
    }

    const result = await Promise.all(authorityIds.map((id) => getAuthorityById(id)));
    res.status(200).json({ result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal error";
    console.error("Reporting occupation authorities error:", error);
    res.status(400).json({ error: message });
  }
}
