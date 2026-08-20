import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth";
import { authOptions } from "~/pages/api/auth/[...nextauth]";
import { userHasRight } from "~/types/utils";
import { VSSecurityTopic } from "~/types/securityprofile";
import {
  createRuweDataExport,
  createTransactiesExport,
  type CsvExportResult,
} from "~/backend/services/reports/transactionsExport";
import { createStallingsduurExport } from "~/backend/services/reports/stallingsduurExport";
import { createBezettingExport } from "~/backend/services/reports/bezettingExport";
import { GemeenteNotFoundError } from "~/backend/services/reports/csvExportLookups";

/**
 * On demand CSV report exports, replacing the pre-generated ColdFusion files
 * that used to be served from static.veiligstallen.nl.
 *
 * GET /api/protected/export/transacties?gemeenteID=&stallingsID=&jaar=
 * GET /api/protected/export/ruwedata?gemeenteID=&stallingsID=&jaar=&maand=
 * GET /api/protected/export/stallingsduur?gemeenteID=&jaar=
 * GET /api/protected/export/bezetting?gemeenteID=&stallingsID=&jaar=
 */

const singleValue = (value: string | string[] | undefined): string | undefined => {
  if (Array.isArray(value)) return value[0];
  return value;
};

export default async function handle(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const session = await getServerSession(req, res, authOptions);
  if (!session?.user) {
    res.status(401).json({ error: "Niet ingelogd - geen sessie gevonden" });
    return;
  }

  if (!userHasRight(session.user.securityProfile, VSSecurityTopic.rapportages)) {
    res.status(403).json({ error: "Access denied - insufficient permissions" });
    return;
  }

  const exportType = singleValue(req.query.exportType);
  const gemeenteID = singleValue(req.query.gemeenteID);
  const stallingsID = singleValue(req.query.stallingsID);
  const jaar = Number(singleValue(req.query.jaar));
  const maand = Number(singleValue(req.query.maand));

  if (!gemeenteID) {
    res.status(400).json({ error: "gemeenteID is verplicht" });
    return;
  }

  try {
    let result: CsvExportResult;

    switch (exportType) {
      case "transacties":
        result = await createTransactiesExport({ gemeenteID, stallingsID, jaar });
        break;
      case "ruwedata":
        if (!stallingsID) {
          res.status(400).json({ error: "stallingsID is verplicht voor deze export" });
          return;
        }
        result = await createRuweDataExport({ gemeenteID, stallingsID, jaar, maand });
        break;
      case "stallingsduur":
        result = await createStallingsduurExport({ gemeenteID, jaar });
        break;
      case "bezetting":
        if (!stallingsID) {
          res.status(400).json({ error: "stallingsID is verplicht voor deze export" });
          return;
        }
        result = await createBezettingExport({ gemeenteID, stallingsID, jaar });
        break;
      default:
        res.status(404).json({ error: `Onbekend exporttype: ${exportType ?? ""}` });
        return;
    }

    if (result.csv === "") {
      res.status(404).json({ error: "Geen gegevens beschikbaar voor deze selectie" });
      return;
    }

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${result.filename}"`);
    res.setHeader("Content-Length", Buffer.byteLength(result.csv, "utf8").toString());
    res.status(200).send(result.csv);
  } catch (error) {
    if (error instanceof GemeenteNotFoundError) {
      res.status(404).json({ error: error.message });
      return;
    }
    console.error(`Error creating ${exportType ?? "unknown"} export:`, error);
    res.status(500).json({ error: "Er is een fout opgetreden bij het maken van de export" });
  }
}
