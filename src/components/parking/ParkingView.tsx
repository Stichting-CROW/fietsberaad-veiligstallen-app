import React, { useEffect, useState } from "react";

import { openRoute } from "~/utils/map/index";

// Import components
import PageTitle from "~/components/PageTitle";
import ImageSlider from "~/components/ImageSlider";
import HorizontalDivider from "~/components/HorizontalDivider";
import { Button } from "~/components/Button";
import ParkingOnTheMap from "~/components/ParkingOnTheMap";
import SectionBlock from "~/components/SectionBlock";
import ParkingViewOpening from "~/components/parking/ParkingViewOpening";
import ParkingViewTarief from "~/components/parking/ParkingViewTarief";
import ParkingViewCapaciteit from "~/components/parking/ParkingViewCapaciteit";
import ParkingViewAbonnementen from "~/components/parking/ParkingViewAbonnementen";
import { getHelpdeskElement } from "~/components/parking/ParkingEditBeheerder";
import ParkingViewServices from "~/components/parking/ParkingViewServices";

import { type ParkingDetailsType } from "~/types/parking";
import { getBeheerderContactNew, formatBeheerderContactLink } from "~/utils/parkings-beheerder";

import { getMunicipalities } from "~/utils/municipality";
import { useDispatch, useSelector } from "react-redux";
import { setMunicipalities } from "~/store/geoSlice";
import type { AppState } from "~/store/store";
import ReportComponent from "../beheer/reports";
import { type ReportBikepark } from "../beheer/reports/ReportsFilter";
import { useTariefcodes } from "~/hooks/useTariefcodes";

