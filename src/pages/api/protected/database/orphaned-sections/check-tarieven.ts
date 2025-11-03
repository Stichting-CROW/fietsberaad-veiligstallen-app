import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "~/server/db";
import { getServerSession } from "next-auth";
import { authOptions } from '~/pages/api/auth/[...nextauth]';

export type OrphanedTarievenCheckResponse = {
  success?: boolean;
  data?: {
    orphanedSectieFietstypeCount: number;
    sectieFietstypeWithoutSectionCount: number;
    sectieFietstypeWithInvalidBikeTypeCount: number;
  };
  error?: string;
};

export default async function handle(
  req: NextApiRequest,
  res: NextApiResponse<OrphanedTarievenCheckResponse>
) {
  /* This endpoint needs to be completed and thoroughly tested before it can be used. */
  
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
    // Count sectie_fietstype records linked to orphaned sections (sections without parent fietsenstalling)
    const orphanedSectieFietstypeResult = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*) as count
      FROM sectie_fietstype sft
      INNER JOIN fietsenstalling_sectie fs ON sft.sectieID = fs.sectieId
      LEFT JOIN fietsenstallingen f ON fs.fietsenstallingsId = f.ID
      WHERE f.ID IS NULL
        AND fs.fietsenstallingsId IS NOT NULL
    `;

    // Count sectie_fietstype records with no associated section at all
    const sectieFietstypeWithoutSectionResult = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*) as count
      FROM sectie_fietstype sft
      LEFT JOIN fietsenstalling_sectie fs ON sft.sectieID = fs.sectieId
      WHERE fs.sectieId IS NULL
    `;

    // Count sectie_fietstype records with non-existent BikeTypeID
    const sectieFietstypeWithInvalidBikeTypeResult = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*) as count
      FROM sectie_fietstype sft
      LEFT JOIN fietstypen ft ON sft.BikeTypeID = ft.ID
      WHERE sft.BikeTypeID IS NOT NULL
        AND ft.ID IS NULL
    `;

    const orphanedSectieFietstypeCount = Number(orphanedSectieFietstypeResult[0]?.count || 0);
    const sectieFietstypeWithoutSectionCount = Number(sectieFietstypeWithoutSectionResult[0]?.count || 0);
    const sectieFietstypeWithInvalidBikeTypeCount = Number(sectieFietstypeWithInvalidBikeTypeResult[0]?.count || 0);

    res.status(200).json({
      success: true,
      data: {
        orphanedSectieFietstypeCount: orphanedSectieFietstypeCount,
        sectieFietstypeWithoutSectionCount: sectieFietstypeWithoutSectionCount,
        sectieFietstypeWithInvalidBikeTypeCount: sectieFietstypeWithInvalidBikeTypeCount,
      }
    });
  } catch (error) {
    console.error("Error checking orphaned tarieven:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}

