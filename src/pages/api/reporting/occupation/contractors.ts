/**
 * GET /api/reporting/occupation/contractors
 *
 * Port of getContractors from the ColdFusion v2_occupation.cfc: the unique
 * contractors (occupation data sources) of the user's static sections.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import {
  authenticateReportingRequest,
  listValue,
} from "~/server/services/reporting/reporting-request";
import {
  getStaticData,
  getOrganisationById,
} from "~/server/services/reporting/occupation-service";

export default async function handle(req: NextApiRequest, res: NextApiResponse) {
  const auth = await authenticateReportingRequest(req, res);
  if (!auth) return;

  try {
    const staticSections = (
      await getStaticData(auth, { geopolygon: listValue(req.query.geopolygon) })
    ).result;

    // CF SetAppend: dedupe by id, keeping first-encountered order
    const result: { id: string; name?: string }[] = [];
    for (const section of staticSections) {
      for (const contractorId of section.contractorIds) {
        if (!result.some((organisation) => organisation.id === contractorId)) {
          result.push(getOrganisationById(contractorId));
        }
      }
    }

    res.status(200).json({ result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal error";
    console.error("Reporting occupation contractors error:", error);
    res.status(400).json({ error: message });
  }
}
