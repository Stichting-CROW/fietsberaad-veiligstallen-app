import type { NextApiRequest, NextApiResponse } from "next";
import { assertTestEnvUser } from "~/server/test-env/http";
import { getSnapshotJob } from "~/server/test-env/job";

export default async function handle(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }
  if (!await assertTestEnvUser(req, res)) return;
  res.status(200).json({ job: getSnapshotJob() });
}
