import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth";
import { authOptions } from "~/pages/api/auth/[...nextauth]";
import { validateUserSession, generateID } from "~/utils/server/database-tools";
import { prisma } from "~/server/db";

async function assertAccess(req: NextApiRequest, res: NextApiResponse) {
  const session = await getServerSession(req, res, authOptions);
  const validation = await validateUserSession(session, "any");
  if ("error" in validation) {
    res.status(401).json({ error: validation.error });
    return null;
  }
  const siteId = session?.user?.activeContactId;
  if (!siteId) {
    res.status(400).json({ error: "Geen actieve gemeente" });
    return null;
  }
  return { siteId, userId: validation.userId };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const ctx = await assertAccess(req, res);
  if (!ctx) return;

  if (req.method === "GET") {
    const rows = await prisma.presentations.findMany({
      where: { SiteID: ctx.siteId },
      orderBy: { SortOrder: "asc" },
    });
    return res.status(200).json({ data: rows });
  }

  if (req.method === "POST") {
    const body = req.body as Record<string, unknown>;
    const maxSort = await prisma.presentations.aggregate({
      where: { SiteID: ctx.siteId },
      _max: { SortOrder: true },
    });
    const row = await prisma.presentations.create({
      data: {
        ID: generateID(),
        SiteID: ctx.siteId,
        Title: String(body.Title ?? ""),
        ContentType: String(body.ContentType ?? "Article"),
        Article: String(body.Article ?? ""),
        RSS: body.RSS ? String(body.RSS) : null,
        Duration: Number(body.Duration ?? 10),
        Status: body.Status === "0" || body.Status === 0 ? "0" : "1",
        ShowPrizeDescription: body.ShowPrizeDescription ? "1" : "0",
        SortOrder: (maxSort._max.SortOrder ?? 0) + 1,
        EditorCreated: ctx.userId,
        DateCreated: new Date(),
        EditorModified: ctx.userId,
        DateModified: new Date(),
      },
    });
    return res.status(201).json({ data: row });
  }

  if (req.method === "PUT" && req.query.action === "sort") {
    const order = (req.body as { order?: string[] }).order ?? [];
    let i = 1;
    for (const id of order) {
      await prisma.presentations.updateMany({
        where: { ID: id, SiteID: ctx.siteId },
        data: { SortOrder: i++, EditorModified: ctx.userId, DateModified: new Date() },
      });
    }
    return res.status(200).json({ ok: true });
  }

  res.setHeader("Allow", "GET, POST, PUT");
  return res.status(405).end();
}
