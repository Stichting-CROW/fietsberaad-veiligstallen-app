import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";

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
import { convertCoordinatenToCoords } from "~/utils/map/index";
import { formatTimeHHmm } from "~/utils/opening-hours";
import { useSubscriptionTypesForParking } from "~/hooks/useSubscriptionTypesForParking";
import { useAbonnementLink } from "~/hooks/useAbonnementLink";
import { getBaseUrl } from "~/utils/seo";

const DAY_MAP: Array<{ schemaDay: string; openKey: keyof ParkingDetailsType; closeKey: keyof ParkingDetailsType }> = [
  { schemaDay: "Monday", openKey: "Open_ma", closeKey: "Dicht_ma" },
  { schemaDay: "Tuesday", openKey: "Open_di", closeKey: "Dicht_di" },
  { schemaDay: "Wednesday", openKey: "Open_wo", closeKey: "Dicht_wo" },
  { schemaDay: "Thursday", openKey: "Open_do", closeKey: "Dicht_do" },
  { schemaDay: "Friday", openKey: "Open_vr", closeKey: "Dicht_vr" },
  { schemaDay: "Saturday", openKey: "Open_za", closeKey: "Dicht_za" },
  { schemaDay: "Sunday", openKey: "Open_zo", closeKey: "Dicht_zo" },
];

const FEATURE_KEYWORDS: Array<{ keyword: string; canonicalName: string; propertyID?: string }> = [
  { keyword: "buggy", canonicalName: "Buggy rental" },
  { keyword: "toilet", canonicalName: "Toilet", propertyID: "https://www.wikidata.org/wiki/Q7853906" },
  { keyword: "kluis", canonicalName: "Lockers", propertyID: "https://www.wikidata.org/wiki/Q1195470" },
  { keyword: "oplaadpunt", canonicalName: "E-bike charging", propertyID: "https://www.wikidata.org/wiki/Q55956304" },
  { keyword: "opladen", canonicalName: "E-bike charging", propertyID: "https://www.wikidata.org/wiki/Q21085035" },
  { keyword: "reparatie", canonicalName: "Bike repair service", propertyID: "https://www.wikidata.org/wiki/Q19367529" },
  { keyword: "fietspomp", canonicalName: "Bike pump", propertyID: "https://www.wikidata.org/wiki/Q637484" },
  { keyword: "verhuur", canonicalName: "Bike rental", propertyID: "https://www.wikidata.org/wiki/Q10611118" },
  { keyword: "zelfscanner", canonicalName: "Zelfscanner", propertyID: "https://www.wikidata.org/wiki/Q137599055" },
  { keyword: "toezicht", canonicalName: "Supervision", propertyID: "https://www.wikidata.org/wiki/Q2247863" },
  { keyword: "bewaakt", canonicalName: "Guarded parking", propertyID: "https://www.wikidata.org/wiki/Q80110" },
];

const toText = (value: unknown): string | undefined => {
  if (value === null || value === undefined) return undefined;
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  return undefined;
};

const stripHtmlToText = (html: string | null | undefined): string | undefined => {
  if (!html) return undefined;
  const text = html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > 0 ? text : undefined;
};

const toAmenityFeature = (serviceName: string) => {
  const normalized = serviceName.trim();
  const lowered = normalized.toLowerCase();
  const matched = FEATURE_KEYWORDS.find((x) => lowered.includes(x.keyword));
  return {
    "@type": "LocationFeatureSpecification",
    name: matched?.canonicalName || normalized,
    value: true,
    description: matched ? normalized : undefined,
    propertyID: matched?.propertyID || undefined,
  };
};

const serializeJsonLdSafely = (value: unknown): string => {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
};

const getMunicipalitySegment = (router: ReturnType<typeof useRouter>): string | undefined => {
  const qMunicipality = router.query.municipality;
  if (typeof qMunicipality === "string" && qMunicipality.trim().length > 0) {
    return qMunicipality.trim();
  }
  const segment = router.asPath.split("?")[0]?.split("/").filter(Boolean)[0];
  return segment || undefined;
};

