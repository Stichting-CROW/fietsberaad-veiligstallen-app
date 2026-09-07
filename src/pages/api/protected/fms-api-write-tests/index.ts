import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth";
import { authOptions } from "~/pages/api/auth/[...nextauth]";
import { userHasRight } from "~/types/utils";
import { VSSecurityTopic } from "~/types/securityprofile";
import { ScopeError } from "~/server/services/fms/write-test-runner";
import {
  getApiWriteTestPreflight,
  listApiWriteScenarios,
  runApiWriteTests,
} from "~/server/services/fms/api-write-test-runner";

/**
 * Tier B — HTTP ingress FMS write tests.
 * GET: list scenarios. POST: run one or all via /api/fms (in-process when same host).
 */
export default async function handle(req: NextApiRequest, res: NextApiResponse) {
  const session = await getServerSession(req, res, authOptions);
  if (!session?.user) {
    return res.status(401).json({ message: "Niet ingelogd" });
  }
  if (!userHasRight(session.user.securityProfile, VSSecurityTopic.fietsberaad_superadmin)) {
    return res.status(403).json({ message: "Geen rechten" });
  }

  const suite =
    req.method === "GET"
      ? req.query.suite === "sequences"
        ? "sequences"
        : "api"
      : req.body?.suite === "sequences"
        ? "sequences"
        : "api";

  if (req.method === "GET") {
    const preflight = await getApiWriteTestPreflight();
    return res.status(200).json({
      scenarios: listApiWriteScenarios(suite),
      lockerPlace: preflight.lockerPlace,
      lockerConfigurationWarning: preflight.lockerConfigurationWarning,
    });
  }

  if (req.method === "POST") {
    const scenarioId =
      typeof req.body?.scenarioId === "string" && req.body.scenarioId.length > 0
        ? (req.body.scenarioId as string)
        : undefined;

    const protocol =
      (req.headers["x-forwarded-proto"] as string) ||
      (req.headers["x-forwarded-ssl"] === "on" ? "https" : "http");
    const host = (req.headers.host as string) || `localhost:${process.env.PORT ?? 3000}`;
    const baseUrlRaw =
      typeof req.body?.baseUrl === "string" && req.body.baseUrl
        ? req.body.baseUrl
        : `${protocol}://${host}`;
    const baseUrl = baseUrlRaw.replace(/\/$/, "");

    try {
      const result = await runApiWriteTests(baseUrl, scenarioId, suite, req.headers);
      return res.status(200).json({ ok: true, tier: suite === "sequences" ? "C" : "B", ...result });
    } catch (e) {
      if (e instanceof ScopeError) {
        return res.status(400).json({ ok: false, message: e.message });
      }
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[fms-api-write-tests] Error:", msg);
      return res.status(500).json({ ok: false, message: "Fout: " + msg });
    }
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ message: "Method not allowed" });
}
