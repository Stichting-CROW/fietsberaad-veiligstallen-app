import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth";
import { authOptions } from "~/pages/api/auth/[...nextauth]";
import { validateUserSession } from "~/utils/server/database-tools";
import { prisma } from "~/server/db";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = await getServerSession(req, res, authOptions);
  const validation = await validateUserSession(session, "any");
  if ("error" in validation) return res.status(401).json({ error: validation.error });
  const siteId = session?.user?.activeContactId;
  const id = req.query.id as string;
  if (!siteId || !id) return res.status(400).json({ error: "Bad request" });

  if (req.method === "PUT") {
    const body = req.body as { Item?: string };
    await prisma.presentations_ticker.updateMany({
      where: { ID: id, SiteID: siteId },
      data: {
        Item: body.Item != null ? String(body.Item).slice(0, 255) : undefined,
        EditorModified: validation.userId,
        DateModified: new Date(),
      },
    });
    return res.status(200).json({ ok: true });
  }

  if (req.method === "DELETE") {
    await prisma.presentations_ticker.deleteMany({ where: { ID: id, SiteID: siteId } });
    return res.status(204).end();
  }

  res.setHeader("Allow", "PUT, DELETE");
  return res.status(405).end();
}
