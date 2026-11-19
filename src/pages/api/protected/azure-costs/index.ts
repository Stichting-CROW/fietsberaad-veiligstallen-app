import fs from "fs";
import path from "path";
import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth";
import { authOptions } from "~/pages/api/auth/[...nextauth]";
import { userHasRight } from "~/types/utils";
import { VSSecurityTopic } from "~/types/securityprofile";
import type { CostSummary } from "~/server/azure-costs/types";

export default async function handle(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const session = await getServerSession(req, res, authOptions);
  if (!session?.user) {
    res.status(401).json({ error: "Niet ingelogd" });
    return;
  }
  if (!userHasRight(session.user.securityProfile, VSSecurityTopic.fietsberaad_superadmin)) {
    res.status(403).json({ error: "Alleen fietsberaad superadmin" });
    return;
  }

  const file = path.join(process.cwd(), "data/azure-costs/summary.json");
  if (!fs.existsSync(file)) {
    res.status(200).json({ available: false });
    return;
  }

  try {
    const summary = JSON.parse(fs.readFileSync(file, "utf8")) as CostSummary;
    res.status(200).json({ available: true, summary });
  } catch {
    res.status(500).json({ error: "Lokaal kostenbestand is onleesbaar" });
  }
}
