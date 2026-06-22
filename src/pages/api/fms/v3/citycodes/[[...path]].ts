/**
 * V3 citycodes API. Routes: /v3/citycodes, /v3/citycodes/{citycode}, /v3/citycodes/{citycode}/locations, etc.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import * as v3Service from "~/server/services/fms/fms-v3-service";
import * as v3Protected from "~/server/services/fms/fms-v3-protected-reads";
import * as v3Write from "~/server/services/fms/fms-v3-write-service";
import {
  hasAnyPermit,
  parseBasicAuth,
  validateFmsAuth,
} from "~/server/services/fms/fms-auth";
import { assertFmsWriteApiEnabled } from "~/server/services/fms/fms-write-policy";
import { parseFieldsQuery } from "~/server/services/fms/fms-v3-fields";

function setCors(res: NextApiResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
}

function set401(res: NextApiResponse, hadAuthHeader: boolean, message = "Unauthorized") {
  if (!hadAuthHeader) {
    res.setHeader("WWW-Authenticate", 'Basic realm="FMSService"');
  }
  res.status(401).json({ message, status: 0 });
}

async function requireV3Auth(
  req: NextApiRequest,
  res: NextApiResponse,
  locationid: string,
  permit: string
): Promise<boolean> {
  const authHeader = req.headers.authorization;
  const credentials = parseBasicAuth(authHeader);
  if (!credentials) {
    set401(res, false);
    return false;
  }
  const auth = await validateFmsAuth(
    credentials.username,
    credentials.password,
    locationid
  );
  if (!auth.ok) {
    set401(res, !!authHeader);
    return false;
  }
  if (!hasAnyPermit(auth.permits, permit)) {
    set401(res, !!authHeader, "Niet voldoende rechten");
    return false;
  }
  return true;
}

function parseBody(req: NextApiRequest): Record<string, unknown> {
  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body || "{}") as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  return (req.body ?? {}) as Record<string, unknown>;
}

function parseFromQuery(fromParam: string | string[] | undefined): Date {
  const raw = Array.isArray(fromParam) ? fromParam[0] : fromParam;
  if (raw) {
    const d = new Date(raw);
    if (!Number.isNaN(d.getTime())) return d;
  }
  const d = new Date();
  d.setHours(d.getHours() - 1);
  return d;
}

function methodNotAllowed(res: NextApiResponse, method: string) {
  res.status(405).json({ message: `Method ${method} not allowed`, status: 0 });
}

async function handleGet(
  req: NextApiRequest,
  res: NextApiResponse,
  path: string[]
) {
  const citycode = path[0];
  const subPath = path[1];
  const locationid = path[2];
  const subPath2 = path[3];
  const sectionid = path[4];
  const subPath3 = path[5];

  const fields = parseFieldsQuery(req.query.fields);
  const depth = Math.min(3, Math.max(0, parseInt((req.query.depth as string) ?? "3", 10) || 3));
  const options = { fields, depth };

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

    if (subPath2 === "balances") {
      if (!(await requireV3Auth(req, res, locationid, "operator"))) return;
      res.status(200).json(await v3Protected.getBalances(citycode));
      return;
    }

    if (subPath2 === "subscriptions") {
      if (!(await requireV3Auth(req, res, locationid, "operator"))) return;
      await v3Protected.assertLocationInCity(locationid, citycode);
      res.status(200).json(await v3Protected.getSubscriptions(locationid));
      return;
    }

    if (subPath2 === "bikeupdates") {
      if (!(await requireV3Auth(req, res, locationid, "operator,dataprovider.type1"))) return;
      const from = parseFromQuery(req.query.from);
      res.status(200).json(
        await v3Protected.getBikeUpdatesV3(citycode, locationid, from)
      );
      return;
    }

    if (subPath2 === "idcodes" && path[4] != null && path[5] != null && path[6] === "balance") {
      if (!(await requireV3Auth(req, res, locationid, "operator"))) return;
      const idtype = parseInt(path[4]!, 10);
      if (Number.isNaN(idtype)) {
        res.status(400).json({ message: "Invalid idtype", status: 0 });
        return;
      }
      res.status(200).json(await v3Protected.getBalance(citycode, idtype, path[5]!));
      return;
    }

    if (subPath2 === "sections") {
      if (!sectionid) {
        res.status(200).json(await v3Service.getSections(locationid, depth, fields));
        return;
      }
      if (subPath3 === "places") {
        res.status(200).json(await v3Service.getPlaces(locationid, sectionid));
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
      res.status(200).json(await v3Service.getSubscriptionTypes(locationid));
      return;
    }

    const location = await v3Service.getLocation(locationid, depth, false, fields);
    if (!location) {
      res.status(404).json({ message: "Location not found" });
      return;
    }
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
}

async function handleWrite(
  req: NextApiRequest,
  res: NextApiResponse,
  path: string[]
) {
  if (!assertFmsWriteApiEnabled(res)) return;

  const citycode = path[0];
  if (!citycode) {
    res.status(404).json({ message: "Not found" });
    return;
  }

  const subPath = path[1];
  if (subPath !== "locations" || !path[2]) {
    res.status(404).json({ message: "Not found" });
    return;
  }

  const locationid = path[2];
  const body = parseBody(req);
  const method = req.method ?? "POST";

  try {
    // POST …/locations/{id}/subscriptions
    if (path[3] === "subscriptions" && !path[4]) {
      if (method !== "POST") return methodNotAllowed(res, method);
      if (!(await requireV3Auth(req, res, locationid, "operator"))) return;
      const subscription = (body.subscription ?? body) as Record<string, unknown>;
      const result = await v3Write.addSubscriptionV3(citycode, locationid, subscription);
      res.status(200).json(result);
      return;
    }

    // POST …/locations/{id}/completedtransactions
    if (path[3] === "completedtransactions" && !path[4]) {
      if (method !== "POST") return methodNotAllowed(res, method);
      if (!(await requireV3Auth(req, res, locationid, "operator,dataprovider.type2"))) return;
      const completed = (body.completedtransaction ?? body) as Record<string, unknown>;
      const result = await v3Write.uploadCompletedTransactionV3(
        citycode,
        locationid,
        completed
      );
      res.status(200).json(result);
      return;
    }

    // POST …/locations/{id}/idcodes/{idtype}/{idcode} (koppelpas)
    if (path[3] === "idcodes" && path[4] != null && path[5] != null) {
      if (method !== "POST") return methodNotAllowed(res, method);
      if (!(await requireV3Auth(req, res, locationid, "operator"))) return;
      const idtype = parseInt(path[4], 10);
      const newidcodes = (body.newidcodes ?? body) as Record<string, unknown>;
      const result = await v3Write.koppelpasV3(
        citycode,
        locationid,
        idtype,
        path[5],
        newidcodes
      );
      res.status(200).json(result);
      return;
    }

    if (path[3] !== "sections" || !path[4]) {
      res.status(404).json({ message: "Not found" });
      return;
    }

    const sectionid = path[4];

    // POST …/sections/{sec}/occupation
    if (path[5] === "occupation") {
      if (method !== "POST") return methodNotAllowed(res, method);
      const data = (body.data ?? body) as Record<string, unknown>;
      if (data.bikes == null && data.occupation == null) {
        res.status(400).json({ message: "data.bikes or data.occupation required", status: 0 });
        return;
      }
      if (data.bikes != null) {
        if (!(await requireV3Auth(req, res, locationid, "operator,dataprovider.type1"))) return;
      }
      if (data.occupation != null) {
        if (!(await requireV3Auth(req, res, locationid, "operator,dataprovider.type2"))) return;
      }
      const result = await v3Write.occupationAndSyncV3(locationid, sectionid, data);
      res.status(200).json(result);
      return;
    }

    // POST …/sections/{sec}/transactions
    if (path[5] === "transactions" && !path[6]) {
      if (method !== "POST") return methodNotAllowed(res, method);
      if (!(await requireV3Auth(req, res, locationid, "operator,dataprovider.type1"))) return;
      const transaction = (body.transaction ?? body) as Record<string, unknown>;
      const result = await v3Write.uploadTransactionV3(
        locationid,
        sectionid,
        transaction
      );
      res.status(200).json(result);
      return;
    }

    // POST …/sections/{sec}/completedtransactions
    if (path[5] === "completedtransactions") {
      if (method !== "POST") return methodNotAllowed(res, method);
      if (!(await requireV3Auth(req, res, locationid, "operator,dataprovider.type2"))) return;
      const completed = (body.completedtransaction ?? body) as Record<string, unknown>;
      const result = await v3Write.uploadCompletedTransactionV3(
        citycode,
        locationid,
        completed,
        sectionid
      );
      res.status(200).json(result);
      return;
    }

    // POST …/sections/{sec}/idcodes/{idtype}/{idcode}
    if (path[5] === "idcodes" && path[6] != null && path[7] != null) {
      if (method !== "POST") return methodNotAllowed(res, method);
      if (!(await requireV3Auth(req, res, locationid, "operator"))) return;
      const idtype = parseInt(path[6], 10);
      const newidcodes = (body.newidcodes ?? body) as Record<string, unknown>;
      const result = await v3Write.koppelpasV3(
        citycode,
        locationid,
        idtype,
        path[7],
        newidcodes
      );
      res.status(200).json(result);
      return;
    }

    if (path[5] !== "places" || !path[6]) {
      res.status(404).json({ message: "Not found" });
      return;
    }

    const placeid = path[6];

    // POST …/places/{place}/subscriptions
    if (path[7] === "subscriptions" && !path[8]) {
      if (method !== "POST") return methodNotAllowed(res, method);
      if (!(await requireV3Auth(req, res, locationid, "operator"))) return;
      const subscription = (body.subscription ?? body) as Record<string, unknown>;
      const result = await v3Write.addSubscriptionV3(citycode, locationid, subscription, {
        sectionid,
        placeid,
      });
      res.status(200).json(result);
      return;
    }

    // POST …/places/{place}/transactions
    if (path[7] === "transactions") {
      if (method !== "POST") return methodNotAllowed(res, method);
      if (!(await requireV3Auth(req, res, locationid, "operator,dataprovider.type1"))) return;
      const transaction = (body.transaction ?? body) as Record<string, unknown>;
      const placeIdNum = parseInt(placeid, 10);
      const result = await v3Write.uploadTransactionV3(
        locationid,
        sectionid,
        transaction,
        Number.isNaN(placeIdNum) ? undefined : placeIdNum
      );
      res.status(200).json(result);
      return;
    }

    // POST …/places/{place}/logs
    if (path[7] === "logs") {
      if (method !== "POST") return methodNotAllowed(res, method);
      if (!(await requireV3Auth(req, res, locationid, "operator"))) return;
      const properties = (body.properties ?? body) as Record<string, unknown>;
      const result = await v3Write.logPlaceV3(
        locationid,
        sectionid,
        placeid,
        properties
      );
      res.status(200).json(result);
      return;
    }

    // POST …/places/{place}/actions
    if (path[7] === "actions") {
      if (method !== "POST") return methodNotAllowed(res, method);
      if (!(await requireV3Auth(req, res, locationid, "operator"))) return;
      const properties = (body.properties ?? body) as Record<string, unknown>;
      const result = await v3Write.logPlaceV3(
        locationid,
        sectionid,
        placeid,
        properties
      );
      res.status(200).json(result);
      return;
    }

    // POST …/places/{place}/idcodes/{idtype}/{idcode}
    if (path[7] === "idcodes" && path[8] != null && path[9] != null) {
      if (method !== "POST") return methodNotAllowed(res, method);
      if (!(await requireV3Auth(req, res, locationid, "operator"))) return;
      const idtype = parseInt(path[8], 10);
      const newidcodes = (body.newidcodes ?? body) as Record<string, unknown>;
      const result = await v3Write.koppelpasV3(
        citycode,
        locationid,
        idtype,
        path[9],
        newidcodes
      );
      res.status(200).json(result);
      return;
    }

    // PUT|POST …/places/{place} (updatePlace / updatePost→log)
    if (!path[7]) {
      if (method !== "PUT" && method !== "POST") return methodNotAllowed(res, method);
      if (!(await requireV3Auth(req, res, locationid, "operator"))) return;
      const properties = (body.properties ?? body) as Record<string, unknown>;
      if (method === "POST" && properties.action != null) {
        const result = await v3Write.logPlaceV3(
          locationid,
          sectionid,
          placeid,
          properties
        );
        res.status(200).json(result);
        return;
      }
      const result = await v3Write.updatePlaceV3(
        locationid,
        sectionid,
        placeid,
        properties
      );
      res.status(200).json(result);
      return;
    }

    res.status(404).json({ message: "Not found" });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    console.error("FMS v3 write error:", err);
    res.status(400).json({ message, status: 0 });
  }
}

export default async function handle(
  req: NextApiRequest,
  res: NextApiResponse
) {
  setCors(res);

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  const path = (req.query.path as string[]) ?? [];

  try {
    if (req.method === "GET") {
      await handleGet(req, res, path);
      return;
    }

    if (req.method === "POST" || req.method === "PUT") {
      await handleWrite(req, res, path);
      return;
    }

    res.status(405).json({ message: "Method not allowed", status: 0 });
  } catch (error) {
    console.error("FMS v3 error:", error);
    res.status(500).json({
      message: error instanceof Error ? error.message : "Internal error",
    });
  }
}
