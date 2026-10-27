import type { NextApiRequest, NextApiResponse } from "next";
import { assertTestEnvUser, sendTestEnvError } from "~/server/test-env/http";
import { getSnapshotJob } from "~/server/test-env/job";

export default async function handle(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }
  res.setHeader("Cache-Control", "no-store");
  const live = getSnapshotJob();
  // A running copy has already removed the login row. Report that job before the user check.
  if (live?.status === "running") {
    res.status(200).json({ job: live });
    return;
  }
  if (!await assertTestEnvUser(req, res)) return;
  try {
    res.status(200).json({ job: live ?? null });
  } catch (error) {
    sendTestEnvError(res, error);
  }
}
