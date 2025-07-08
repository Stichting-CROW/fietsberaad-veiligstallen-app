import { type ReportContent } from "./types";
import { type ParkingDetailsType } from "~/types/parking";
import { createVeiligstallenOrgOpwaardeerLinkForMunicipality, createVeiligstallenOrgLink } from "~/utils/parkings";

export const createStallingstegoedReport = async (fietsenstallingen: ParkingDetailsType[], contacts: {ID: string, UrlName: string}[], showData: boolean): Promise<ReportContent> => {
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
                        if (url === "") {
                            alert("Deze stalling kan niet worden opgewaardeerd");
                            return;
                        }
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

    const getOpwaarderenButton = (key: string, url: string) => {
        if (url === "") {
            return null;
        }

        return (
            <button
                key={'opw-' + key}
                onClick={() => { window.open(url, '_blank') }}
                className="flex items-center justify-center px-2 py-1 border border-gray-300 rounded"
            >
                <svg
                    className="h-8 w-8"
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    strokeWidth="2"
                    stroke="currentColor"
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                >
                    <path stroke="none" d="M0 0h24v24H0z" />
                    <path d="M17.2 7a6 7 0 1 0 0 10" />
                    <path d="M13 10h-8m0 4h8" />
                </svg>
            </button>)
    }

    for (const parkingdata of fietsenstallingen) {
        const isNS = parkingdata.EditorCreated === "NS-connector"

        const municipality = contacts.find((c) => c.ID === parkingdata.SiteID);
        const url = municipality ? createVeiligstallenOrgOpwaardeerLinkForMunicipality(municipality.ID, municipality.UrlName, fietsenstallingen) : "";

        report.data.records.push({
            "ID": parkingdata.ID,
            "Title": parkingdata.Title,
            "Plaats": parkingdata.Plaats,
            "Type": parkingdata.Type,
            "isNs": isNS ? "NS" : "",
            "button_opwaarderen": url!=="" ? getOpwaarderenButton(parkingdata.ID, url) : null,
            "link_url": url,
            "UrlName": municipality ? municipality.UrlName : "",
            "BerekentStallingskosten": parkingdata.BerekentStallingskosten ? "Stalling berekent kosten stallingstransacties" : "FMS berekent kosten stallingstransacties",
        });
    }

    return report;
}
