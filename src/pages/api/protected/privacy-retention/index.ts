import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth";
import { authOptions } from "~/pages/api/auth/[...nextauth]";
import { parseRunBody, RetentionGuardError } from "~/server/privacy/retention-rules";
import { abortRun, getRun, issueWriteCode, listRuns, rotateWriteCode, startRun, stepRun, writesEnabled } from "~/server/privacy/retention-service";
import { userHasRight } from "~/types/utils";
import { VSSecurityTopic } from "~/types/securityprofile";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = await getServerSession(req, res, authOptions);
  if (!session?.user) return res.status(401).json({ error: "Unauthorized" });
  if (!userHasRight(session.user.securityProfile, VSSecurityTopic.fietsberaad_superadmin)) {
    return res.status(403).json({ error: "Forbidden" });
  }

  const userKey = session.user.email || session.user.name || session.user.id || "superadmin";

  try {
    if (req.method === "GET") {
      const payload = {
        writesEnabled: writesEnabled(),
        appEnv: process.env.NEXT_PUBLIC_APP_ENV ?? "development",
        writeCode: req.query.freshCode === "1" ? rotateWriteCode(userKey) : issueWriteCode(userKey),
      };
      const runId = Number(req.query.runId);
      if (Number.isInteger(runId) && runId > 0) {
        const detail = await getRun(runId);
        if (!detail) return res.status(404).json({ error: "Run niet gevonden" });
        return res.status(200).json({ ...payload, ...detail });
      }
      const runs = await listRuns();
      return res.status(200).json({ ...payload, runs });
    }

    if (req.method === "POST") {
      const parsed = parseRunBody(req.body);
      if (parsed.op === "start") {
        const run = await startRun({
          mode: parsed.mode,
          startedBy: userKey,
          confirm: parsed.confirm,
          source: "page",
        });
        return res.status(200).json({ run });
      }
      if (!parsed.runId) return res.status(400).json({ error: "runId ontbreekt" });
      if (parsed.op === "abort") {
        const run = await abortRun(parsed.runId);
        const detail = await getRun(run.id);
        return res.status(200).json(detail);
      }
      const run = await stepRun(parsed.runId);
      const detail = await getRun(run.id);
      if (run.mode === "write") {
        return res.status(200).json({ ...detail, writeCode: rotateWriteCode(userKey) });
      }
      return res.status(200).json(detail);
    }

    res.setHeader("Allow", "GET, POST");
    return res.status(405).end();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = error instanceof RetentionGuardError ? 409 : 500;
    return res.status(status).json({ error: message });
  }
}