const ParkingView = ({
  parkingdata,
  onEdit = undefined,
  onToggleStatus = undefined,
  isLoggedIn,
}: {
  parkingdata: ParkingDetailsType;
  onEdit: Function | undefined;
  onToggleStatus: Function | undefined;
  isLoggedIn: boolean;
}) => {
  const [urlOpwaarderen, setUrlOpwaarderen] = useState<string>("");

  const dispatch = useDispatch();

  const municipalities = useSelector(
    (state: AppState) => state.geo.municipalities
  );

  useEffect(() => {
    // Don't ask the API if we have all municipalities already
    if (municipalities && municipalities.length > 0) {
      return;
    }
    (async () => {
      const response = await getMunicipalities();
      dispatch(setMunicipalities(response));
    })();
  }, []);

  useEffect(() => {
    // All types:
    // 'bewaakt',
    // 'geautomatiseerd',
    // 'toezicht',
    // 'onbewaakt',
    // 'buurtstalling',
    // 'fietstrommel',
    // 'fietskluizen'

    if (parkingdata.Type !== "fietskluizen") {
      setUrlOpwaarderen("");
      return;
    }

    // Fetch the opwaardeer link from the new API
    fetch(`/api/protected/opwaardeerlink/municipality/${parkingdata.SiteID}`)
      .then(res => res.json())
      .then(data => {
        setUrlOpwaarderen(data.url || "");
      })
      .catch(() => setUrlOpwaarderen(""));
  }, [parkingdata]);

  const renderAddress = () => {
    const location = parkingdata.Location || "";
    const pcplaats = (
      (parkingdata.Postcode || "") +
      " " +
      (parkingdata.Plaats || "")
    ).trim();

    if (location === "" && pcplaats === "") {
      return null;
    }

    return (
      <>
        <section className="Type">
          <div className="w-full">
            {location}
            {location !== "" ? <br /> : null}
            {pcplaats}
            {pcplaats !== "" ? <br /> : null}
          </div>
          {/* <p>
            <b>0.3km</b
          </p> */}
        </section>
        <HorizontalDivider className="my-4" />
      </>
    );
  };

  const showOpening = [
    "bewaakt",
    "onbewaakt",
    "toezicht",
    "geautomatiseerd",
  ].includes(parkingdata.Type || "");
  const showTarief = false;
  
  // Add showTariefCompact flag for tariefcodes 1-5
  const parkingTariefCode = parkingdata?.Tariefcode || 0;
  const showTariefCompact = (parkingTariefCode >= 1 && parkingTariefCode <= 5) || (parkingdata.OmschrijvingTarieven && parkingdata.OmschrijvingTarieven.trim() !== "");

  let status = "";
  switch (parkingdata.Status) {
    case "0": status = "Verborgen";
      break;
    case "1": status = "Zichtbaar";
      break;
    case "x": status = "Systeemstalling";
      break;
    case "new":
      status = "Nieuwe stalling";
      break;
    case "aanm":
      status = "Aanmelding";
      break
    default:
      
  }

  const buttonOpwaarderen = <Button
    key="b-opwaarderen"
    className="mt-3 text-center flex-shrink"
    onClick={() => {
      if (urlOpwaarderen === "") {
        return;
      }
      window.open(urlOpwaarderen, '_blank');
    }}
  >
    Stallingstegoed<br ></br>opwaarderen
  </Button>
  
  return (
    <>
      <div
        className="
      "
      >
        <div
          className="
            sm:mr-8 flex
            justify-between
          "
        >
          <PageTitle className="flex w-full sm:justify-start">
            <div className="mr-4 font-bold sm:font-normal">{parkingdata?.Title}</div>
            {onEdit !== undefined ? (
              <Button
                key="b-1"
                className="mt-3 sm:mt-0 hidden sm:block"
                onClick={(e: any) => {
                  if (e) e.preventDefault();
                  onEdit();
                }}
              >
                Bewerken
              </Button>
            ) : null}
            {isLoggedIn && onToggleStatus !== undefined && ["0", "1"].includes(parkingdata.Status || "") ? (
              <Button
                key="b-2"
                className="mt-3 ml-3 sm:mt-0 hidden sm:block"
                variant="secundary"
                onClick={(e: any) => {
                  if (e) e.preventDefault();
                  onToggleStatus();
                }}
              >
                {parkingdata.Status === "0" ? "Zichtbaar maken" : "Verbergen"}
              </Button>
            ) : null}
          </PageTitle>
        </div>
        {parkingdata?.Description && <p className="mb-8">
          {parkingdata?.Description}
        </p>}


        <div className="flex justify-between">
          <div data-name="content-left" className="sm:mr-12">
            {parkingdata.Image && (
              <div className="mb-8">
                <ImageSlider images={[parkingdata.Image]} />
              </div>
            )}

            {renderAddress()}

            {showOpening ? (
              <ParkingViewOpening parkingdata={parkingdata} />
            ) : null}

            {showTarief ? <ParkingViewTarief parkingdata={parkingdata} /> : null}

            <ParkingViewServices parkingdata={parkingdata} />

            <ParkingViewCapaciteit parkingdata={parkingdata} />

            {/* Add Tarief section for tariefcodes 1-5 above Abonnementen */}
            {showTariefCompact ? <ParkingViewTariefAboveAbonnementen parkingdata={parkingdata} /> : null}

            <ParkingViewAbonnementen parkingdata={parkingdata} />

            <SectionBlock heading="Soort stalling">
              <div className="flex flex-col">
                {parkingdata.Type || "Onbekend"}
                {urlOpwaarderen !== "" ? buttonOpwaarderen : null}
              </div>
            </SectionBlock>

            {(() => {
              const beheerderInfo = getBeheerderContactNew(
                parkingdata.ExploitantID,
                parkingdata.Beheerder,
                parkingdata.BeheerderContact,
                parkingdata.HelpdeskHandmatigIngesteld,
                parkingdata.contacts_fietsenstallingen_ExploitantIDTocontacts?.CompanyName,
                parkingdata.contacts_fietsenstallingen_ExploitantIDTocontacts?.Helpdesk,
                parkingdata.contacts_fietsenstallingen_SiteIDTocontacts?.CompanyName,
                parkingdata.contacts_fietsenstallingen_SiteIDTocontacts?.Helpdesk
              );
              if (!beheerderInfo.visible) {
                return null;
              }
              
              const contactLink = formatBeheerderContactLink(beheerderInfo.beheerdercontact);
              const displayName = beheerderInfo.beheerder || contactLink.displayText || "";
              
              return (
                <>
                  <HorizontalDivider className="my-4" />
                  <SectionBlock heading="Beheerder">
                    {contactLink.href ? (
                      <a 
                        href={contactLink.href}
                        style={{
                          textDecoration: 'underline',
                          color: '#2563eb',
                          cursor: 'pointer'
                        }}
                        className="hover:text-blue-700 hover:underline"
                        title={contactLink.href}
                      >
                        {displayName}
                      </a>
                    ) : displayName ? (
                      <span>{displayName}</span>
                    ) : null}
                  </SectionBlock>
                </>
              );
            })()}

            {/* <ParkingViewBeheerder parkingdata={parkingdata} /> */}

            {isLoggedIn && status !== '' ?
              <>
                <HorizontalDivider className="my-4" />

                <SectionBlock heading="Status">
                  {status}
                </SectionBlock>
              </> : null}

            <p className="mb-10">{/*Some spacing*/}</p>

            {/*<button>Breng mij hier naartoe</button>*/}
          </div>

          <div data-name="content-right" className="ml-12 hidden lg:block">
            <div className="relative">

              <ParkingOnTheMap parking={parkingdata} />

              <Button
                className="
                  fixed bottom-3
                  right-3 z-10
                  flex
                  py-3
                  sm:absolute
                  sm:bottom-1
                "
                onClick={(e: any) => {
                  if (e) e.preventDefault();
                  openRoute(parkingdata.Coordinaten);
                }}
                htmlBefore=<img
                  src="/images/icon-route-white.png"
                  alt="Route"
                  className="mr-3 w-5"
                />
              >
                Breng mij hier naartoe
              </Button>

            </div>
          </div>

        </div>

      </div>

    { isLoggedIn && <Reports bikeparks={[
          {
            GemeenteID: parkingdata.SiteID || "",
            Title: parkingdata.Title || "---",
            ID: parkingdata.StallingsID || "",
            StallingsID: parkingdata.StallingsID || "---",
            Type: parkingdata.Type || "",
            Location: parkingdata.Location || "",
            Plaats: parkingdata.Plaats || "",
            Postcode: parkingdata.Postcode || "",
            Coordinaten: parkingdata.Coordinaten || "",
            Image: parkingdata.Image || "",
            Description: parkingdata.Description || "",
            ExploitantID: parkingdata.ExploitantID || "",
            Capacity: parkingdata.Capacity || 0,
            Status: parkingdata.Status || "",
            SiteID: parkingdata.SiteID || "",
          }
        ]}  /> }
    </>
  );
};

