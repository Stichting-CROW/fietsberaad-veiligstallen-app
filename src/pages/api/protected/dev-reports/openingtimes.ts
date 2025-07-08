import { type NextApiRequest, type NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";
import { type AuthOptions } from "next-auth";
import { authOptions } from "~/pages/api/auth/[...nextauth]";
import { prisma } from "~/server/db";
import { type ReportContent } from "~/utils/reports/types";
import moment from "moment";

interface OpeningTimesReportParams {
  filterType?: string;
  isNs?: string;
  filterDateTime?: string;
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
    const { filterType = "", isNs = "all", filterDateTime, showData = true }: OpeningTimesReportParams = req.body;

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
        Open_ma: true,
        Dicht_ma: true,
        Open_di: true,
        Dicht_di: true,
        Open_wo: true,
        Dicht_wo: true,
        Open_do: true,
        Dicht_do: true,
        Open_vr: true,
        Dicht_vr: true,
        Open_za: true,
        Dicht_za: true,
        Open_zo: true,
        Dicht_zo: true,
        Openingstijden: true,
      }
    });

    // Create the report content
    const timestamp = filterDateTime ? moment(filterDateTime) : moment();
    const reportContent = await createOpeningTimesReport(fietsenstallingen, timestamp, showData);

    return res.status(200).json(reportContent);
  } catch (error) {
    console.error("Error generating opening times report:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

// Move the report creation logic here from the utils file
const createOpeningTimesReport = async (fietsenstallingen: any[], timestamp: moment.Moment, showData: boolean): Promise<ReportContent> => {
  const alwaysvisibleColumns = [
    "Title",
    "Plaats",
    "Type",
    "isNs",
    "txt_ma",
    "txt_di",
    "txt_wo",
    "txt_do",
    "txt_vr",
    "txt_za",
    "txt_zo",
    "txt_today"
  ];

  const allColumns = [
    ...alwaysvisibleColumns,
    "ID",
    "Open_ma",
    "Dicht_ma",
    "Open_di",
    "Dicht_di",
    "Open_wo",
    "Dicht_wo",
    "Open_do",
    "Dicht_do",
    "Open_vr",
    "Dicht_vr",
    "Open_za",
    "Dicht_za",
    "Open_zo",
    "Dicht_zo",
    "Openingstijden",
    "EditorCreated"
  ];

  const hiddenColumns = showData ? [] : allColumns.filter(col => !alwaysvisibleColumns.includes(col));

  const report: ReportContent = {
    title: 'Opening/Closing times',
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

  const formatUtcTime = (dbtime: Date | null) => {
    if (null === dbtime) {
      return "null"
    } else {
      return moment.utc(dbtime).format('HH:mm');
    }
  }

  const formatOpeningTimes = (parkingdata: any, day: string, dayName: string, isToday: boolean, isNS: boolean) => {
    const openField = `Open_${day}` as keyof typeof parkingdata;
    const closeField = `Dicht_${day}` as keyof typeof parkingdata;
    
    const openTime = parkingdata[openField];
    const closeTime = parkingdata[closeField];
    
    if (!openTime && !closeTime) {
      return isToday ? "Vandaag: Gesloten" : `${dayName}: Gesloten`;
    }
    
    const openStr = openTime ? moment.utc(openTime).format('HH:mm') : '--:--';
    const closeStr = closeTime ? moment.utc(closeTime).format('HH:mm') : '--:--';
    
    const timeStr = `${openStr} - ${closeStr}`;
    return isToday ? `Vandaag: ${timeStr}` : `${dayName}: ${timeStr}`;
  }

  const formatOpeningToday = (parkingdata: any, timestamp: moment.Moment) => {
    const day = timestamp.day();
    const dayNames = ['zo', 'ma', 'di', 'wo', 'do', 'vr', 'za'];
    const dayName = dayNames[day];
    
    const isNS = parkingdata.EditorCreated === "NS-connector";
    const formatted = formatOpeningTimes(parkingdata, dayName, `Dag ${day}`, true, isNS);
    
    return { message: formatted };
  }

  fietsenstallingen.forEach((parkingdata) => {
    const isNS = parkingdata.EditorCreated === "NS-connector"
    const wkday = timestamp.day();

    report.data.records.push({
      "ID": parkingdata.ID,
      "Title": parkingdata.Title,
      "Plaats": parkingdata.Plaats,
      "Type": parkingdata.Type,
      "isNs": isNS ? "NS" : "",
      "txt_ma": formatOpeningTimes(parkingdata, "ma", "Maandag", wkday === 1, isNS),
      "txt_di": formatOpeningTimes(parkingdata, "di", "Dinsdag", wkday === 2, isNS),
      "txt_wo": formatOpeningTimes(parkingdata, "wo", "Woensdag", wkday === 3, isNS),
      "txt_do": formatOpeningTimes(parkingdata, "do", "Donderdag", wkday === 4, isNS),
      "txt_vr": formatOpeningTimes(parkingdata, "vr", "Vrijdag", wkday === 5, isNS),
      "txt_za": formatOpeningTimes(parkingdata, "za", "Zaterdag", wkday === 6, isNS),
      "txt_zo": formatOpeningTimes(parkingdata, "zo", "Zondag", wkday === 0, isNS),
      "txt_today": formatOpeningToday(parkingdata, timestamp).message,
      "Open_ma": formatUtcTime(parkingdata.Open_ma),
      "Dicht_ma": formatUtcTime(parkingdata.Dicht_ma),
      "Open_di": formatUtcTime(parkingdata.Open_di),
      "Dicht_di": formatUtcTime(parkingdata.Dicht_di),
      "Open_wo": formatUtcTime(parkingdata.Open_wo),
      "Dicht_wo": formatUtcTime(parkingdata.Dicht_wo),
      "Open_do": formatUtcTime(parkingdata.Open_do),
      "Dicht_do": formatUtcTime(parkingdata.Dicht_do),
      "Open_vr": formatUtcTime(parkingdata.Open_vr),
      "Dicht_vr": formatUtcTime(parkingdata.Dicht_vr),
      "Open_za": formatUtcTime(parkingdata.Open_za),
      "Dicht_za": formatUtcTime(parkingdata.Dicht_za),
      "Open_zo": formatUtcTime(parkingdata.Open_zo),
      "Dicht_zo": formatUtcTime(parkingdata.Dicht_zo),
      "Openingstijden": parkingdata.Openingstijden,
      "EditorCreated": parkingdata.EditorCreated,
    });
  });

  return report;
} 