import { type NextApiRequest, type NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";
import { type AuthOptions } from "next-auth";
import { authOptions } from "~/pages/api/auth/[...nextauth]";
import { prisma } from "~/server/db";
import { type ReportContent } from "~/utils/reports/types";

interface BadDataReportParams {
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
    const { filterType = "", isNs = "all", showData = true }: BadDataReportParams = req.body;

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
        StallingsID: true,
        SiteID: true,
        ExploitantID: true,
      }
    });

    // Fetch all contacts data
    const contacts = await prisma.contacts.findMany({
      select: {
        ID: true,
      }
    });

    // Create the report content
    const reportContent = await createFixBadDataReport(fietsenstallingen, contacts, showData);

    return res.status(200).json(reportContent);
  } catch (error) {
    console.error("Error generating bad data report:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

// Move the report creation logic here from the utils file
const createFixBadDataReport = async (fietsenstallingen: any[], contacts: any[], showData = true): Promise<ReportContent> => {
    // Alles op een rij:
    // 1. fietsenstallingen.StallingsID: not null & unique
    // 2. fietsenstallingen.SiteID: not null & foreign key naar contacts.id (is al geimplementeerd)
    // 3. fietsenstallingen.ExploitantID: foreign key naar contacts.id (is al geimplementeerd)

    const alwaysvisibleColumns = [
        "Title",
        "Plaats",
        "Type",
        "OK",
        "CheckStallingsID",
        "CheckSiteID",
        "CheckExploitantID",
    ];

    const allColumns = [
        ...alwaysvisibleColumns,
        "ID",
        "StallingsID",
        "SiteID",
        "ExploitantID",
    ];

    const hiddenColumns = showData ? [] : allColumns.filter(col => !alwaysvisibleColumns.includes(col));

    const report: ReportContent = {
        title: 'Test for bad data',
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

    // make StallingID count map
    const countMap = new Map<string, number>();

    // Count occurrences of each StallingsID
    for (const stalling of fietsenstallingen) {
        if (stalling.StallingsID !== null) {
            const count = countMap.get(stalling.StallingsID) || 0;
            countMap.set(stalling.StallingsID, count + 1);
        }
    }

    fietsenstallingen.forEach((parkingdata: any) => {

        let checkStallingsID = null; // ok
        if (parkingdata.StallingsID === null) {
            checkStallingsID = "NULL"
        } else {
            const count = countMap.get(parkingdata.StallingsID) || 0;
            if (count > 1) {
                checkStallingsID = "DUPLICATE"
            }
        }

        let checkSiteID = null; // ok
        if (parkingdata.SiteID === null) {
            checkSiteID = "NULL"
        } else {
            const thecontact = contacts.find((contact) => contact.ID === parkingdata.SiteID);
            if (!thecontact) {
                checkSiteID = "NOT FOUND"
            }
        }

        let checkExploitantID = null; // ok
        if (parkingdata.ExploitantID !== null) {
            const thecontact = contacts.find((contact) => contact.ID === parkingdata.ExploitantID);
            if (!thecontact) {
                checkExploitantID = "NOT FOUND"
            }
        }

        const fullCheck = (checkStallingsID === null && checkSiteID === null && checkExploitantID === null);

        report.data.records.push({
            "ID": parkingdata.ID,
            "Title": parkingdata.Title,
            "Plaats": parkingdata.Plaats,
            "Type": parkingdata.Type,
            "StallingsID": parkingdata.StallingsID,
            "SiteID": parkingdata.SiteID,
            "OK": fullCheck === false ? "ERROR" : null,
            "ExploitantID": parkingdata.ExploitantID,
            "CheckStallingsID": checkStallingsID,
            "CheckSiteID": checkSiteID,
            "CheckExploitantID": checkExploitantID,
        });
    });

    return report;
} 