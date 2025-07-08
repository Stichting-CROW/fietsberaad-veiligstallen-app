import { type ReportContent } from "./types";
import { type ParkingDetailsType } from "~/types/parking";
import moment from "moment";
import { formatOpeningTimes, formatOpeningToday } from "~/utils/parkings-openclose";
import { createVeiligstallenOrgLink } from "~/utils/parkings";

export const createOpeningTimesReport = async (fietsenstallingen: ParkingDetailsType[], timestamp: moment.Moment, showData: boolean): Promise<ReportContent> => {
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
            const stalling = fietsenstallingen.find((fs) => fs.ID === data.ID) as any as ParkingDetailsType;
            const url = await createVeiligstallenOrgLink(stalling);
            window.open(url, '_blank');
          },
          icon: (<svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M12 4.5C7 4.5 3.75 7.5 2 12C3.75 16.5 7 19.5 12 19.5C17 19.5 20.25 16.5 22 12C20.25 7.5 17 4.5 12 4.5ZM12 17.5C9.5 17.5 7.5 15.5 7.5 13C7.5 10.5 9.5 8.5 12 8.5C14.5 8.5 16.5 10.5 16.5 13C16.5 15.5 14.5 17.5 12 17.5ZM12 11C11.17 11 10.5 11.67 10.5 12.5C10.5 13.33 11.17 14 12 14C12.83 14 13.5 13.33 13.5 12.5C13.5 11.67 12.83 11 12 11Z"
              fill="black"
            />
          </svg>)
        },
        {
          name: "Edit",
          action: async (data) => {
            const stalling = fietsenstallingen.find((fs) => fs.ID === data.ID) as any as ParkingDetailsType;
            const url = `/?stallingid=${stalling.ID}`;
            window.open(url, '_blank');
          },
          icon: (<svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M14.06 2.94a1.5 1.5 0 0 1 2.12 0l1.88 1.88a1.5 1.5 0 0 1 0 2.12L7.5 17.5H4v-3.5L14.06 2.94ZM4 19.5h16v2H4v-2Z"
              fill="black"
            />
          </svg>)
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