const buildOpeningHoursSpecification = (parkingdata: ParkingDetailsType) => {
  return DAY_MAP.flatMap(({ schemaDay, openKey, closeKey }) => {
    const opens = parkingdata[openKey] as Date | null;
    const closes = parkingdata[closeKey] as Date | null;
    if (!opens || !closes) return [];
    return [{
      "@type": "OpeningHoursSpecification",
      dayOfWeek: `https://schema.org/${schemaDay}`,
      opens: formatTimeHHmm(opens),
      closes: formatTimeHHmm(closes),
    }];
  });
};

const buildSpecialOpeningHoursSpecification = (parkingdata: ParkingDetailsType) => {
  if (!parkingdata.uitzonderingenopeningstijden || parkingdata.uitzonderingenopeningstijden.length === 0) {
    return [];
  }
  const now = new Date();
  const lookback = new Date(now);
  lookback.setDate(lookback.getDate() - 30);
  const lookahead = new Date(now);
  lookahead.setDate(lookahead.getDate() + 365);

  return parkingdata.uitzonderingenopeningstijden
    .filter((x) => x.openingDateTime || x.closingDateTime)
    .filter((x) => {
      const opening = x.openingDateTime ? new Date(x.openingDateTime) : null;
      const closing = x.closingDateTime ? new Date(x.closingDateTime) : null;
      const anchor = closing || opening;
      if (!anchor) return false;
      return anchor >= lookback && anchor <= lookahead;
    })
    .sort((a, b) => {
      const aTime = (a.openingDateTime || a.closingDateTime) ? new Date(a.openingDateTime || a.closingDateTime as Date).getTime() : 0;
      const bTime = (b.openingDateTime || b.closingDateTime) ? new Date(b.openingDateTime || b.closingDateTime as Date).getTime() : 0;
      return aTime - bTime;
    })
    .slice(0, 80)
    .map((x) => ({
      "@type": "OpeningHoursSpecification",
      validFrom: x.openingDateTime ? new Date(x.openingDateTime).toISOString() : undefined,
      validThrough: x.closingDateTime ? new Date(x.closingDateTime).toISOString() : undefined,
    }));
};

const parseContactValue = (raw: string | undefined) => {
  const value = (raw || "").trim();
  if (!value) return null;
  if (value.includes("@")) {
    return { email: value };
  }
  if (value.startsWith("http://") || value.startsWith("https://") || value.startsWith("www.")) {
    const normalizedUrl = value.startsWith("www.") ? `https://${value}` : value;
    return { url: normalizedUrl };
  }
  return { telephone: value };
};

