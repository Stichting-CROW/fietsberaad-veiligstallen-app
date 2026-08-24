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
import {
  CsvExportCacheKeyError,
  getCachedOrGenerateCsvExport,
  type CsvExportCacheKey,
} from "~/backend/services/reports/csvExportCache";
import {
  CSV_EXPORT_TYPES,
  type CsvExportType,
} from "~/backend/services/reports/csvExportFilename";

/**
 * On demand CSV report exports, replacing the pre-generated ColdFusion files
 * that used to be served from static.veiligstallen.nl.
 *
 * Settled periods (closed + settling window) are served from a gzip disk cache
 * when present; running/recent periods always regenerate. Only downloads that
 * were actually requested are written to the cache.
 *
 * GET /api/protected/export/transacties?gemeenteID=&stallingsID=&jaar=
 * GET /api/protected/export/ruwedata?gemeenteID=&stallingsID=&jaar=&maand=
 *   (maand is optional; omit for a full-year export)
 * GET /api/protected/export/stallingsduur?gemeenteID=&jaar=
 * GET /api/protected/export/bezetting?gemeenteID=&stallingsID=&jaar=
 */

const singleValue = (value: string | string[] | undefined): string | undefined => {
  if (Array.isArray(value)) return value[0];
  return value;
};

const isCsvExportType = (value: string | undefined): value is CsvExportType =>
  !!value && (CSV_EXPORT_TYPES as readonly string[]).includes(value);

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

  const exportTypeRaw = singleValue(req.query.exportType);
  const gemeenteID = singleValue(req.query.gemeenteID);
  const stallingsID = singleValue(req.query.stallingsID);
  const jaar = Number(singleValue(req.query.jaar));
  const maandRaw = singleValue(req.query.maand);
  const maand =
    maandRaw !== undefined && maandRaw !== "" ? Number(maandRaw) : undefined;

  if (!gemeenteID) {
    res.status(400).json({ error: "gemeenteID is verplicht" });
    return;
  }

  if (!isCsvExportType(exportTypeRaw)) {
    res.status(404).json({ error: `Onbekend exporttype: ${exportTypeRaw ?? ""}` });
    return;
  }

  const exportType = exportTypeRaw;

  if (exportType === "ruwedata" || exportType === "bezetting") {
    if (!stallingsID) {
      res.status(400).json({ error: "stallingsID is verplicht voor deze export" });
      return;
    }
  }

  if (exportType === "ruwedata" && maand !== undefined) {
    if (!Number.isInteger(maand) || maand < 1 || maand > 12) {
      res.status(400).json({ error: "Ongeldige maand" });
      return;
    }
  }

  const cacheKey: CsvExportCacheKey = {
    exportType,
    gemeenteID,
    stallingsID,
    jaar,
    maand: exportType === "ruwedata" ? maand : undefined,
  };

  try {
    const result: CsvExportResult = await getCachedOrGenerateCsvExport(cacheKey, async () => {
      switch (exportType) {
        case "transacties":
          return createTransactiesExport({ gemeenteID, stallingsID, jaar });
        case "ruwedata":
          return createRuweDataExport({ gemeenteID, stallingsID, jaar, maand });
        case "stallingsduur":
          return createStallingsduurExport({ gemeenteID, jaar });
        case "bezetting":
          return createBezettingExport({ gemeenteID, stallingsID: stallingsID!, jaar });
      }
    });

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
    if (error instanceof CsvExportCacheKeyError) {
      res.status(400).json({ error: error.message });
      return;
    }
    console.error(`Error creating ${exportType} export:`, error);
    res.status(500).json({ error: "Er is een fout opgetreden bij het maken van de export" });
  }
}
