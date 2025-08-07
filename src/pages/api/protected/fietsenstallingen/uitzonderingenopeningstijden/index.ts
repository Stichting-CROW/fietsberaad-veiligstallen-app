import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "~/server/db";
import { getServerSession } from "next-auth";
import { authOptions } from '~/pages/api/auth/[...nextauth]';
import { validateUserSession } from "~/utils/server/database-tools";

export default async function handle(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const session = await getServerSession(req, res, authOptions);
  if (!session?.user) {
    res.status(401).json({ error: "Unauthorized - no session found" });
    return;
  }

  const validateUserSessionResult = await validateUserSession(session, "any");
  if ('error' in validateUserSessionResult) {
    res.status(401).json({ error: validateUserSessionResult.error });
    return;
  }

  const fietsenstallingID = req.query.fietsenstallingID as string;

  switch (req.method) {
    case "GET": {
      // Get a single uitzonderingenopeningstijden record by ID
      try {
        const record = await prisma.uitzonderingenopeningstijden.findMany({
          where: { fietsenstallingsID: fietsenstallingID },
          orderBy: { openingDateTime: 'desc' }
        });
        if (!record) {
          res.status(404).json({ error: "Not found" });
          return;
        }
        res.status(200).json({ data: record });
      } catch (e) {
        res.status(500).json({ error: "Error fetching records" });
      }
      break;
    }
    default: {
      res.setHeader("Allow", ["GET"]);
      res.status(405).end(`Method ${req.method} Not Allowed`);
    }
  }
} 