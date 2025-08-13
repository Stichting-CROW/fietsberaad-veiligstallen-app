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
        const record = await prisma.uitzonderingenopeningstijden.findUnique({
          where: { ID: Number(req.query.id) },
        });
        if (!record) {
          res.status(404).json({ error: "Not found" });
          return;
        }
        res.status(200).json({ data: record });
      } catch (e) {
        res.status(500).json({ error: "Error fetching record" });
      }
      break;
    }
    case "POST": {
      // Create a new record if id is 'new'
      if (req.query.id !== 'new') {
        res.status(400).json({ error: "Invalid id for create. Use 'new'." });
        return;
      }
      try {
        const { openingDateTime, closingDateTime } = req.body;
        const newRecord = await prisma.uitzonderingenopeningstijden.create({
          data: {
            openingDateTime: openingDateTime ? new Date(openingDateTime) : null,
            closingDateTime: closingDateTime ? new Date(closingDateTime) : null,
            fietsenstallingsID: fietsenstallingID,
          },
        });
        res.status(201).json({ data: newRecord });
      } catch (e) {
        res.status(500).json({ error: "Error creating record" });
      }
      break;
    }
    case "PUT": {
      // Update an existing record by ID
      try {
        const { openingDateTime, closingDateTime } = req.body;
        const updated = await prisma.uitzonderingenopeningstijden.update({
          where: { ID: Number(req.query.id) },
          data: {
            openingDateTime: openingDateTime ? new Date(openingDateTime) : null,
            closingDateTime: closingDateTime ? new Date(closingDateTime) : null,
          },
        });
        res.status(200).json({ data: updated });
      } catch (e) {
        res.status(500).json({ error: "Error updating record" });
      }
      break;
    }
    case "DELETE": {
      // Delete a record by ID
      try {
        await prisma.uitzonderingenopeningstijden.delete({
          where: { ID: Number(req.query.id) },
        });
        res.status(200).json({ data: true });
      } catch (e) {
        res.status(500).json({ error: "Error deleting record" });
      }
      break;
    }
    default: {
      res.setHeader("Allow", ["GET", "POST", "PUT", "DELETE"]);
      res.status(405).end(`Method ${req.method} Not Allowed`);
    }
  }
} 