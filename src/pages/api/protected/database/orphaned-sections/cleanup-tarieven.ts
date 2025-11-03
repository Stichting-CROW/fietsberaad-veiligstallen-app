import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "~/server/db";
import { getServerSession } from "next-auth";
import { authOptions } from '~/pages/api/auth/[...nextauth]';
import { userHasRight } from "~/types/utils";
import { VSSecurityTopic } from "~/types/securityprofile";

export type OrphanedTarievenCleanupResponse = {
  success?: boolean;
  data?: {
    deletedSectieFietstypeCount: number;
  };
  error?: string;
};

export default async function handle(
  req: NextApiRequest,
  res: NextApiResponse<OrphanedTarievenCleanupResponse>
) {
  /* This endpoint needs to be completed and thoroughly tested before it can be used. */
  res.status(405).json({ error: "Method Not Allowed" });
  return;

  // if (req.method !== "POST") {
  //   res.status(405).json({ error: "Method Not Allowed" });
  //   return;
  // }

  // const session = await getServerSession(req, res, authOptions);
  // if (!session?.user) {
  //   console.error("Unauthorized - no session found");
  //   res.status(401).json({ error: "Niet ingelogd - geen sessie gevonden" });
  //   return;
  // }

  // // Only fietsberaad superadmins can execute cleanup
  // const hasFietsberaadSuperadmin = userHasRight(
  //   session.user.securityProfile, 
  //   VSSecurityTopic.fietsberaad_superadmin
  // );

  // if (!hasFietsberaadSuperadmin) {
  //   console.error("Unauthorized - insufficient permissions");
  //   res.status(403).json({ error: "Toegang geweigerd - alleen fietsberaad superadmins kunnen opruiming uitvoeren" });
  //   return;
  // }

  // try {
  //   // Delete all invalid sectie_fietstype records in a single pass:
  //   // - sectie_fietstype with invalid BikeTypeID
  //   // - sectie_fietstype linked to orphaned sections (sections without parent fietsenstalling)
  //   // - sectie_fietstype with no section at all
  //   const deletedSectieFietstypeResult = await prisma.$executeRaw`
  //     DELETE sft FROM sectie_fietstype sft
  //     LEFT JOIN fietstypen ft ON sft.BikeTypeID = ft.ID
  //     LEFT JOIN fietsenstalling_sectie fs ON sft.sectieID = fs.sectieId
  //     LEFT JOIN fietsenstallingen f ON fs.fietsenstallingsId = f.ID
  //     WHERE 
  //       (sft.BikeTypeID IS NOT NULL AND ft.ID IS NULL)
  //       OR fs.sectieId IS NULL
  //       OR (fs.fietsenstallingsId IS NOT NULL AND f.ID IS NULL)
  //   `;

  //   res.status(200).json({
  //     success: true,
  //     data: {
  //       deletedSectieFietstypeCount: Number(deletedSectieFietstypeResult || 0),
  //     }
  //   });
  // } catch (error) {
  //   console.error("Error cleaning up orphaned tarieven:", error);
  //   res.status(500).json({ error: "Internal server error" });
  // }
}



