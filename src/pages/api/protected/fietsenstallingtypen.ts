import { type NextApiRequest, type NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";
import { type AuthOptions } from "next-auth";
import { authOptions } from "~/pages/api/auth/[...nextauth]";
import { prisma } from "~/server/db";
import { type VSFietsenstallingType } from "~/types/parking";

export type FietsenstallingtypenResponse = {
  data?: VSFietsenstallingType[];
  error?: string;
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<FietsenstallingtypenResponse>
) {
  // For non-GET requests, require authentication
  if (req.method !== "GET") {
    const session = await getServerSession(req, res, authOptions as AuthOptions);
    if (!session) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    // Get all fietsenstallingtypen from database
    const types = await prisma.fietsenstallingtypen.findMany({
      orderBy: {
        sequence: 'asc'
      }
    });

    // Transform to required format
    const formattedTypes: VSFietsenstallingType[] = types.map(type => ({
      id: type.id,
      name: type.name ?? type.id,
      sequence: type.sequence
    }));

    return res.status(200).json({ data: formattedTypes });
  } catch (error) {
    console.error("Error fetching fietsenstallingtypen:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
} 