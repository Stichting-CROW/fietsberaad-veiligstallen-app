import type { NextApiRequest, NextApiResponse } from "next";
import { listCouncils } from "~/modules/citizen-accounts/service";

export default async function handle(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Methode niet toegestaan" });
    return;
  }
  res.status(200).json({ councils: await listCouncils() });
}
