import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth";
import { authOptions } from "~/pages/api/auth/[...nextauth]";
import { userHasRight } from "~/types/utils";
import { VSSecurityTopic } from "~/types/securityprofile";
import { getTariefValidationReport, type TariefValidationReportRow } from "~/server/services/tarieven";

export type TariefValidationReportResponse = {
  success: boolean;
  data?: TariefValidationReportRow[];
  error?: string;
};

export default async function handle(
  req: NextApiRequest,
  res: NextApiResponse<TariefValidationReportResponse>
) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method Not Allowed" });
    return;
  }

  const session = await getServerSession(req, res, authOptions);
  if (!session?.user) {
    console.error("Unauthorized - no session found");
    res.status(401).json({ error: "Niet ingelogd - geen sessie gevonden" });
    return;
  }

  // Only fietsberaad superadmins can view the report
  const hasFietsberaadSuperadmin = userHasRight(
    session.user.securityProfile,
    VSSecurityTopic.fietsberaad_superadmin
  );

  if (!hasFietsberaadSuperadmin) {
    console.error("Unauthorized - insufficient permissions");
    res.status(403).json({
      error: "Toegang geweigerd - alleen fietsberaad superadmins kunnen dit rapport bekijken",
    });
    return;
  }

  try {
    const report = await getTariefValidationReport();

    // The report already returns strings for validRecordIDs and invalidRecordIDs
    // No conversion needed as GROUP_CONCAT returns strings
    res.status(200).json({
      success: true,
      data: report,
    });
  } catch (error) {
    console.error("Error fetching tarief validation report:", error);
    res.status(500).json({
      error: "Internal server error",
    });
  }
}

