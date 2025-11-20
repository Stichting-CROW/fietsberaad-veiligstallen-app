import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "~/server/db";
import { getServerSession } from "next-auth";
import { authOptions } from '~/pages/api/auth/[...nextauth]'
import { userHasRight } from "~/types/utils";
import { VSSecurityTopic } from "~/types/securityprofile";

export type TariefcodesSeedResponse = {
  success?: boolean;
  error?: string;
};

export default async function handle(
  req: NextApiRequest,
  res: NextApiResponse<TariefcodesSeedResponse>
) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method Not Allowed" });
    return;
  }

  const session = await getServerSession(req, res, authOptions);
  if (!session?.user) {
    console.error("Unauthorized - no session found");
    res.status(401).json({ error: "Niet ingelogd - geen sessie gevonden" });
    return;
  }

  // Check user has fietsberaad_admin or fietsberaad_superadmin rights
  const hasFietsberaadAdmin = userHasRight(session.user.securityProfile, VSSecurityTopic.fietsberaad_admin);
  const hasFietsberaadSuperadmin = userHasRight(session.user.securityProfile, VSSecurityTopic.fietsberaad_superadmin);
  
  if (!hasFietsberaadAdmin && !hasFietsberaadSuperadmin) {
    console.error("Unauthorized - insufficient permissions");
    res.status(403).json({ error: "Access denied - insufficient permissions" });
    return;
  }

  try {
    // Check if table is already populated
    const existingCount = await prisma.tariefcodes.count();
    if (existingCount > 0) {
      res.status(400).json({ error: "Tabel is al gevuld met tariefcodes" });
      return;
    }

    // Insert ID 0 separately first (MySQL may require special handling for 0 in AUTO_INCREMENT)
    await prisma.$executeRaw`
      INSERT INTO tariefcodes (ID, Omschrijving) VALUES (0, '')
      ON DUPLICATE KEY UPDATE Omschrijving = VALUES(Omschrijving)
    `;

    await prisma.$executeRaw`
      INSERT INTO tariefcodes (ID, Omschrijving) VALUES
        (1, 'betaald'),
        (2, 'gratis'),
        (3, 'weekend gratis'),
        (4, 'overdag gratis'),
        (5, 'eerste dag gratis')
      ON DUPLICATE KEY UPDATE Omschrijving = VALUES(Omschrijving)
    `;

    res.status(200).json({ success: true });
  } catch (error) {
    console.error("Error seeding tariefcodes:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}

