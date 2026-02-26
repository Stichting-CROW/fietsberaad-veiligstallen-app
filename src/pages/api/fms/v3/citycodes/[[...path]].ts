/**
 * V3 citycodes API stub. Routes: /v3/citycodes, /v3/citycodes/{citycode}, /v3/citycodes/{citycode}/locations, etc.
 *
 * Caching: getCity(citycode) uses an in-memory cache with 30-minute TTL in production (0 in development).
 * Cached responses may have different fields than the current request: the cache stores the full response
 * for (citycode, depth); requests with different params (e.g. fields) within TTL receive the cached value.
 * See API_PORTING_PLAN.md §13 and fms-v3-service.ts.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import * as v3Service from "~/server/services/fms/fms-v3-service";

function setCors(res: NextApiResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
}

export default async function handle(
  req: NextApiRequest,
  res: NextApiResponse
) {
  setCors(res);
  if (req.method !== "GET") {
    res.status(405).json({ message: "Method not allowed" });
    return;
  }

  const path = (req.query.path as string[]) ?? [];
  const citycode = path[0];
  const subPath = path[1];
  const locationid = path[2];
  const subPath2 = path[3];
  const sectionid = path[4];
  const subPath3 = path[5];

  const fields = (req.query.fields as string) ?? "*";
  const depth = Math.min(3, Math.max(0, parseInt((req.query.depth as string) ?? "3", 10) || 3));
  const options = { fields, depth };

  try {
    if (!citycode) {
      const cities = await v3Service.getCities(options);
      res.status(200).json(cities);
      return;
    }

    if (subPath === "locations") {
      if (!locationid) {
        const locations = await v3Service.getLocations(citycode, options);
        res.status(200).json(locations);
        return;
      }

      if (subPath2 === "sections") {
        if (!sectionid) {
          const sections = await v3Service.getSections(locationid, depth);
          res.status(200).json(sections);
          return;
        }
        if (subPath3 === "places") {
          const places = await v3Service.getPlaces(locationid, sectionid);
          res.status(200).json(places);
          return;
        }
        const section = await v3Service.getSection(locationid, sectionid, depth);
        if (!section) {
          res.status(404).json({ message: "Section not found" });
          return;
        }
        res.status(200).json(section);
        return;
      }

      if (subPath2 === "subscriptiontypes") {
        const types = await v3Service.getSubscriptionTypes(locationid);
        res.status(200).json(types);
        return;
      }

      const location = await v3Service.getLocation(locationid, depth);
      if (!location) {
        res.status(404).json({ message: "Location not found" });
        return;
      }
      // Return full location with ColdFusion key order (occupied, exploitantcontact, locationtype, long, sections, etc.)
      res.status(200).json(location);
      return;
    }

    if (!subPath) {
      const city = await v3Service.getCity(citycode, options);
      if (!city) {
        res.status(404).json({ message: "City not found" });
        return;
      }
      res.setHeader("Cache-Control", "public, s-maxage=60, stale-while-revalidate=120");
      res.status(200).json(city);
      return;
    }

    res.status(404).json({ message: "Not found" });
  } catch (error) {
    console.error("FMS v3 error:", error);
    res.status(500).json({
      message: error instanceof Error ? error.message : "Internal error",
    });
  }
}
