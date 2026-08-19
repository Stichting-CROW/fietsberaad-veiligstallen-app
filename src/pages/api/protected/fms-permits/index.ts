import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth";
import { authOptions } from "~/pages/api/auth/[...nextauth]";
import { VSSecurityTopic } from "~/types/securityprofile";
import {
  fmsPermitCreateSchema,
  type VSFmsMissingCoupling,
  type VSFmsPermitEditorData,
  type VSFmsServicePermitRow,
} from "~/types/fms-permits";
import { getRights } from "~/utils/securitycontext";
import { validateUserSession } from "~/utils/server/database-tools";
import { canAccessFmsPermitsOverview } from "~/types/utils";
import {
  createFmsPermit,
  FmsPermitAdminError,
  getPermitEditorData,
  listAllPermits,
  listMissingCouplings,
} from "~/server/services/fms/fms-permit-admin-service";

export type FmsPermitsListResponse = {
  data?:
    | VSFmsServicePermitRow[]
    | VSFmsPermitEditorData
    | { permits: VSFmsServicePermitRow[]; missingCouplings: VSFmsMissingCoupling[] };
  error?: string;
  legacyRefreshed?: boolean;
};

export default async function handle(
  req: NextApiRequest,
  res: NextApiResponse<FmsPermitsListResponse>
) {
  const session = await getServerSession(req, res, authOptions);
  if (!session?.user) {
    res.status(401).json({ error: "Niet ingelogd" });
    return;
  }

  const rights = getRights(session.user.securityProfile, VSSecurityTopic.fmsservices);

  const validateUserSessionResult = await validateUserSession(session, "organizations");
  if ("error" in validateUserSessionResult) {
    res.status(validateUserSessionResult.status).json({
      error: validateUserSessionResult.error,
    });
    return;
  }

  const { activeContactId } = validateUserSessionResult;

  switch (req.method) {
    case "GET": {
      if (!rights.read) {
        res.status(403).json({ error: "Geen toegang tot FMS-rechten" });
        return;
      }

      const all = req.query.all === "true";
      const missing = req.query.missing === "true";
      const siteID =
        typeof req.query.siteID === "string" ? req.query.siteID : activeContactId;

      try {
        if (all) {
          if (
            !canAccessFmsPermitsOverview(
              session.user.securityProfile,
              session.user.mainContactId
            )
          ) {
            res.status(403).json({ error: "Geen toegang tot FMS-overzicht" });
            return;
          }

          const permits = await listAllPermits();
          if (missing) {
            const missingCouplings = await listMissingCouplings();
            res.status(200).json({ data: { permits, missingCouplings } });
          } else {
            res.status(200).json({ data: permits });
          }
          return;
        }

        if (!siteID || siteID === "1") {
          res.status(400).json({ error: "Selecteer een gemeente om FMS-rechten te beheren" });
          return;
        }

        const editorData = await getPermitEditorData(siteID);
        res.status(200).json({ data: editorData });
      } catch (e) {
        console.error("FMS permits GET error:", e);
        res.status(500).json({ error: "Fout bij ophalen FMS-rechten" });
      }
      break;
    }

    case "POST": {
      if (!rights.create) {
        res.status(403).json({ error: "Geen toegang om FMS-rechten aan te maken" });
        return;
      }

      const parseResult = fmsPermitCreateSchema.safeParse(req.body);
      if (!parseResult.success) {
        res.status(400).json({ error: "Ongeldige gegevens" });
        return;
      }

      const parsed = parseResult.data;
      const siteID = parsed.siteID || activeContactId;
      if (!siteID || siteID === "1") {
        res.status(400).json({ error: "Selecteer een gemeente" });
        return;
      }

      try {
        const { row, legacyRefreshed } = await createFmsPermit({
          operatorID: parsed.operatorID,
          siteID,
          bikeparkID: parsed.bikeparkID ?? null,
          permitTypes: parsed.permitTypes,
        });
        res.status(201).json({ data: [row], legacyRefreshed });
      } catch (e) {
        if (e instanceof FmsPermitAdminError) {
          res.status(400).json({ error: e.message });
          return;
        }
        console.error("FMS permit POST error:", e);
        res.status(500).json({ error: "Fout bij aanmaken FMS-recht" });
      }
      break;
    }

    default:
      res.setHeader("Allow", "GET, POST");
      res.status(405).json({ error: "Methode niet toegestaan" });
  }
}
