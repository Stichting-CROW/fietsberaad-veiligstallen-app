import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "~/server/db";
import { getServerSession } from "next-auth";
import { authOptions } from '~/pages/api/auth/[...nextauth]';

export type OrphanedSectionsCheckResponse = {
  success?: boolean;
  data?: {
    orphanedSectionsCount: number;
  };
  error?: string;
};

export default async function handle(
  req: NextApiRequest,
  res: NextApiResponse<OrphanedSectionsCheckResponse>
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

  try {
    // Count orphaned fietsenstalling_sectie records (sections with no associated fietsenstalling)
    const orphanedSectionsResult = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*) as count
      FROM fietsenstalling_sectie fs
      LEFT JOIN fietsenstallingen f ON fs.fietsenstallingsId = f.ID
      WHERE f.ID IS NULL
        AND fs.fietsenstallingsId IS NOT NULL
    `;

    const orphanedSectionsCount = Number(orphanedSectionsResult[0]?.count || 0);

    res.status(200).json({
      success: true,
      data: {
        orphanedSectionsCount: orphanedSectionsCount,
      }
    });
  } catch (error) {
    console.error("Error checking orphaned sections:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}


