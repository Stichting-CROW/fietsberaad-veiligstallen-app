import type { NextApiRequest, NextApiResponse } from "next";
import {
  applyStatusChange,
  deletePlace,
  getWorkspace,
  listExpiredCancellations,
  joinWaitingList,
  listFacilities,
  monthlyReport,
  occupantExport,
  waitingListExport,
  moveWaitingList,
  removeWaitingListEntry,
  renderContract,
  reservePlace,
  searchHolders,
  swapPlaces,
  updateHolder,
} from "~/modules/buurtstallingen/application/service";
import { requireBuurtstallingenOperator, sendBuurtstallingenError } from "~/modules/buurtstallingen/application/http";
import { isBuurtstallingenEngineEnabled } from "~/modules/buurtstallingen/config";
import { documentPage } from "~/modules/buurtstallingen/domain/documents";
import type { Qualification } from "~/modules/buurtstallingen/domain/types";

export default async function handle(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method === "GET") {
      const operator = await requireBuurtstallingenOperator(req, res, "read");
      if (!operator) return;
      const stallingId = typeof req.query.stallingId === "string" ? req.query.stallingId : "";
      if (req.query.export === "maand") {
        const rows = await monthlyReport(operator.siteId);
        const lines = [
          ["StallingsID FMS", "StallingsID Intern", "Naam stalling", "Soort stalling", "Capaciteit", "Bezetting", "Bezettingsgraad", "Aantal nieuwe abonnees", "Aantal opzeggingen", "Aantal wachtenden"].map(csv).join(","),
          ...rows.map((row) => [csv(row.stallingsId), csv(row.externalId), csv(row.title), csv(row.type), String(row.capacity), String(row.occupied), String(row.occupancyRate), String(row.created), String(row.cancelled), String(row.waiting)].join(",")),
        ];
        sendCsv(res, "buurtstallingen-maand.csv", lines);
        return;
      }
      if (req.query.export === "wachtlijst" || req.query.export === "gebruikers") {
        if (!operator.canWrite) {
          res.status(403).json({ error: "Geen rechten voor deze export" });
          return;
        }
        const type = req.query.type === "fietstrommel" ? "fietstrommel" : "buurtstalling";
        if (req.query.export === "wachtlijst") {
          const rows = await waitingListExport(operator.siteId, type);
          const lines = [
            ["ID_stalling", "Naam_stalling", "Volgnummer", "Voorkeur_rek", "Emailadres", "Voornaam", "Tussenvoegsel", "Achternaam", "Telefoon1", "Telefoon2", "Sinds"].map(csv).join(","),
            ...rows.map((row) => [csv(row.stallingsId), csv(row.title), String(row.sequence ?? ""), csv(row.preference), csv(row.email), csv(row.firstName), csv(row.middleName), csv(row.lastName), csv(row.phone), csv(row.mobile), csv(row.since)].join(",")),
          ];
          sendCsv(res, `wachtlijst-${type}.csv`, lines);
          return;
        }
        const rows = await occupantExport(operator.siteId, type);
        const lines = [
          ["email", "titel", "naam", "locationid", "locatienaam", "sectionid", "sectienaam", "pleknaam"].map(csv).join(","),
          ...rows.map((row) => [csv(row.email), csv(row.salutation), csv(row.name), csv(row.stallingsId), csv(row.stallingTitle), csv(row.sectionId), csv(row.sectionTitle), csv(row.placeTitle)].join(",")),
        ];
        sendCsv(res, `gebruikers-${type}.csv`, lines);
        return;
      }
      if (req.query.document === "contract" || req.query.document === "machtiging") {
        const placeId = typeof req.query.placeId === "string" ? req.query.placeId : "";
        const rendered = await renderContract({
          siteId: operator.siteId,
          stallingId,
          placeId,
          kind: req.query.document,
        });
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.status(200).send(documentPage({ title: rendered.title, body: rendered.html, logoUrl: rendered.logoUrl, logoAlt: rendered.logoAlt }));
        return;
      }
      if (req.query.verlopen === "1") {
        res.status(200).json({
          data: await listExpiredCancellations(operator.siteId),
          canWrite: operator.canWrite,
          engineEnabled: isBuurtstallingenEngineEnabled(operator.siteId),
        });
        return;
      }
      if (typeof req.query.q === "string") {
        res.status(200).json({ data: await searchHolders(operator.siteId, req.query.q) });
        return;
      }
      if (stallingId) {
        const workspace = await getWorkspace(operator.siteId, stallingId);
        res.status(200).json({ ...workspace, canWrite: operator.canWrite, canDelete: operator.canDelete });
        return;
      }
      const type = req.query.type === "fietstrommel" || req.query.type === "buurtstalling" ? req.query.type : undefined;
      res.status(200).json({ ...(await listFacilities(operator.siteId, type)), canWrite: operator.canWrite });
      return;
    }

    if (req.method !== "POST") {
      res.status(405).json({ error: "Methode niet toegestaan" });
      return;
    }
    const operator = await requireBuurtstallingenOperator(req, res, "write");
    if (!operator) return;
    const body = req.body ?? {};
    const stallingId = String(body.stallingId ?? "");
    switch (body.action) {
      case "reserve":
        res.status(200).json(await reservePlace({
          siteId: operator.siteId,
          stallingId,
          accountId: String(body.accountId),
          qualification: asQualification(body.qualification),
          bikeTypeId: Number(body.bikeTypeId),
          subscriptionTypeId: body.subscriptionTypeId ? Number(body.subscriptionTypeId) : null,
        }));
        return;
      case "status":
        res.status(200).json(await applyStatusChange({
          siteId: operator.siteId,
          stallingId,
          placeId: String(body.placeId),
          next: body.next,
          subscriptionTypeId: body.subscriptionTypeId ? Number(body.subscriptionTypeId) : null,
        }));
        return;
      case "swap":
        await swapPlaces(operator.siteId, stallingId, String(body.placeIdA), String(body.placeIdB));
        res.status(200).json({ ok: true });
        return;
      case "wachtlijst":
        res.status(200).json(await joinWaitingList({
          siteId: operator.siteId,
          stallingId,
          accountId: String(body.accountId),
          qualification: asQualification(body.qualification),
          bikeTypeId: Number(body.bikeTypeId),
        }));
        return;
      case "wachtlijst-wijzig":
        await moveWaitingList({
          siteId: operator.siteId,
          stallingId,
          entryId: String(body.entryId),
          sequenceNumber: Number(body.sequenceNumber),
          qualification: asQualification(body.qualification),
        });
        res.status(200).json({ ok: true });
        return;
      case "wachtlijst-verwijder":
        await removeWaitingListEntry(operator.siteId, stallingId, String(body.entryId));
        res.status(200).json({ ok: true });
        return;
      case "delete-place": {
        const deleter = await requireBuurtstallingenOperator(req, res, "delete");
        if (!deleter) return;
        await deletePlace(deleter.siteId, stallingId, String(body.placeId));
        res.status(200).json({ ok: true });
        return;
      }
      case "houder":
        await updateHolder({
          siteId: operator.siteId,
          stallingId,
          accountId: String(body.accountId),
          firstName: String(body.firstName ?? ""),
          middleName: String(body.middleName ?? ""),
          lastName: String(body.lastName ?? ""),
          email: String(body.email ?? ""),
          phone: String(body.phone ?? ""),
          mobile: String(body.mobile ?? ""),
          address: String(body.address ?? ""),
          addressNr: String(body.addressNr ?? ""),
          zip: String(body.zip ?? ""),
          city: String(body.city ?? ""),
        });
        res.status(200).json({ ok: true });
        return;
      default:
        res.status(400).json({ error: "Onbekende actie" });
    }
  } catch (error) {
    sendBuurtstallingenError(res, error);
  }
}

function asQualification(value: unknown): Qualification {
  return value === "UNDER" || value === "ABOVE" ? value : "NONE";
}

function csv(value: string | null | undefined): string {
  return `"${(value ?? "").replaceAll('"', '""')}"`;
}

function sendCsv(res: NextApiResponse, filename: string, lines: string[]) {
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.status(200).send(`\uFEFF${lines.join("\n")}`);
}
