import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "~/server/db";
import type { VSFietstype } from "~/types/fietstypen";

export type FietstypenResponse = {
  data?: VSFietstype[];
  error?: string;
};

export default async function handle(
  req: NextApiRequest,
  res: NextApiResponse<FietstypenResponse>
) {
  if (req.method !== "GET") {
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

