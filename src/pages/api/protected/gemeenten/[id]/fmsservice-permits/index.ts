import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "~/pages/api/auth/[...nextauth]";
import { userHasRight } from "~/types/utils";
import { VSSecurityTopic } from "~/types/securityprofile";
import { validateUserSession } from "~/utils/server/database-tools";
import {
  createFmsPermit,
  listFmsPermitsForGemeente,
} from "~/server/services/fms/fms-permit-service";

const createSchema = z.object({
  operatorId: z.string().min(1),
  bikeparkId: z.string().nullable().optional(),
  permitTypes: z.array(z.string()).min(1),
});

async function requireGemeenteFmsAccess(
  req: NextApiRequest,
  res: NextApiResponse,
  gemeenteId: string,
  write: boolean
) {
  const session = await getServerSession(req, res, authOptions);
  if (!session?.user) {
    res.status(401).json({ error: "Niet ingelogd" });
    return null;
  }

  const validateUserSessionResult = await validateUserSession(session, "organizations");
  if ("error" in validateUserSessionResult) {
    res.status(validateUserSessionResult.status).json({ error: validateUserSessionResult.error });
    return null;
  }

  if (!validateUserSessionResult.sites.includes(gemeenteId)) {
    res.status(403).json({ error: "Geen toegang tot deze gemeente" });
    return null;
  }

  if (
    write &&
    !userHasRight(session.user.securityProfile, VSSecurityTopic.fietsberaad_superadmin)
  ) {
    res.status(403).json({ error: "Geen rechten om FMS-rechten te beheren" });
    return null;
  }

  if (
    !write &&
    !userHasRight(session.user.securityProfile, VSSecurityTopic.fietsberaad_superadmin) &&
    !userHasRight(session.user.securityProfile, VSSecurityTopic.fietsberaad_admin)
  ) {
    res.status(403).json({ error: "Geen rechten om FMS-rechten te bekijken" });
    return null;
  }

  return session;
}

export default async function handle(req: NextApiRequest, res: NextApiResponse) {
  const gemeenteId = req.query.id as string;
  if (!gemeenteId || gemeenteId === "new") {
    return res.status(400).json({ error: "Ongeldige gemeente ID" });
  }

  switch (req.method) {
    case "GET": {
      const session = await requireGemeenteFmsAccess(req, res, gemeenteId, false);
      if (!session) return;

      try {
        const data = await listFmsPermitsForGemeente(gemeenteId);
        return res.status(200).json({ data });
      } catch (error) {
        return res.status(500).json({
          error: error instanceof Error ? error.message : "Kon FMS-rechten niet laden",
        });
      }
    }

    case "POST": {
      const session = await requireGemeenteFmsAccess(req, res, gemeenteId, true);
      if (!session) return;

      const parsed = createSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.flatten() });
      }

      try {
        const row = await createFmsPermit({
          siteId: gemeenteId,
          operatorId: parsed.data.operatorId,
          bikeparkId: parsed.data.bikeparkId ?? null,
          permitTypes: parsed.data.permitTypes,
        });
        const data = await listFmsPermitsForGemeente(gemeenteId);
        return res.status(201).json({ data, createdId: row.ID });
      } catch (error) {
        return res.status(400).json({
          error: error instanceof Error ? error.message : "Kon recht niet aanmaken",
        });
      }
    }

    default:
      res.setHeader("Allow", "GET, POST");
      return res.status(405).json({ error: "Method not allowed" });
  }
}