const Reports = ({ bikeparks }: { bikeparks: ReportBikepark[] }) => {
  const [hasReportData, setHasReportData] = useState<boolean>(false);

  const showAbonnementenRapporten = true;
  const firstDate = new Date("2018-03-01");
  const lastDate = new Date(); lastDate.setHours(0, 0, 0, 0); // set time to midnight

  return (
     <div data-name="content-bottom" className={`mt-0 ${hasReportData ? 'block' : 'hidden'} h-[350px]`}>
        <h2 className="
          text-2xl
          font-poppinssemi
          font-normal
          mb-0
        "
        >
          Statistieken
        </h2>      
        <div data-name="content-bottom-reports" className="h-full">
        <ReportComponent
          showAbonnementenRapporten={showAbonnementenRapporten}
          firstDate={firstDate}
          lastDate={lastDate}
          bikeparks={bikeparks || []}
          onDataLoaded={(hasReportData: boolean) => {
            setHasReportData(hasReportData);
          }}
      />
     </div>
     </div>
  )
}

export default ParkingView;

const ParkingViewTariefAboveAbonnementen = ({ parkingdata }: { parkingdata: ParkingDetailsType }) => {
  const { getTariefcodeText, isLoading } = useTariefcodes();

  // if (parkingdata.Tariefcode === null || parkingdata.Tariefcode === undefined) {
  //   return null;
  // }

  if (isLoading) {
    return null;
  }

  const tariefcodeText = getTariefcodeText(parkingdata.Tariefcode);
  const hasOmschrijvingTarieven = parkingdata.OmschrijvingTarieven && parkingdata.OmschrijvingTarieven.trim() !== "";



  if (!tariefcodeText && !hasOmschrijvingTarieven) {
    return null;
  }
  return (
    <>
      <SectionBlock heading="Tarief">
        {tariefcodeText}
        {hasOmschrijvingTarieven && (
          <div className="mt-2">
            <div dangerouslySetInnerHTML={{ __html: parkingdata.OmschrijvingTarieven || "" }} />
          </div>
        )}
      </SectionBlock>
      <HorizontalDivider className="my-4" />
    </>
  );
};
