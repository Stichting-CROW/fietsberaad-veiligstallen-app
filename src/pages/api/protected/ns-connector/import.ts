import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";
import { authOptions } from "~/pages/api/auth/[...nextauth]";
import { syncNsLocations, type NsSyncSummary } from "~/server/services/ns-connector/sync";
import { userHasRight } from "~/types/utils";
import { VSSecurityTopic } from "~/types/securityprofile";

export type NsImportResponse = {
  success: boolean;
  summary?: NsSyncSummary;
  error?: string;
};

export default async function handle(req: NextApiRequest, res: NextApiResponse<NsImportResponse>) {
  if (req.method !== "POST") {
    res.status(405).json({ success: false, error: "Method not allowed" });
    return;
  }

  const session = await getServerSession(req, res, authOptions);
  if (!session?.user) {
    res.status(401).json({ success: false, error: "Unauthorized" });
    return;
  }

  const dryRun = req.body?.dryRun !== false;
  if (!dryRun) {
    const isSuperadmin = userHasRight(session.user.securityProfile, VSSecurityTopic.fietsberaad_superadmin);
    if (!isSuperadmin) {
      res.status(403).json({ success: false, error: "Forbidden: fietsberaad_superadmin required for import" });
      return;
    }
  }

  try {
    const summary = await syncNsLocations({ dryRun });
    res.status(200).json({ success: true, summary });
  } catch (error) {
    console.error("[NS Connector] Import error:", error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred",
    });
  }
}
