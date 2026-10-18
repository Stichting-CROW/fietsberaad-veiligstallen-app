import type { NextApiRequest, NextApiResponse } from "next";
import ReportService from "~/backend/services/reports-service";
import { getServerSession } from "next-auth";
import { authOptions } from '~/pages/api/auth/[...nextauth]'
import { userHasRight } from "~/types/utils";
import { VSSecurityTopic } from "~/types/securityprofile";
import { getReportScope } from "~/backend/services/reports/scope";
import { getAbonnementswijzigingen, getLopendeAbonnementen } from "~/backend/services/reports/abonnementen";
import { getFinancieelMaandoverzicht } from "~/backend/services/reports/financieelMaandoverzicht";
import { getLaagSaldo } from "~/backend/services/reports/laagSaldo";
import { getPasOverzicht } from "~/server/display/overzichten-queries";
import { monthlyReport } from "~/modules/buurtstallingen/application/service";
import { prisma } from "~/server/db";

export default async function handle(req: NextApiRequest, res: NextApiResponse) {
  // Require authentication and rapportages role for all report endpoints
  const session = await getServerSession(req, res, authOptions);
  if (!session?.user) {
    console.error("Unauthorized - no session found");
    res.status(401).json({error: "Niet ingelogd - geen sessie gevonden"}); // Unauthorized
    return;
  }

  const hasRapportages = userHasRight(session?.user?.securityProfile, VSSecurityTopic.rapportages);
  if (!hasRapportages) {
    console.error("Access denied - insufficient permissions for reports");
    res.status(403).json({error: "Access denied - insufficient permissions"}); // Forbidden
    return;
  }

  if (req.method === 'POST') {
    let data = undefined;

    // one of 

    switch (req.query.reportType) {
      case "transacties_voltooid":
      case "inkomsten": {
        const reportParams = req.body.reportParams;

        if (undefined === reportParams) {
          res.status(405).end() // Method Not Allowed
        }

        data = await ReportService.getTransactionsPerPeriodData(reportParams);
        if (false !== data) {
          res.json(data);
        } else {
          res.status(500).end();
        }
        break;
      }
      case "bezetting": {
        const reportParams = req.body.reportParams;

        if (undefined === reportParams) {
          res.status(405).end() // Method Not Allowed
        }

        data = await ReportService.getBezettingsdata(reportParams);
        res.json(data);
        break;
      }
      case "absolute_bezetting": {
        const reportParams = req.body.reportParams;

        if (undefined === reportParams) {
          res.status(405).end(); // Method Not Allowed
        }

        data = await ReportService.getAbsoluteBezettingData(reportParams);
        res.json(data);
        break;
      }
      case "stallingsduur": {
        const reportParams = req.body.reportParams;

        if (undefined === reportParams) {
          res.status(405).end() // Method Not Allowed
        }
        data = await ReportService.getStallingsduurData(reportParams);
        res.json(data);
        break;
      }
      case "abonnementen":
      case "abonnementen_lopend": {
        const reportParams = req.body.reportParams;
        if (undefined === reportParams) {
          res.status(405).end();
          return;
        }
        const scope = await getReportScope(session.user.activeContactId ?? "");
        if (!scope) {
          res.status(400).json({ error: "Geen organisatie geselecteerd" });
          return;
        }
        const subscriptionScope = scope.kind === "exploitant"
          ? { exploitantId: scope.contactId }
          : { siteId: scope.contactId };
        try {
          data = req.query.reportType === "abonnementen"
            ? await getAbonnementswijzigingen(reportParams, subscriptionScope)
            : await getLopendeAbonnementen(reportParams, subscriptionScope);
          res.json(data);
        } catch (error) {
          console.error(error);
          res.status(500).end();
        }
        break;
      }
      case "financieel_maandoverzicht": {
        const scope = await getReportScope(session.user.activeContactId ?? "");
        const month = typeof req.body?.month === "string" ? req.body.month : "";
        if (!scope || !/^\d{4}-\d{2}$/.test(month)) {
          res.status(400).json({ error: "Kies een organisatie en een maand" });
          return;
        }
        try {
          res.json(await getFinancieelMaandoverzicht(scope, month));
        } catch (error) {
          console.error(error);
          res.status(500).end();
        }
        break;
      }
      case "maandrapport_buurtstallingen": {
        const scope = await getReportScope(session.user.activeContactId ?? "");
        const month = typeof req.body?.month === "string" ? req.body.month : "";
        const hasBuurtstallingen = userHasRight(session.user.securityProfile, VSSecurityTopic.buurtstallingen_beheer);
        if (!scope || scope.kind !== "gemeente" || !/^\d{4}-\d{2}$/.test(month) || !hasBuurtstallingen) {
          res.status(400).json({ error: "Kies een gemeente en een maand" });
          return;
        }
        const moduleLink = await prisma.modules_contacts.findFirst({
          where: { SiteID: scope.contactId, ModuleID: "buurtstallingen" },
          select: { ModuleID: true },
        });
        if (!moduleLink) {
          res.status(403).json({ error: "De module buurtstallingen staat uit voor deze organisatie" });
          return;
        }
        try {
          const period = monthWindow(month);
          const rows = await monthlyReport(scope.contactId, period.instant);
          res.json({
            organisatieNaam: scope.name,
            periodeStart: formatDay(period.start),
            periodeEind: formatDay(period.end),
            rows,
          });
        } catch (error) {
          console.error(error);
          res.status(500).end();
        }
        break;
      }
      case "pas": {
        const scope = await getReportScope(session.user.activeContactId ?? "");
        const pas = typeof req.body?.pas === "string" ? req.body.pas.trim() : "";
        if (!scope || !pas) {
          res.status(400).json({ error: "Kies een organisatie en een pasnummer" });
          return;
        }
        const siteIds = scope.kind === "gemeente"
          ? [scope.contactId]
          : (await prisma.contact_contact.findMany({
              where: { parentSiteID: scope.contactId },
              select: { childSiteID: true },
            })).map((link) => link.childSiteID);
        try {
          res.json(await getPasOverzicht({ siteIds, pasId: pas }));
        } catch (error) {
          console.error(error);
          res.status(500).end();
        }
        break;
      }
      case "laag_saldo": {
        const scope = await getReportScope(session.user.activeContactId ?? "");
        const maxSaldo = Number(String(req.body?.maxSaldo ?? "0").replace(",", "."));
        const stallingsId = typeof req.body?.stallingsId === "string" ? req.body.stallingsId : "";
        if (!scope || !Number.isFinite(maxSaldo)) {
          res.status(400).json({ error: "Ongeldige invoer" });
          return;
        }
        try {
          res.json(await getLaagSaldo(scope, maxSaldo, stallingsId || undefined));
        } catch (error) {
          console.error(error);
          res.status(500).end();
        }
        break;
      }
      case "volmeldingen":
      case "gelijktijdig_vol":
      case "downloads":
      default: {
        res.status(405).end() // Method Not Allowed
      }
    }
  } else {
    res.status(405).end() // Method Not Allowed
  }
}

const formatDay = (date: Date) => {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

/** Current month is measured up to now; a closed month up to its last moment. */
const monthWindow = (month: string): { instant: Date; start: Date; end: Date } => {
  const [yearStr, monthStr] = month.split("-");
  const year = Number(yearStr);
  const monthIndex = Number(monthStr) - 1;
  const start = new Date(year, monthIndex, 1);
  const next = new Date(year, monthIndex + 1, 1);
  const now = new Date();
  const end = now >= start && now < next ? now : new Date(next.getTime() - 1);
  return { instant: end, start, end };
};
