import type { NextApiRequest, NextApiResponse } from "next";
import { assertTestEnvUser, sendTestEnvError } from "~/server/test-env/http";
import { beginSnapshotJob, failActivePhase, getSnapshotJob } from "~/server/test-env/job";
import { runSnapshot, type SnapshotRequest } from "~/server/test-env/snapshot";
import { TestEnvError } from "~/server/test-env/guard";

export default async function handle(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }
  if (!await assertTestEnvUser(req, res)) return;

  const body = req.body as Partial<SnapshotRequest> & { confirm?: string };
  if (body.confirm !== "WISSEN") {
    res.status(400).json({ error: "Typ WISSEN om de doeldatabase te vervangen" });
    return;
  }
  if (getSnapshotJob()?.status === "running") {
    res.status(409).json({ error: "Er loopt al een snapshot" });
    return;
  }

  try {
    const job = beginSnapshotJob();
    const input: SnapshotRequest = {
      ownerIds: Array.isArray(body.ownerIds) ? body.ownerIds.map(String) : [],
      exploitantIds: Array.isArray(body.exploitantIds) ? body.exploitantIds.map(String) : [],
      stallingIds: Array.isArray(body.stallingIds) ? body.stallingIds.map(String) : [],
      from: String(body.from ?? ""),
      to: String(body.to ?? ""),
      copyAllOwnerAccounts: body.copyAllOwnerAccounts === true,
      copyAllOwnerBarcodes: body.copyAllOwnerBarcodes === true,
    };
    void runSnapshot(job, input).catch((error: unknown) => {
      job.status = "error";
      failActivePhase(job);
      job.error = error instanceof Error ? error.message : String(error);
      job.finishedAt = new Date().toISOString();
      if (!(error instanceof TestEnvError)) console.error("test-env snapshot", error);
    });
    res.status(202).json({ job });
  } catch (error) {
    sendTestEnvError(res, error);
  }
}
