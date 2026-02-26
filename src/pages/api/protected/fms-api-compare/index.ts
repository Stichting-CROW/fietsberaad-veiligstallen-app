import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth";
import { authOptions } from "~/pages/api/auth/[...nextauth]";
import { userHasRight } from "~/types/utils";
import { VSSecurityTopic } from "~/types/securityprofile";
import { env } from "~/env.mjs";

/**
 * Proxy for FMS API comparison. Fetches old and new API from the backend to avoid CORS.
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
  if (useApiCredentials && env.FMS_TEST_USER && env.FMS_TEST_PASS) {
    headers.Authorization = `Basic ${Buffer.from(`${env.FMS_TEST_USER}:${env.FMS_TEST_PASS}`).toString("base64")}`;
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

  const [oldResult, newResult] = await Promise.all([
    (async () => {
      const start = performance.now();
      try {
        const r = await fetch(oldUrl, { headers });
        const text = await r.text();
        if (!r.ok) {
          const msg = `HTTP ${r.status}: ${text.slice(0, 200)}`;
          console.error("FMS API compare (old):", msg);
          return { text: null, durationMs: performance.now() - start, error: msg };
        }
        const bodyError = looksLikeErrorResponse(text);
        if (bodyError) {
          console.error("FMS API compare (old):", bodyError);
          return { text: null, durationMs: performance.now() - start, error: bodyError };
        }
        return { text, durationMs: performance.now() - start, error: null as string | null };
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Fetch failed";
        console.error("FMS API compare (old):", msg);
        return { text: null, durationMs: null, error: msg };
      }
    })(),
    (async () => {
      const start = performance.now();
      try {
        const r = await fetch(newUrl, { headers });
        const text = await r.text();
        if (!r.ok) {
          const msg = `HTTP ${r.status}: ${text.slice(0, 200)}`;
          console.error("FMS API compare (new):", msg);
          return { text: null, durationMs: performance.now() - start, error: msg };
        }
        return { text, durationMs: performance.now() - start, error: null as string | null };
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Fetch failed";
        console.error("FMS API compare (new):", msg);
        return { text: null, durationMs: null, error: msg };
      }
    })(),
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
