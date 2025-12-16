import type { NextApiRequest, NextApiResponse } from "next";
import ReportService from "~/backend/services/reports-service";
import { getServerSession } from "next-auth";
import { authOptions } from '~/pages/api/auth/[...nextauth]'
import { userHasRight } from "~/types/utils";
import { VSSecurityTopic } from "~/types/securityprofile";

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
      case "abonnementen_lopend":
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
