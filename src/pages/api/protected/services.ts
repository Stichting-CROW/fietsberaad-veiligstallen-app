import { type NextApiRequest, type NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";
import { type AuthOptions } from "next-auth";
import { authOptions } from "~/pages/api/auth/[...nextauth]";
import { prisma } from "~/server/db";
import type { VSservice } from "~/types/services";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
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
    // Get all services from database
    const services = await prisma.services.findMany({
      select: {
        ID: true,
        Name: true
      },
      orderBy: {
        Name: 'asc'
      }
    });

    // Transform to required format
    const formattedServices: VSservice[] = services.map(service => ({
      ID: service.ID,
      Name: service.Name
    }));

    return res.status(200).json(formattedServices);
  } catch (error) {
    console.error("Error fetching services:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
} 