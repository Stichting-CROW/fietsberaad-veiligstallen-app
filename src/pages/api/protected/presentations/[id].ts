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

  if (req.method === "GET") {
    const row = await prisma.presentations.findFirst({ where: { ID: id, SiteID: siteId } });
    if (!row) return res.status(404).end();
    return res.status(200).json({ data: row });
  }

  if (req.method === "PUT") {
    const body = req.body as Record<string, unknown>;
    const row = await prisma.presentations.updateMany({
      where: { ID: id, SiteID: siteId },
      data: {
        Title: body.Title != null ? String(body.Title) : undefined,
        ContentType: body.ContentType != null ? String(body.ContentType) : undefined,
        Article: body.Article != null ? String(body.Article) : undefined,
        RSS: body.RSS != null ? String(body.RSS) : undefined,
        Duration: body.Duration != null ? Number(body.Duration) : undefined,
        Status: body.Status != null ? (body.Status === "0" || body.Status === 0 ? "0" : "1") : undefined,
        ShowPrizeDescription: body.ShowPrizeDescription != null ? (body.ShowPrizeDescription ? "1" : "0") : undefined,
        EditorModified: validation.userId,
        DateModified: new Date(),
      },
    });
    return res.status(200).json({ data: row });
  }

  if (req.method === "DELETE") {
    await prisma.presentations.deleteMany({ where: { ID: id, SiteID: siteId } });
    return res.status(204).end();
  }

  res.setHeader("Allow", "GET, PUT, DELETE");
  return res.status(405).end();
}
