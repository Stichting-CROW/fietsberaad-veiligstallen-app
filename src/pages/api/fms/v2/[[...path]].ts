import type { NextApiRequest, NextApiResponse } from "next";
import {
  parseBasicAuth,
  validateFmsAuth,
} from "~/server/services/fms/fms-auth";
import * as fmsService from "~/server/services/fms/fms-service";
import {
  getSectors,
  getBikes,
  getBikeUpdates,
  getSubscriptors,
  getLockerInfo,
} from "~/server/services/fms/fms-read-service";
import { updateLocker, isAllowedToUse } from "~/server/services/fms/fms-locker-service";
import { reportOccupationData } from "~/server/services/fms/report-occupation-service";
import { addSubscription, subscribe } from "~/server/services/fms/subscription-service";
import { logFmsCall } from "~/server/services/fms/webservice-log";
import * as wachtrijService from "~/server/services/fms/wachtrij-service";
import { assertFmsWriteAllowedForSession } from "~/server/services/fms/fms-write-policy";

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
    "reportOccupationData",
    "reportJsonOccupationData",
    "updateLocker",
    "addSubscription",
    "subscribe",
  ];

  const writeMethodRequiresBikepark = ["saveJsonBike", "saveJsonBikes", "addJsonSaldo", "addJsonSaldos", "uploadJsonTransaction", "uploadJsonTransactions", "syncSector", "reportOccupationData", "reportJsonOccupationData", "updateLocker", "addSubscription", "subscribe"];
  const writeMethodRequiresSection = ["uploadJsonTransaction", "uploadJsonTransactions", "syncSector", "reportOccupationData", "reportJsonOccupationData", "updateLocker", "getLockerInfo", "isAllowedToUse"];

  if (writeMethods.includes(method) || ["getLockerInfo", "isAllowedToUse", "updateLocker"].includes(method)) {
    if (!bikeparkID && writeMethodRequiresBikepark.includes(method)) {
      res.status(400).json({ message: "bikeparkID required", status: 0 });
      return;
    }
    if (!sectionID && writeMethodRequiresSection.includes(method)) {
      res.status(400).json({ message: "sectionID required", status: 0 });
      return;
    }
  }

  if (writeMethods.includes(method)) {
    const writeOk = await assertFmsWriteAllowedForSession(req, res);
    if (!writeOk) return;
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
      case "getJsonSectors": {
        if (!bikeparkID) {
          res.status(400).json({ message: "bikeparkID required", status: 0 });
          return;
        }
        const sectors = await getSectors(bikeparkID);
        res.status(200).json(sectors);
        break;
      }
      case "getJsonBikes": {
        if (!bikeparkID) {
          res.status(400).json({ message: "bikeparkID required", status: 0 });
          return;
        }
        const bikes = await getBikes(bikeparkID);
        res.status(200).json(bikes);
        break;
      }
      case "getJsonBikeUpdates": {
        if (!bikeparkID) {
          res.status(400).json({ message: "bikeparkID required", status: 0 });
          return;
        }
        const fromDateStr = (req.query.fromDate as string) ?? req.query.fromdate;
        if (!fromDateStr || typeof fromDateStr !== "string") {
          res.status(400).json({ message: "fromDate required (ISO or yyyy-mm-dd hh:mm:ss)", status: 0 });
          return;
        }
        const fromDate = new Date(fromDateStr);
        if (Number.isNaN(fromDate.getTime())) {
          res.status(400).json({ message: "Invalid fromDate", status: 0 });
          return;
        }
        const updates = await getBikeUpdates(bikeparkID, fromDate);
        res.status(200).json(updates);
        break;
      }
      case "getJsonSubscriptors": {
        if (!bikeparkID) {
          res.status(400).json({ message: "bikeparkID required", status: 0 });
          return;
        }
        const subscriptors = await getSubscriptors(bikeparkID);
        res.status(200).json(subscriptors);
        break;
      }
      case "getLockerInfo": {
        if (!bikeparkID || !sectionID) {
          res.status(400).json({ message: "bikeparkID and sectionID required", status: 0 });
          return;
        }
        const placeID = path[3] ?? req.query.placeID;
        if (!placeID || typeof placeID !== "string") {
          res.status(400).json({ message: "placeID required", status: 0 });
          return;
        }
        const locker = await getLockerInfo(bikeparkID, sectionID, placeID);
        res.status(200).json(locker);
        break;
      }
      case "isAllowedToUse": {
        if (!bikeparkID || !sectionID) {
          res.status(400).json({ message: "bikeparkID and sectionID required", status: 0 });
          return;
        }
        const placeID = path[3] ?? req.query.placeID;
        const rfid = (req.query.rfid as string) ?? (req.query.passID as string);
        if (!placeID || typeof placeID !== "string") {
          res.status(400).json({ message: "placeID required", status: 0 });
          return;
        }
        if (!rfid || typeof rfid !== "string") {
          res.status(400).json({ message: "rfid or passID required", status: 0 });
          return;
        }
        const result = await isAllowedToUse(bikeparkID, sectionID, placeID, rfid);
        res.status(200).json(result);
        break;
      }
      case "updateLocker": {
        if (req.method !== "POST" && req.method !== "PUT") {
          res.status(405).json({ message: "Method not allowed", status: 0 });
          return;
        }
        if (!bikeparkID || !sectionID) {
          res.status(400).json({ message: "bikeparkID and sectionID required", status: 0 });
          return;
        }
        const placeID = path[3] ?? req.query.placeID;
        if (!placeID || typeof placeID !== "string") {
          res.status(400).json({ message: "placeID required", status: 0 });
          return;
        }
        const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body ?? {};
        const result = await updateLocker(bikeparkID, sectionID, placeID, {
          statuscode: body.statuscode ?? body.statusCode ?? 0,
          transactionDate: body.transactionDate,
          transactionExpiryDate: body.transactionExpiryDate,
          cost: body.cost ?? body.price,
          paymentTypeID: body.paymentTypeID ?? body.paymenttypeid,
          typeCheck: body.typeCheck ?? body.typecheck ?? "user",
        });
        void logFmsCall(
          "updateLocker",
          bikeparkID,
          `${sectionID}/${placeID} status=${body.statuscode ?? body.statusCode ?? 0} result=${result.status}`
        );
        res.status(200).json({ message: result.message, status: result.status });
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
      case "reportOccupationData":
      case "reportJsonOccupationData": {
        if (req.method !== "POST") {
          res.status(405).json({ message: "Method not allowed", status: 0 });
          return;
        }
        const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body ?? {};
        const payload = {
          occupation: body.occupation ?? body.Bezetting ?? 0,
          timestamp: body.timestamp,
          capacity: body.capacity ?? body.Capacity,
          checkins: body.checkins ?? body.Checkins,
          checkouts: body.checkouts ?? body.Checkouts,
          open: body.open ?? body.Open,
          interval: body.interval ?? body.Interval,
          source: body.source ?? body.Source,
          rawData: body.rawData ?? body.RawData,
        };
        if (typeof payload.occupation !== "number" || payload.occupation < 0) {
          res.status(400).json({ message: "occupation (number >= 0) required", status: 0 });
          return;
        }
        const result = await reportOccupationData(bikeparkID!, sectionID!, payload);
        res.status(200).json({ message: "Ok", status: 1, id: result.tmpId });
        break;
      }
      case "addSubscription": {
        if (req.method !== "POST") {
          res.status(405).json({ message: "Method not allowed", status: 0 });
          return;
        }
        if (!bikeparkID) {
          res.status(400).json({ message: "bikeparkID required", status: 0 });
          return;
        }
        const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body ?? {};
        const result = await addSubscription(bikeparkID, {
          subscriptiontypeID: body.subscriptiontypeID ?? body.subscriptionTypeID ?? 0,
          passID: body.passID ?? body.idcode,
          accountID: body.accountID ?? body.AccountID,
          amount: body.amount ?? body.prijsInclBtw,
          paymentTypeID: body.paymentTypeID ?? body.paymenttypeid ?? 1,
          ingangsdatum: body.ingangsdatum ?? body.transactionDate,
          afloopdatum: body.afloopdatum,
          transactionDate: body.transactionDate,
        });
        void logFmsCall("addSubscription", bikeparkID, `subscriptiontype=${body.subscriptiontypeID} result=${result.status}`);
        res.status(200).json({ message: result.message, status: result.status, id: result.id });
        break;
      }
      case "subscribe": {
        if (req.method !== "POST") {
          res.status(405).json({ message: "Method not allowed", status: 0 });
          return;
        }
        if (!bikeparkID) {
          res.status(400).json({ message: "bikeparkID required", status: 0 });
          return;
        }
        const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body ?? {};
        const subscriptionID = body.subscriptionID ?? body.subscriptionId ?? body.abonnementID ?? 0;
        const passID = body.passID ?? body.idcode ?? body.passId ?? "";
        if (!subscriptionID || !passID) {
          res.status(400).json({ message: "subscriptionID and passID required", status: 0 });
          return;
        }
        const result = await subscribe(bikeparkID, { subscriptionID, passID });
        void logFmsCall("subscribe", bikeparkID, `subscription=${subscriptionID} passID=${passID} result=${result.status}`);
        res.status(200).json({ message: result.message, status: result.status });
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
