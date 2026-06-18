/**
 * GET /api/reporting/citycodes/{citycode}/locations/{location}/transactions
 *
 * Port of getTransactionsForBikepark from the ColdFusion v1_reportingservice.cfc.
 * Authenticated with HTTP Basic auth against security_users (parity with the old API).
 */
import type { NextApiRequest, NextApiResponse } from "next";
import {
  parseBasicAuth,
  validateReportingAuth,
  assertLocationRights,
} from "~/server/services/reporting/reporting-auth";
import {
  getBikeparkTransactions,
  resolvePeriod,
  type TransactionType,
} from "~/server/services/reporting/transactions-service";

const VALID_TYPES: TransactionType[] = ["checkout", "checkin", "overlap"];

function firstValue(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

function set401(res: NextApiResponse, hadAuthHeader: boolean, message = "Unauthorized") {
  if (!hadAuthHeader) {
    res.setHeader("WWW-Authenticate", 'Basic realm="FMSService"');
  }
  res.status(401).json({ status: 0, message });
}

export default async function handle(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.status(405).json({ status: 0, message: `Method ${req.method} not allowed` });
    return;
  }

  const citycode = firstValue(req.query.citycode);
  const locationid = firstValue(req.query.location);

  if (!citycode || !locationid) {
    res.status(400).json({ status: 0, message: "citycode and location are required" });
    return;
  }

  const authHeader = req.headers.authorization;
  const credentials = parseBasicAuth(authHeader);
  if (!credentials) {
    set401(res, false);
    return;
  }

  try {
    const auth = await validateReportingAuth(credentials.username, credentials.password);
    if (!auth.ok) {
      set401(res, !!authHeader);
      return;
    }

    const authorized = await assertLocationRights(auth, locationid);
    if (!authorized) {
      set401(res, !!authHeader, "Niet voldoende rechten");
      return;
    }

    const typeParam = firstValue(req.query.type);
    const type: TransactionType =
      typeParam && (VALID_TYPES as string[]).includes(typeParam)
        ? (typeParam as TransactionType)
        : "checkout";

    const { from, to } = resolvePeriod({
      from: firstValue(req.query.from),
      to: firstValue(req.query.to),
      year: firstValue(req.query.year),
      month: firstValue(req.query.month),
    });

    const result = await getBikeparkTransactions({
      citycode,
      locationid,
      from,
      to,
      type,
    });

    res.status(200).json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal error";
    console.error("Reporting transactions error:", error);
    res.status(400).json({ status: 0, message });
  }
}
