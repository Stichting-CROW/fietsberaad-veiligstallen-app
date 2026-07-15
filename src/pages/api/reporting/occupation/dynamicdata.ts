/**
 * GET /api/reporting/occupation/dynamicdata
 *
 * Port of getDynamicData from the ColdFusion v2_occupation.cfc: the occupation
 * (bezettingsdata) time series for the authorized static sections.
 * Also served as /api/reporting/occupation/dynamic (the CF canonical path).
 */
import type { NextApiRequest, NextApiResponse } from "next";
import {
  authenticateReportingRequest,
  firstValue,
  listValue,
} from "~/server/services/reporting/reporting-request";
import {
  getStaticData,
  getDynamicData,
  parseCfDateParam,
  defaultStartDate,
  defaultEndDate,
  VALID_ORDER_BY,
} from "~/server/services/reporting/occupation-service";

const DEFAULT_PAGE_SIZE_DYNAMIC_DATA = 1000;

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (value === undefined || value === "") return fallback;
  const n = parseInt(value, 10);
  if (Number.isNaN(n) || n < 1) {
    throw new Error(`Value '${value}' is not a valid number`);
  }
  return n;
}

export default async function handle(req: NextApiRequest, res: NextApiResponse) {
  const auth = await authenticateReportingRequest(req, res);
  if (!auth) return;

  try {
    // Validation, with the same error messages as the old CF API.
    const groupBy = firstValue(req.query.groupBy);
    if (groupBy !== undefined && groupBy.toLowerCase() !== "staticsectionid") {
      res.status(400).json({
        error: `Value '${groupBy}' is not a valid value for param 'groupby'. Did you mean: 'staticSectionId'?`,
      });
      return;
    }
    const orderBy = firstValue(req.query.orderBy);
    if (orderBy !== undefined && !VALID_ORDER_BY.includes(orderBy.toLowerCase())) {
      res.status(400).json({
        error: `Value '${orderBy}' is not a valid value for param 'orderby'. Did you mean: 'timestamp', 'parkingcapacity', 'occupiedspaces' or 'vacantspaces'?`,
      });
      return;
    }

    const depth = parsePositiveInt(firstValue(req.query.depth), 1);
    const page = parsePositiveInt(firstValue(req.query.page), 1);
    const pageSize = parsePositiveInt(
      firstValue(req.query.pageSize),
      DEFAULT_PAGE_SIZE_DYNAMIC_DATA
    );

    const startDateParam = firstValue(req.query.startDate);
    const endDateParam = firstValue(req.query.endDate);
    const startDate = startDateParam ? parseCfDateParam(startDateParam) : defaultStartDate();
    const endDate = endDateParam ? parseCfDateParam(endDateParam) : defaultEndDate();

    // Resolve the authorized static sections (same filters as /staticdata).
    const staticSections = (
      await getStaticData(auth, {
        staticSectionId: listValue(req.query.staticSectionId),
        surveyId: listValue(req.query.surveyId),
        authorityId: listValue(req.query.authorityId),
        geopolygon: listValue(req.query.geopolygon),
      })
    ).result;

    const result = await getDynamicData({
      staticSectionIds: staticSections.map((section) => section.id),
      startDate,
      endDate,
      groupBySection: depth > 1,
      orderBy,
      orderDirection: firstValue(req.query.orderDirection),
      source: firstValue(req.query.contractorId),
      page,
      pageSize,
      groupBy,
    });

    res.status(200).json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal error";
    console.error("Reporting occupation dynamicdata error:", error);
    res.status(400).json({ error: message });
  }
}
