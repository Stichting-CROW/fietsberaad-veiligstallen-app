import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth";
import { authOptions } from "~/pages/api/auth/[...nextauth]";
import { validateUserSession, generateID } from "~/utils/server/database-tools";
import { prisma } from "~/server/db";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = await getServerSession(req, res, authOptions);
  const validation = await validateUserSession(session, "any");
  if ("error" in validation) return res.status(401).json({ error: validation.error });
  const siteId = session?.user?.activeContactId;
  if (!siteId) return res.status(400).json({ error: "Geen actieve gemeente" });

  if (req.method === "GET") {
    const rows = await prisma.presentations_ticker.findMany({
      where: { SiteID: siteId },
      orderBy: { SortOrder: "asc" },
    });
    return res.status(200).json({ data: rows });
  }

  if (req.method === "POST") {
    const body = req.body as { Item?: string };
    const maxSort = await prisma.presentations_ticker.aggregate({
      where: { SiteID: siteId },
      _max: { SortOrder: true },
    });
    const row = await prisma.presentations_ticker.create({
      data: {
        ID: generateID(),
        SiteID: siteId,
        Item: String(body.Item ?? "").slice(0, 255),
        SortOrder: (maxSort._max.SortOrder ?? 0) + 1,
        EditorModified: validation.userId,
        DateModified: new Date(),
      },
    });
    return res.status(201).json({ data: row });
  }

  if (req.method === "PUT" && req.query.action === "sort") {
    const order = (req.body as { order?: string[] }).order ?? [];
    let i = 1;
    for (const id of order) {
      await prisma.presentations_ticker.updateMany({
        where: { ID: id, SiteID: siteId },
        data: { SortOrder: i++, EditorModified: validation.userId, DateModified: new Date() },
      });
    }
    return res.status(200).json({ ok: true });
  }

  res.setHeader("Allow", "GET, POST, PUT");
  return res.status(405).end();
}
