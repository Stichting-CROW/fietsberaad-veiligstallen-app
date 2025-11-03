import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "~/server/db";
import { type VSTariefcode, tariefcodeSelect } from "~/types/tariefcodes";

export type TariefcodesPublicResponse = {
  data?: VSTariefcode[];
  error?: string;
};

export default async function handle(
  req: NextApiRequest,
  res: NextApiResponse<TariefcodesPublicResponse>
) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method Not Allowed" });
    return;
  }

  try {
    // Public read endpoint - no authentication required
    const tariefcodes = await prisma.tariefcodes.findMany({
      select: tariefcodeSelect,
      orderBy: {
        ID: 'asc'
      }
    });

    res.status(200).json({ data: tariefcodes as VSTariefcode[] });
  } catch (error) {
    console.error("Error fetching tariefcodes:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}

