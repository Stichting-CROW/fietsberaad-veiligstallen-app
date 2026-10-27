import type { NextApiRequest, NextApiResponse } from "next";
import handler from "./verwijssysteem/data";

/** CF compat: /remote/Webservice.cfc?method=getBikeparkInfo&bikeParkId=… */
export default async function webserviceCompat(req: NextApiRequest, res: NextApiResponse) {
  const method = req.query.method as string | undefined;
  if (method === "getBikeparkInfo" && (req.query.bikeParkId || req.query.locationId)) {
    req.query.bikeparkId = (req.query.bikeParkId ?? req.query.locationId) as string;
    const origJson = res.json.bind(res);
    res.json = (body: unknown) => {
      if (Array.isArray(body)) {
        const upper = body.map((row: Record<string, unknown>) => ({
          OPEN: row.open,
          SECTIONID: row.sectionId,
          CAPACITY: row.capacity,
          OCCUPATION: row.occupation,
          OCCUPIED: row.occupied,
          BULKBEZETTING: row.bulkbezetting,
        }));
        return origJson(upper);
      }
      return origJson(body);
    };
    return handler(req, res);
  }
  if (method === "getBikeparksInfo" && (req.query.siteId || req.query.siteID)) {
    req.query.siteId = (req.query.siteId ?? req.query.siteID) as string;
    req.query.filter = "verwijssysteem";
    const origJson = res.json.bind(res);
    res.json = (body: unknown) => {
      if (Array.isArray(body)) {
        const upper = body.map((row: Record<string, unknown>) => ({
          OPEN: row.open,
          SECTIONID: row.sectionId,
          BIKEPARKID: row.bikeparkID,
          CAPACITY: row.capacity,
          OCCUPATION: row.occupation,
          OCCUPIED: row.occupied,
          BULKBEZETTING: row.bulkbezetting,
        }));
        return origJson(upper);
      }
      return origJson(body);
    };
    return handler(req, res);
  }
  return res.status(400).json({ message: "Unknown method" });
}
