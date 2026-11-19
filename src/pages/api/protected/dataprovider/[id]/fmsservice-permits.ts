import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth";
import { authOptions } from "~/pages/api/auth/[...nextauth]";
import { listFmsPermitsForOperator } from "~/server/services/fms/fms-permit-service";
import type { FmsPermitRow } from "~/server/services/fms/fms-permit-service";
import { validateUserSession } from "~/utils/server/database-tools";

export type DataproviderFmsPermitsResponse = {
  data?: FmsPermitRow[];
  error?: string;
};

export default async function handle(
  req: NextApiRequest,
  res: NextApiResponse<DataproviderFmsPermitsResponse>
) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const session = await getServerSession(req, res, authOptions);
  if (!session?.user) {
    res.status(401).json({ error: "Niet ingelogd" });
    return;
  }

  const validateUserSessionResult = await validateUserSession(session, "dataprovider");
  if ("error" in validateUserSessionResult) {
    res.status(validateUserSessionResult.status).json({
      error: validateUserSessionResult.error,
    });
    return;
  }

  const { sites } = validateUserSessionResult;
  const id = req.query.id as string;

  if (!id || id === "new") {
    res.status(400).json({ error: "Ongeldige dataleverancier" });
    return;
  }

  if (!sites.includes(id)) {
    res.status(403).json({ error: "Geen toegang tot deze dataleverancier" });
    return;
  }

  try {
    const permits = await listFmsPermitsForOperator(id);
    res.status(200).json({ data: permits });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Kon gekoppelde stallingen niet laden",
    });
  }
}
