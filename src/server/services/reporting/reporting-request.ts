/**
 * Shared request handling for the /api/reporting/* REST endpoints:
 * method guard + HTTP Basic auth against security_users (ColdFusion parity).
 */
import type { NextApiRequest, NextApiResponse } from "next";
import {
  parseBasicAuth,
  validateReportingAuth,
  type ReportingAuthResult,
} from "~/server/services/reporting/reporting-auth";

export type ReportingAuth = Extract<ReportingAuthResult, { ok: true }>;

export function firstValue(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

/** Comma-joined query param (repeated params become one comma-separated list). */
export function listValue(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value.join(",");
  return value;
}

export function set401(res: NextApiResponse, hadAuthHeader: boolean, message = "Unauthorized") {
  if (!hadAuthHeader) {
    res.setHeader("WWW-Authenticate", 'Basic realm="FMSService"');
  }
  res.status(401).json({ status: 0, message });
}

/**
 * Guard a reporting endpoint: only GET, valid Basic auth credentials.
 * Returns the auth context, or null when a response has already been written.
 */
export async function authenticateReportingRequest(
  req: NextApiRequest,
  res: NextApiResponse
): Promise<ReportingAuth | null> {
  if (req.method !== "GET") {
    res.status(405).json({ status: 0, message: `Method ${req.method} not allowed` });
    return null;
  }

  const authHeader = req.headers.authorization;
  const credentials = parseBasicAuth(authHeader);
  if (!credentials) {
    set401(res, false);
    return null;
  }

  const auth = await validateReportingAuth(credentials.username, credentials.password);
  if (!auth.ok) {
    set401(res, !!authHeader);
    return null;
  }

  return auth;
}
