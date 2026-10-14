import type { NextApiRequest, NextApiResponse } from "next";
import { getBikeparkInfo, getBikeparksInfoForSite } from "~/server/display/occupancy";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).end();
  }

  const bikeparkId = typeof req.query.bikeparkId === "string" ? req.query.bikeparkId : undefined;
  const siteId = typeof req.query.siteId === "string" ? req.query.siteId : undefined;
  const filter =
    req.query.filter === "overzichten" ? ("overzichten" as const) : ("verwijssysteem" as const);

  try {
    if (bikeparkId) {
      const sections = await getBikeparkInfo(bikeparkId);
      res.setHeader("Cache-Control", "public, max-age=10");
      return res.status(200).json(
        sections.map((s) => ({
          open: s.open,
          sectionId: s.sectionId,
          capacity: s.capacity,
          occupation: s.occupation,
          occupied: s.occupied,
          bulkbezetting: s.bulkbezetting,
        }))
      );
    }
    if (siteId) {
      const rows = await getBikeparksInfoForSite(siteId, filter);
      res.setHeader("Cache-Control", "public, max-age=10");
      return res.status(200).json(
        rows.map((r) => ({
          open: r.open,
          bikeparkID: r.bikeparkID,
          capacity: r.capacity,
          occupation: r.occupation,
          occupied: r.occupation + r.bulkbezetting,
          bulkbezetting: r.bulkbezetting,
        }))
      );
    }
    return res.status(400).json({ message: "siteId or bikeparkId required" });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return res.status(500).json({ message });
  }
}
