import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "~/server/db";
import { getServerSession } from "next-auth";
import { authOptions } from '~/pages/api/auth/[...nextauth]';
import { userHasRight } from "~/types/utils";
import { VSSecurityTopic } from "~/types/securityprofile";

export type OrphanedSectionsCleanupResponse = {
  success?: boolean;
  data?: {
    deletedSectionsCount: number;
  };
  error?: string;
};

export default async function handle(
  req: NextApiRequest,
  res: NextApiResponse<OrphanedSectionsCleanupResponse>
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

  // Only fietsberaad superadmins can execute cleanup
  const hasFietsberaadSuperadmin = userHasRight(
    session.user.securityProfile, 
    VSSecurityTopic.fietsberaad_superadmin
  );

  if (!hasFietsberaadSuperadmin) {
    console.error("Unauthorized - insufficient permissions");
    res.status(403).json({ error: "Toegang geweigerd - alleen fietsberaad superadmins kunnen secties opschonen" });
    return;
  }

  try {
    // First, fetch all orphaned section IDs using the same logic as the check query
    const orphanedSectionIds = await prisma.$queryRaw<Array<{ sectieId: number }>>`
      SELECT fs.sectieId
      FROM fietsenstalling_sectie fs
      LEFT JOIN fietsenstallingen f ON fs.fietsenstallingsId = f.ID
      WHERE f.ID IS NULL
        AND fs.fietsenstallingsId IS NOT NULL
    `;

    let deletedSectionsCount = 0;

    // Only delete if there are orphaned sections to delete
    if (orphanedSectionIds.length > 0) {
      const sectionIds = orphanedSectionIds.map(row => Number(row.sectieId));
      
      // Delete using IN clause with the fetched IDs
      const deletedSectionsResult = await prisma.fietsenstalling_sectie.deleteMany({
        where: {
          sectieId: {
            in: sectionIds
          }
        }
      });

      deletedSectionsCount = deletedSectionsResult.count;
    }

    res.status(200).json({
      success: true,
      data: {
        deletedSectionsCount: deletedSectionsCount,
      }
    });
  } catch (error) {
    console.error("Error cleaning up orphaned sections:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}



