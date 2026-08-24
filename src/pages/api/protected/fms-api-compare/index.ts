import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth";
import { authOptions } from "~/pages/api/auth/[...nextauth]";
import { userHasRight } from "~/types/utils";
import { VSSecurityTopic } from "~/types/securityprofile";
import { buildTestFmsAuthHeader } from "~/server/services/fms/fms-test-credentials";
import { fetchApiUrl, formatFetchError } from "~/server/utils/internal-api-fetch";

/**
 * Proxy for FMS API comparison. Fetches old and new API from the backend to avoid CORS.
 * Same-host new API URLs are invoked in-process (no loopback HTTP).
 * Only fietsberaad_superadmin.
 */
export default async function handle(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ message: "Method not allowed" });
  }

  const session = await getServerSession(req, res, authOptions);
  if (!session?.user) {
    return res.status(401).json({ message: "Niet ingelogd" });
  }
  if (!userHasRight(session.user.securityProfile, VSSecurityTopic.fietsberaad_superadmin)) {
    return res.status(403).json({ message: "Geen rechten" });
  }

  const { oldUrl, newUrl, useApiCredentials, authorizationHeader } = req.body as {
    oldUrl?: string;
    newUrl?: string;
    useApiCredentials?: boolean;
    authorizationHeader?: string;
  };

  if (!oldUrl || !newUrl || typeof oldUrl !== "string" || typeof newUrl !== "string") {
    return res.status(400).json({ message: "oldUrl en newUrl verplicht" });
  }

  const headers: Record<string, string> = { Accept: "application/json" };
  if (useApiCredentials) {
    const auth = await buildTestFmsAuthHeader();
    if (auth) headers.Authorization = auth;
  } else if (typeof authorizationHeader === "string" && authorizationHeader.startsWith("Basic ")) {
    headers.Authorization = authorizationHeader;
  }

  /** Detect if response body indicates an error (old API may return 200 with error JSON). */
  const looksLikeErrorResponse = (text: string): string | null => {
    if (!text || text.trim().length === 0) return "Empty response";
    try {
      const obj = JSON.parse(text) as unknown;
      if (obj && typeof obj === "object" && !Array.isArray(obj)) {
        const o = obj as Record<string, unknown>;
        if (typeof o.error === "string" && o.error.length > 0) return o.error;
      }
    } catch {
      /* not JSON */
    }
    return null;
  };

  const fetchSide = async (
    url: string,
    label: "old" | "new",
    checkBodyError: boolean
  ) => {
    const start = performance.now();
    try {
      const r = await fetchApiUrl(url, { headers }, req.headers);
      if (!r.ok) {
        const msg = `HTTP ${r.status}: ${r.text.slice(0, 200)}`;
        console.error(`FMS API compare (${label}):`, msg);
        return { text: null, durationMs: performance.now() - start, error: msg };
      }
      if (checkBodyError) {
        const bodyError = looksLikeErrorResponse(r.text);
        if (bodyError) {
          console.error(`FMS API compare (${label}):`, bodyError);
          return { text: null, durationMs: performance.now() - start, error: bodyError };
        }
      }
      return { text: r.text, durationMs: performance.now() - start, error: null as string | null };
    } catch (err) {
      const msg = formatFetchError(err);
      console.error(`FMS API compare (${label}):`, msg, err);
      return { text: null, durationMs: null, error: msg };
    }
  };

  const [oldResult, newResult] = await Promise.all([
    fetchSide(oldUrl, "old", true),
    fetchSide(newUrl, "new", false),
  ]);

  const oldError = oldResult.error;
  const newError = newResult.error;

  if (oldError && newError) {
    return res.status(500).json({
      message: "Beide API's faalden",
      oldError,
      newError,
    });
  }

  return res.status(200).json({
    oldResult: oldResult.text ?? "",
    newResult: newResult.text ?? "",
    oldDurationSeconds: oldResult.durationMs != null ? Number((oldResult.durationMs / 1000).toFixed(3)) : null,
    newDurationSeconds: newResult.durationMs != null ? Number((newResult.durationMs / 1000).toFixed(3)) : null,
    oldError: oldError ?? null,
    newError: newError ?? null,
  });
}
