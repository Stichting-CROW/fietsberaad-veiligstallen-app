import type { NextApiRequest, NextApiResponse } from "next";
import {
  parseBasicAuth,
  validateFmsAuth,
} from "~/server/services/fms/fms-auth";
import * as fmsService from "~/server/services/fms/fms-service";
import * as wachtrijService from "~/server/services/fms/wachtrij-service";

function set401(res: NextApiResponse, hadAuthHeader: boolean) {
  if (!hadAuthHeader) {
    res.setHeader("WWW-Authenticate", 'Basic realm="FMSService"');
  }
  res.status(401).json({ message: "Unauthorized", status: 0 });
}

function setCors(res: NextApiResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
}

export default async function handle(
  req: NextApiRequest,
  res: NextApiResponse
) {
  setCors(res);
  const path = (req.query.path as string[]) ?? [];
  const method = path[0] ?? "";
  const bikeparkID = path[1];
  const sectionID = path[2];

  const authHeader = req.headers.authorization;
  const credentials = parseBasicAuth(authHeader);

  const publicMethods = [
    "getJsonBikeTypes",
    "getJsonPaymentTypes",
    "getJsonClientTypes",
    "getServerTime",
  ];

  if (!publicMethods.includes(method) && method) {
    if (!credentials) {
      set401(res, false);
      return;
    }
    const auth = await validateFmsAuth(
      credentials.username,
      credentials.password,
      bikeparkID
    );
    if (!auth.ok) {
      set401(res, !!authHeader);
      return;
    }
  }

  const writeMethods = [
    "saveJsonBike",
    "saveJsonBikes",
    "uploadJsonTransaction",
    "uploadJsonTransactions",
    "addJsonSaldo",
    "addJsonSaldos",
    "syncSector",
  ];

  const writeMethodRequiresBikepark = ["saveJsonBike", "saveJsonBikes", "addJsonSaldo", "addJsonSaldos", "uploadJsonTransaction", "uploadJsonTransactions", "syncSector"];
  const writeMethodRequiresSection = ["uploadJsonTransaction", "uploadJsonTransactions", "syncSector"];

  if (writeMethods.includes(method)) {
    if (!bikeparkID && writeMethodRequiresBikepark.includes(method)) {
      res.status(400).json({ message: "bikeparkID required", status: 0 });
      return;
    }
    if (!sectionID && writeMethodRequiresSection.includes(method)) {
      res.status(400).json({ message: "sectionID required", status: 0 });
      return;
    }
  }

  try {
    switch (method) {
      case "getServerTime": {
        const time = await fmsService.getServerTime();
        res.status(200).json(time);
        break;
      }
      case "getJsonBikeTypes": {
        const types = await fmsService.getBikeTypes();
        const legacy = types.map((t) => ({ BIKETYPEID: t.bikeTypeID, NAME: t.name }));
        res.status(200).json(legacy);
        break;
      }
      case "getJsonPaymentTypes": {
        const types = await fmsService.getPaymentTypes();
        const legacy = types.map((t) => ({
          PAYMENTTYPEID: t.paymentTypeID,
          NAME: t.name,
          DESCRIPTION: t.description,
        }));
        res.status(200).json(legacy);
        break;
      }
      case "getJsonClientTypes": {
        const types = await fmsService.getClientTypes();
        const legacy = types.map((t) => ({ CLIENTTYPEID: t.clientTypeID, NAME: t.name }));
        res.status(200).json(legacy);
        break;
      }
      case "saveJsonBike": {
        if (req.method !== "POST") {
          res.status(405).json({ message: "Method not allowed", status: 0 });
          return;
        }
        const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body ?? {};
        const bike = {
          barcode: body.barcode ?? "",
          passID: body.passID ?? "",
          RFID: body.RFID,
          RFIDBike: body.RFIDBike,
          biketypeID: body.biketypeID,
        };
        if (!bike.barcode || !bike.passID) {
          res.status(400).json({ message: "barcode and passID required", status: 0 });
          return;
        }
        const result = await wachtrijService.addBikeToWachtrij(bikeparkID!, bike);
        res.status(200).json({ message: "Ok", status: 1, id: result.id });
        break;
      }
      case "saveJsonBikes": {
        if (req.method !== "POST") {
          res.status(405).json({ message: "Method not allowed", status: 0 });
          return;
        }
        const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body ?? {};
        const bikes = Array.isArray(body) ? body : body.bikes ?? [];
        const ids: number[] = [];
        for (const b of bikes) {
          const bike = {
            barcode: b.barcode ?? "",
            passID: b.passID ?? "",
            RFID: b.RFID,
            RFIDBike: b.RFIDBike,
            biketypeID: b.biketypeID,
          };
          if (bike.barcode && bike.passID) {
            const r = await wachtrijService.addBikeToWachtrij(bikeparkID!, bike);
            ids.push(r.id);
          }
        }
        res.status(200).json({ message: "Ok", status: 1, ids });
        break;
      }
      case "uploadJsonTransaction": {
        if (req.method !== "POST") {
          res.status(405).json({ message: "Method not allowed", status: 0 });
          return;
        }
        const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body ?? {};
        const result = await wachtrijService.addTransactionToWachtrij(
          bikeparkID!,
          sectionID!,
          body,
          body.placeID,
          body.externalPlaceID
        );
        res.status(200).json({ message: "Ok", status: 1, id: result.id });
        break;
      }
      case "uploadJsonTransactions": {
        if (req.method !== "POST") {
          res.status(405).json({ message: "Method not allowed", status: 0 });
          return;
        }
        const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body ?? {};
        const txs = Array.isArray(body) ? body : body.transactions ?? [];
        const ids: number[] = [];
        for (const tx of txs) {
          const r = await wachtrijService.addTransactionToWachtrij(
            bikeparkID!,
            sectionID!,
            tx,
            tx.placeID,
            tx.externalPlaceID
          );
          ids.push(r.id);
        }
        res.status(200).json({ message: "Ok", status: 1, ids });
        break;
      }
      case "addJsonSaldo": {
        if (req.method !== "POST") {
          res.status(405).json({ message: "Method not allowed", status: 0 });
          return;
        }
        const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body ?? {};
        const result = await wachtrijService.addSaldoToWachtrij(bikeparkID!, body);
        res.status(200).json({ message: "Ok", status: 1, id: result.id });
        break;
      }
      case "addJsonSaldos": {
        if (req.method !== "POST") {
          res.status(405).json({ message: "Method not allowed", status: 0 });
          return;
        }
        const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body ?? {};
        const saldos = Array.isArray(body) ? body : body.saldos ?? [];
        const ids: number[] = [];
        for (const s of saldos) {
          const r = await wachtrijService.addSaldoToWachtrij(bikeparkID!, s);
          ids.push(r.id);
        }
        res.status(200).json({ message: "Ok", status: 1, ids });
        break;
      }
      case "syncSector": {
        if (req.method !== "PUT" && req.method !== "POST") {
          res.status(405).json({ message: "Method not allowed", status: 0 });
          return;
        }
        const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body ?? {};
        const sync = {
          bikes: body.bikes ?? [],
          bikeparkID: bikeparkID!,
          sectionID: sectionID!,
          transactionDate: body.transactionDate ?? new Date().toISOString(),
        };
        const result = await wachtrijService.addSyncToWachtrij(sync);
        res.status(200).json({ message: "Ok", status: 1, id: result.id });
        break;
      }
      default:
        res.status(404).json({
          message: `Method ${method} not found or not yet implemented`,
          status: 0,
        });
    }
  } catch (error) {
    console.error("FMS v2 error:", error);
    res.status(500).json({
      message: error instanceof Error ? error.message : "Internal error",
      status: 0,
    });
  }
}
