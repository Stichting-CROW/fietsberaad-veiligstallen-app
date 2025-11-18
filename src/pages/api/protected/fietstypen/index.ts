import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "~/server/db";
import { getServerSession } from "next-auth";
import { authOptions } from '~/pages/api/auth/[...nextauth]'
import type { VSFietstype } from "~/types/fietstypen";

export type FietstypenResponse = {
  data?: VSFietstype[];
  error?: string;
};

export default async function handle(
  req: NextApiRequest,
  res: NextApiResponse<FietstypenResponse>
) {
  // For non-GET requests, require authentication
  if (req.method !== "GET") {
    const session = await getServerSession(req, res, authOptions);
    if (!session) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    // Get all fietstypen from database
    const types = await prisma.fietstypen.findMany({
      orderBy: {
        ID: 'asc'
      }
    });

    // Transform to required format
    const formattedTypes: VSFietstype[] = types.map(type => ({
      ID: type.ID,
      Name: type.Name,
      naamenkelvoud: type.naamenkelvoud
    }));

    return res.status(200).json({ data: formattedTypes });
  } catch (error) {
    console.error("Error fetching fietstypen:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

