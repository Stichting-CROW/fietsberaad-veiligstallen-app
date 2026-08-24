import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "~/pages/api/auth/[...nextauth]";
import { userHasRight } from "~/types/utils";
import { VSSecurityTopic } from "~/types/securityprofile";
import { validateUserSession } from "~/utils/server/database-tools";
import {
  deleteFmsPermit,
  listFmsPermitsForGemeente,
  updateFmsPermit,
} from "~/server/services/fms/fms-permit-service";

const updateSchema = z.object({
  permitTypes: z.array(z.string()).min(1),
});

export default async function handle(req: NextApiRequest, res: NextApiResponse) {
  const gemeenteId = req.query.id as string;
  const permitIdRaw = req.query.permitId as string;

  if (!gemeenteId || gemeenteId === "new") {
    return res.status(400).json({ error: "Ongeldige gemeente ID" });
  }

  const permitId = Number.parseInt(permitIdRaw, 10);
  if (!Number.isFinite(permitId)) {
    return res.status(400).json({ error: "Ongeldige recht ID" });
  }

  const session = await getServerSession(req, res, authOptions);
  if (!session?.user) {
    return res.status(401).json({ error: "Niet ingelogd" });
  }

  const validateUserSessionResult = await validateUserSession(session, "organizations");
  if ("error" in validateUserSessionResult) {
    return res.status(validateUserSessionResult.status).json({ error: validateUserSessionResult.error });
  }

  if (!validateUserSessionResult.sites.includes(gemeenteId)) {
    return res.status(403).json({ error: "Geen toegang tot deze gemeente" });
  }

  if (!userHasRight(session.user.securityProfile, VSSecurityTopic.fietsberaad_superadmin)) {
    return res.status(403).json({ error: "Geen rechten om FMS-rechten te beheren" });
  }

  switch (req.method) {
    case "PUT": {
      const parsed = updateSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.flatten() });
      }

      try {
        await updateFmsPermit(gemeenteId, permitId, parsed.data.permitTypes);
        const data = await listFmsPermitsForGemeente(gemeenteId);
        return res.status(200).json({ data });
      } catch (error) {
        return res.status(400).json({
          error: error instanceof Error ? error.message : "Kon recht niet bijwerken",
        });
      }
    }

    case "DELETE": {
      try {
        await deleteFmsPermit(gemeenteId, permitId);
        const data = await listFmsPermitsForGemeente(gemeenteId);
        return res.status(200).json({ data });
      } catch (error) {
        return res.status(400).json({
          error: error instanceof Error ? error.message : "Kon recht niet verwijderen",
        });
      }
    }

    default:
      res.setHeader("Allow", "PUT, DELETE");
      return res.status(405).json({ error: "Method not allowed" });
  }
}