const buildStructuredData = (
  parkingdata: ParkingDetailsType,
  tariefOmschrijving: string,
  abonnementen: Array<{ naam: string | null; prijs: number | null; omschrijving: string | null }>,
  abonnementUrl: string | undefined,
  canonicalParkingUrl: string
) => {
  const coords = convertCoordinatenToCoords(parkingdata.Coordinaten);
  const siteName = parkingdata.contacts_fietsenstallingen_SiteIDTocontacts?.CompanyName;
  const siteHelpdesk = parkingdata.contacts_fietsenstallingen_SiteIDTocontacts?.Helpdesk || undefined;
  const siteHelpdeskContact = parseContactValue(siteHelpdesk);
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
  const beheerderContact = formatBeheerderContactLink(beheerderInfo.beheerdercontact || "");
  const beheerderEmail = beheerderContact.href.startsWith("mailto:")
    ? beheerderContact.href.replace("mailto:", "").trim()
    : undefined;
  const serviceNames = [
    ...parkingdata.fietsenstallingen_services.map((x) => x.services?.Name).filter(Boolean) as string[],
    ...((parkingdata.ExtraServices || "")
      .split(",")
      .map((x) => x.trim())
      .filter((x) => x.length > 0)),
  ];
  const uniqueServiceNames = Array.from(new Set(serviceNames));
  const amenityFeatures = uniqueServiceNames.map(toAmenityFeature);
  const tariefDescription = [tariefOmschrijving, stripHtmlToText(parkingdata.OmschrijvingTarieven)]
    .filter(Boolean)
    .join(" ");
  const abonnementOffers = abonnementen.map((abonnement) => ({
    "@type": "Offer",
    name: abonnement.naam || "Abonnement",
    description: stripHtmlToText(abonnement.omschrijving) || undefined,
    price: abonnement.prijs ?? undefined,
    priceCurrency: abonnement.prijs !== null ? "EUR" : undefined,
    category: "subscription",
    url: abonnementUrl,
  }));

  const knownFields = new Set([
    "ID", "StallingsID", "SiteID", "Title", "StallingsIDExtern", "Description", "Image", "Location",
    "Postcode", "Plaats", "Capacity", "Status", "Type", "Open_ma", "Dicht_ma", "Open_di", "Dicht_di",
    "Open_wo", "Dicht_wo", "Open_do", "Dicht_do", "Open_vr", "Dicht_vr", "Open_za", "Dicht_za",
    "Open_zo", "Dicht_zo", "Openingstijden", "Coordinaten", "Beheerder", "BeheerderContact",
    "OmschrijvingTarieven", "Tariefcode", "Url", "ExtraServices", "fietsenstalling_secties",
    "uitzonderingenopeningstijden", "abonnementsvorm_fietsenstalling", "contacts_fietsenstallingen_SiteIDTocontacts",
    "contacts_fietsenstallingen_ExploitantIDTocontacts", "fietsenstallingen_services", "EditorCreated", "EditorModified",
    "ExploitantID",
  ]);

  const additionalProperty = Object.entries(parkingdata)
    .filter(([key]) => !knownFields.has(key))
    .map(([key, value]) => {
      const text = toText(value);
      if (!text) return null;
      return {
        "@type": "PropertyValue",
        name: key,
        value: text,
      };
    })
    .filter(Boolean);

  const structuredData = {
    "@context": "https://schema.org",
    "@type": "ParkingFacility",
    additionalType: "https://www.wikidata.org/wiki/Q16243822", // bicycle parking
    "@id": canonicalParkingUrl,
    identifier: parkingdata.ID,
    name: parkingdata.Title || undefined,
    description: parkingdata.Description || undefined,
    image: parkingdata.Image || undefined,
    url: canonicalParkingUrl,
    address: {
      "@type": "PostalAddress",
      streetAddress: parkingdata.Location || undefined,
      postalCode: parkingdata.Postcode || undefined,
      addressLocality: parkingdata.Plaats || undefined,
      addressCountry: "NL",
    },
    geo: coords ? {
      "@type": "GeoCoordinates",
      latitude: coords[1],
      longitude: coords[0],
    } : undefined,
    openingHoursSpecification: buildOpeningHoursSpecification(parkingdata),
    specialOpeningHoursSpecification: buildSpecialOpeningHoursSpecification(parkingdata),
    amenityFeature: amenityFeatures,
    maximumAttendeeCapacity: parkingdata.Capacity || undefined,
    provider: siteName ? {
      "@type": "Organization",
      name: siteName,
      ...(siteHelpdeskContact || {}),
    } : undefined,
    operator: parkingdata.contacts_fietsenstallingen_ExploitantIDTocontacts?.CompanyName
      ? {
          "@type": "Organization",
          name: parkingdata.contacts_fietsenstallingen_ExploitantIDTocontacts.CompanyName,
        }
      : undefined,
    openingHours: stripHtmlToText(parkingdata.Openingstijden),
    contactPoint: beheerderEmail
      ? [{
          "@type": "ContactPoint",
          contactType: "manager",
          email: beheerderEmail,
        }]
      : undefined,
    potentialAction: coords
      ? {
          "@type": "MapAction",
          target: `https://www.google.com/maps/dir/?api=1&travelmode=bicycling&destination=${coords[1]},${coords[0]}&z=17&dirflg=b`,
          name: "Breng mij hier naartoe",
        }
      : undefined,
    hasOfferCatalog: {
      "@type": "OfferCatalog",
      name: "Fietsenstalling aanbod",
      itemListElement: [
        tariefDescription
          ? {
              "@type": "OfferCatalog",
              name: "Tarieven",
              itemListElement: [
                {
                  "@type": "Offer",
                  name: "Tarief",
                  description: tariefDescription,
                  category: "parking",
                },
              ],
            }
          : null,
        abonnementOffers.length > 0
          ? {
              "@type": "OfferCatalog",
              name: "Abonnementen",
              itemListElement: abonnementOffers,
            }
          : null,
      ].filter(Boolean),
    },
    additionalProperty,
  };

  return serializeJsonLdSafely(structuredData);
};

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
  const router = useRouter();
  const [urlOpwaarderen, setUrlOpwaarderen] = useState<string>("");
  const [structuredDataJson, setStructuredDataJson] = useState<string>("");
  const { getTariefcodeText } = useTariefcodes();
  const { subscriptionTypes } = useSubscriptionTypesForParking(parkingdata?.ID || "");
  const { abonnementLink } = useAbonnementLink(parkingdata?.ID || "");

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

  useEffect(() => {
    const tariefOmschrijving = getTariefcodeText(parkingdata.Tariefcode);
    const filteredSubscriptionTypes = subscriptionTypes.filter(
      (x) => x.bikeparkTypeID === (parkingdata?.Type || "")
    );
    const configuredBaseUrl = getBaseUrl().replace(/\/$/, "");
    const runtimeBaseUrl = typeof window !== "undefined" ? window.location.origin.replace(/\/$/, "") : "";
    const baseUrl = configuredBaseUrl || runtimeBaseUrl || "https://beta.veiligstallen.nl";
    const municipality = getMunicipalitySegment(router);
    const canonicalParkingUrl = municipality
      ? `${baseUrl}/${municipality}?stallingid=${encodeURIComponent(parkingdata.ID)}`
      : `${baseUrl}/?stallingid=${encodeURIComponent(parkingdata.ID)}`;
    setStructuredDataJson(
      buildStructuredData(
        parkingdata,
        tariefOmschrijving,
        filteredSubscriptionTypes,
        abonnementLink?.status ? abonnementLink.url : undefined,
        canonicalParkingUrl
      )
    );
  }, [parkingdata, getTariefcodeText, subscriptionTypes, abonnementLink, router]);

  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    const schemaDebug = router.query.schemaDebug;
    const debugEnabled = schemaDebug === "1" || schemaDebug === "true";
    if (!debugEnabled || !structuredDataJson) return;
    try {
      const parsed = JSON.parse(structuredDataJson);
      console.info("[schema.org][ParkingView]", {
        parkingId: parkingdata.ID,
        title: parkingdata.Title,
        jsonLd: parsed,
      });
    } catch (error) {
      console.warn("[schema.org][ParkingView] Failed to parse JSON-LD", error);
    }
  }, [router.query.schemaDebug, structuredDataJson, parkingdata.ID, parkingdata.Title]);

  const schemaDebug = router.query.schemaDebug;
  const schemaDebugEnabled = process.env.NODE_ENV === "development" && (schemaDebug === "1" || schemaDebug === "true");
  const prettyStructuredDataJson = useMemo(() => {
    if (!structuredDataJson) return "";
    try {
      return JSON.stringify(JSON.parse(structuredDataJson), null, 2);
    } catch {
      return structuredDataJson;
    }
  }, [structuredDataJson]);

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
      {structuredDataJson && (
        <script type="application/ld+json">{structuredDataJson}</script>
      )}
      {schemaDebugEnabled && structuredDataJson && (
        <details className="mb-4 rounded border border-gray-300 bg-gray-50 p-3 text-xs">
          <summary className="cursor-pointer font-semibold">Schema.org JSON-LD debug</summary>
          <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap break-all">
            {prettyStructuredDataJson}
          </pre>
        </details>
      )}
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
