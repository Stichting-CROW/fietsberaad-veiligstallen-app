import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth";
import { authOptions } from "~/pages/api/auth/[...nextauth]";
import { userHasRight } from "~/types/utils";
import { VSSecurityTopic } from "~/types/securityprofile";
import { listWriteScenarios, runWriteTests, ScopeError } from "~/server/services/fms/write-test-runner";

/**
 * FMS write-side (Tier A) golden tests.
 * - GET: list available scenarios.
 * - POST { scenarioId? }: run one scenario, or all when omitted. Returns per-scenario results.
 *
 * All writes are confined to the testgemeente organization and the shadow new_* tables; each
 * run cleans up the synthetic rows it creates. Fietsberaad superadmin only.
 */
export default async function handle(req: NextApiRequest, res: NextApiResponse) {
  const session = await getServerSession(req, res, authOptions);
  if (!session?.user) {
    return res.status(401).json({ message: "Niet ingelogd" });
  }
  if (!userHasRight(session.user.securityProfile, VSSecurityTopic.fietsberaad_superadmin)) {
    return res.status(403).json({ message: "Geen rechten" });
  }

  if (req.method === "GET") {
    return res.status(200).json({ scenarios: listWriteScenarios() });
  }

  if (req.method === "POST") {
    const scenarioId =
      typeof req.body?.scenarioId === "string" && req.body.scenarioId.length > 0
        ? (req.body.scenarioId as string)
        : undefined;
    try {
      const result = await runWriteTests(scenarioId);
      return res.status(200).json({ ok: true, ...result });
    } catch (e) {
      if (e instanceof ScopeError) {
        return res.status(400).json({ ok: false, message: e.message });
      }
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[fms-write-tests] Error:", msg);
      return res.status(500).json({ ok: false, message: "Fout: " + msg });
    }
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ message: "Method not allowed" });
}
