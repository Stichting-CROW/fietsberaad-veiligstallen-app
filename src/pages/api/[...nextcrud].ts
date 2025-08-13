import NextCrud, { PrismaAdapter } from "@premieroctet/next-crud";
import { type NextApiRequest, type NextApiResponse } from "next";
import { prisma } from "~/server/db";

// handler for all next-crud routes
// next-crud is a helper library that creates CRUD API routes with one simple function based on a Prisma model for Next.js.
// see https://next-crud-pi.vercel.app/ for documentation
const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  try {
    // Ensure prisma is connected
    await prisma.$connect();
    
    const nextCrudHandler = await NextCrud({
      adapter: new PrismaAdapter({
        prismaClient: prisma,
      }),
    });

    return nextCrudHandler(req, res);
  } catch (error) {
    console.error("NextCrud error:", error);
    res.status(500).json({ error: "Internal server error" });
  } finally {
    await prisma.$disconnect();
  }
};

export default handler;
