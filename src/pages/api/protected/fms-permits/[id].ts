import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth";
import { authOptions } from "~/pages/api/auth/[...nextauth]";
import { VSSecurityTopic } from "~/types/securityprofile";
import { fmsPermitUpdateSchema, type VSFmsServicePermitRow } from "~/types/fms-permits";
import { getRights } from "~/utils/securitycontext";
import { validateUserSession } from "~/utils/server/database-tools";
import {
  deleteFmsPermit,
  FmsPermitAdminError,
  getPermitById,
  updateFmsPermit,
} from "~/server/services/fms/fms-permit-admin-service";

export type FmsPermitItemResponse = {
  data?: VSFmsServicePermitRow;
  error?: string;
  legacyRefreshed?: boolean;
};

export default async function handle(
  req: NextApiRequest,
  res: NextApiResponse<FmsPermitItemResponse>
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

  const idRaw = req.query.id as string;
  const id = parseInt(idRaw, 10);
  if (Number.isNaN(id)) {
    res.status(400).json({ error: "Ongeldig permit-ID" });
    return;
  }

  switch (req.method) {
    case "GET": {
      if (!rights.read) {
        res.status(403).json({ error: "Geen toegang tot FMS-rechten" });
        return;
      }
      const row = await getPermitById(id);
      if (!row) {
        res.status(404).json({ error: "Recht niet gevonden" });
        return;
      }
      res.status(200).json({ data: row });
      break;
    }

    case "PUT": {
      if (!rights.update) {
        res.status(403).json({ error: "Geen toegang om FMS-rechten te wijzigen" });
        return;
      }

      const parseResult = fmsPermitUpdateSchema.safeParse(req.body);
      if (!parseResult.success) {
        res.status(400).json({ error: "Ongeldige gegevens" });
        return;
      }

      try {
        const existing = await getPermitById(id);
        if (!existing) {
          res.status(404).json({ error: "Recht niet gevonden" });
          return;
        }

        const { row, legacyRefreshed } = await updateFmsPermit(
          id,
          parseResult.data.permitTypes
        );
        res.status(200).json({ data: row, legacyRefreshed });
      } catch (e) {
        if (e instanceof FmsPermitAdminError) {
          res.status(400).json({ error: e.message });
          return;
        }
        console.error("FMS permit PUT error:", e);
        res.status(500).json({ error: "Fout bij bijwerken FMS-recht" });
      }
      break;
    }

    case "DELETE": {
      if (!rights.delete) {
        res.status(403).json({ error: "Geen toegang om FMS-rechten te verwijderen" });
        return;
      }

      try {
        const existing = await getPermitById(id);
        if (!existing) {
          res.status(404).json({ error: "Recht niet gevonden" });
          return;
        }

        const { legacyRefreshed } = await deleteFmsPermit(id);
        res.status(200).json({ legacyRefreshed });
      } catch (e) {
        console.error("FMS permit DELETE error:", e);
        res.status(500).json({ error: "Fout bij verwijderen FMS-recht" });
      }
      break;
    }

    default:
      res.setHeader("Allow", "GET, PUT, DELETE");
      res.status(405).json({ error: "Methode niet toegestaan" });
  }
}
