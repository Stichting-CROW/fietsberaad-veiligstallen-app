import { type NextApiRequest, type NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";
import { type AuthOptions } from "next-auth";
import { authOptions } from "~/pages/api/auth/[...nextauth]";
import { prisma } from "~/server/db";
import { type ReportContent } from "~/utils/reports/types";

interface StallingstegoedReportParams {
  filterType?: string;
  isNs?: string;
  showData?: boolean;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  // Require authentication for all requests
  const session = await getServerSession(req, res, authOptions as AuthOptions);
  if (!session) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { filterType = "", isNs = "all", showData = true }: StallingstegoedReportParams = req.body;

    // Build where clause for fietsenstallingen
    const whereClause: any = {};
    
    if (filterType !== "") {
      whereClause.Type = filterType;
    }
    
    if (isNs !== "all") {
      if (isNs === "true") {
        whereClause.EditorCreated = "NS-connector";
      } else if (isNs === "false") {
        whereClause.NOT = {
          EditorCreated: "NS-connector"
        };
      }
    }

    // Fetch fietsenstallingen data
    const fietsenstallingen = await prisma.fietsenstallingen.findMany({
      where: whereClause,
      select: {
        ID: true,
        Title: true,
        Plaats: true,
        Type: true,
        EditorCreated: true,
        SiteID: true,
        BerekentStallingskosten: true,
      }
    });

    // Fetch all contacts data
    const contacts = await prisma.contacts.findMany({
      select: {
        ID: true,
        UrlName: true,
      }
    });

    // Create the report content
    const reportContent = await createStallingstegoedReport(fietsenstallingen, contacts, showData);

    return res.status(200).json(reportContent);
  } catch (error) {
    console.error("Error generating stallingstegoed report:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

// Move the report creation logic here from the utils file
const createStallingstegoedReport = async (fietsenstallingen: any[], contacts: {ID: string, UrlName: string}[], showData: boolean): Promise<ReportContent> => {
    const alwaysvisibleColumns = [
        "Title",
        "Plaats",
        "Type",
        "isNs",
        "button_opwaarderen"
    ];

    const allColumns = [
        ...alwaysvisibleColumns,
        "link_url",
        "UrlName",
        "BerekentStallingskosten",
    ];

    const hiddenColumns = showData ? [] : allColumns.filter(col => !alwaysvisibleColumns.includes(col));

    const report: ReportContent = {
        title: 'Stallingstegoed',
        data: {
            columns: allColumns,
            records: [],
            hidden: hiddenColumns,
            actions: [
                {
                    name: "Original",
                    action: async (data) => {
                        const stalling = fietsenstallingen.find((fs) => fs.ID === data.ID);
                        if (!stalling) {
                            return;
                        }
                        // Return URL for client-side handling
                        const url = `https://veiligstallen.nl/stalling/${stalling.StallingsID}`;
                        return url;
                    },
                    icon: "👁️"
                },
                {
                    name: "Edit",
                    action: async (data) => {
                        const stalling = fietsenstallingen.find((fs) => fs.ID === data.ID);
                        if (!stalling) {
                            return;
                        }
                        
                        const url = `/?stallingid=${stalling.ID}`;
                        return url;
                    },
                    icon: "✏️"
                },
            ]
        },
    };

    const createVeiligstallenOrgOpwaardeerLinkForMunicipality = (municipalityID: string, urlName: string, fietsenstallingen: any[]) => {
        // This is a simplified version - in the real implementation, this would create a more complex URL
        // For now, we'll return a basic URL structure
        return `https://veiligstallen.nl/opwaarderen/${urlName}`;
    }

    const getOpwaarderenButton = (key: string, url: string) => {
        if (url === "") {
            return null;
        }

        return {
            type: "button",
            url: url,
            text: "Opwaarderen"
        };
    }

    for (const parkingdata of fietsenstallingen) {
        const isNS = parkingdata.EditorCreated === "NS-connector"

        const municipality = contacts.find((c: any) => c.ID === parkingdata.SiteID);
        const url = municipality ? createVeiligstallenOrgOpwaardeerLinkForMunicipality(municipality.ID, municipality.UrlName, fietsenstallingen) : "";
        const toonOpwaarderen = url !== "";

        report.data.records.push({
            "ID": parkingdata.ID,
            "Title": parkingdata.Title,
            "Plaats": parkingdata.Plaats,
            "Type": parkingdata.Type,
            "isNs": isNS ? "NS" : "",
            "button_opwaarderen": toonOpwaarderen ? getOpwaarderenButton(parkingdata.ID, url) : null,
            "link_url": toonOpwaarderen ? url : "",
            "UrlName": municipality ? municipality.UrlName : "",
            "BerekentStallingskosten": parkingdata.BerekentStallingskosten ? "Stalling berekent kosten stallingstransacties" : "FMS berekent kosten stallingstransacties",
        });
    }

    return report;
} 