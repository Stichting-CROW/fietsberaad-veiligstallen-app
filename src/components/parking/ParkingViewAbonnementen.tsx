import React, { Fragment, useEffect, useState } from "react";
import { useSelector } from "react-redux";

import HorizontalDivider from "~/components/HorizontalDivider";
import { Button } from "~/components/Button";
import SectionBlock from "~/components/SectionBlock";
import { type ParkingDetailsType } from "~/types/parking";
import { getMunicipalityBasedOnLatLng } from "~/utils/map/active_municipality";

const ParkingViewAbonnementen = ({ parkingdata }: { parkingdata: ParkingDetailsType }) => {
  return null; // disabled for now 

  // const [abonnementUrl, setAbonnementUrl] = useState<string>("");

  // useEffect(() => {
  //   updateAbonnementUrl(parkingdata);
  // }, [
  //   parkingdata,
  // ]);

  // // if(!parkingdata.abonnementsvorm_fietsenstalling || parkingdata.abonnementsvorm_fietsenstalling.length === 0) {
  // //   return null;
  // // }

  // // parkingdata.abonnementsvorm_fietsenstalling.map(x => console.log('abonnement', x));
  // // console.log("abonnementsvormen", JSON.stringify(parkingdata.abonnementsvorm_fietsenstalling, null, 2));

  // const updateAbonnementUrl = async (parkingdata: ParkingDetailsType): Promise<void> => {
  //   {/* 
  //     example of original url for redirect to fietskluizen abbo referral: 
  //     https://veiligstallen.nl/molenlanden/fietskluizen/4201_002#4201_002

  //     <cfsilent>
  //       <cfset variables.path_info = Replace(cgi.path_info, "/index.cfm", "")>
  //       <cfif ListLen(variables.path_info, '/') gte 1>
  //         <cfset url.gemeente = ListGetAt(variables.path_info, 1, '/')>
  //       </cfif>

  //       <cfif ListLen(variables.path_info, '/') gte 2>
  //         <cfset url.page = ListGetAt(variables.path_info, 2, '/')>
  //       </cfif>

  //       <cfif ListLen(variables.path_info, '/') gte 3>
  //         <cfset url.stallingsID = ListGetAt(variables.path_info, 3, '/')>
  //       </cfif>
  //     </cfsilent>      

  //     base/<gemeente>/<page>/<stallingsID>#<stallingsID>

  //     <cfif qStalling.type eq "fietskluizen">
  //       <cfset urlStalling = 'http://#cgi.http_host#/#qStalling.UrlName#/fietskluizen/#qStalling.StallingsID#'>
  //     <cfelseif qStalling.type eq "fietstrommel">
  //       <cfset urlStalling = 'http://#cgi.http_host#/#qStalling.UrlName#/fietstrommels/#qStalling.StallingsID#'>
  //     <cfelseif qStalling.type eq "buurtstalling">
  //       <cfset urlStalling = 'http://#cgi.http_host#/#qStalling.UrlName#/buurtstallingen/#qStalling.StallingsID#'>
  //     <cfelse>
  //       <cfset urlStalling = 'http://#cgi.http_host#/#qStalling.UrlName#/stallingen/#qStalling.StallingsID####qStalling.StallingsID#'>
  //     </cfif>      

  //     <cftry>
  //       <cfif StructKeyExists(url, "gemeente")>
  //         <cftry>
  //           <cfset session.council = application.service.getCouncilByUrlName(url.gemeente)>
  //           <cfcatch>
  //             <cfset session.council = application.service.getCouncilByCompanyName(url.gemeente)>
  //           </cfcatch>
  //         </cftry>
  //       <cfelseif structkeyExists(url, "siteID")>
  //         <cfset session.council = application.service.getCouncil(url.siteID)>
  //       <cfelseif structkeyExists(cookie, "gemeenteID")>
  //         <cfset session.council = application.service.getCouncil(cookie.gemeenteID)>
  //       <cfelse>
  //         <cfset session.council = application.service.getCouncil(1)>
  //       </cfif>
  //       <cfcatch>
  //         <cfset session.council = application.service.getCouncil(1)>
  //       </cfcatch>
  //     </cftry>
  //     <cfset request.siteID = session.council.getID() />
  //     <cfset cookie.gemeenteID = request.siteID />
  //     <cfset request.siteID = session.council.getID() />   
      
  //     council = contacts table
  // */}

  //   let url = "";
  //   const stallingMunicipalty = await getMunicipalityBasedOnLatLng(parkingdata.Coordinaten!==null ? parkingdata.Coordinaten.split(",") : null);
  //   if (stallingMunicipalty) {
  //     switch (parkingdata.Type) {
  //       case "fietskluizen":
  //         url = `https://veiligstallen.nl/${stallingMunicipalty.name}/fietskluizen/${parkingdata.StallingsID}`;
  //         break;
  //       case "fietstrommel":
  //         url = `https://veiligstallen.nl/${stallingMunicipalty.name}/fietstrommels/${parkingdata.StallingsID}`;
  //         break;
  //       case "buurtstalling":
  //         url = `https://veiligstallen.nl/${stallingMunicipalty.name}/buurtstallingen/${parkingdata.StallingsID}`;
  //         break;
  //       default:
  //         url = `https://veiligstallen.nl/${stallingMunicipalty.name}/stallingen/${parkingdata.StallingsID}#${parkingdata.StallingsID}`;
  //         break;
  //     }
  //   }
  //   setAbonnementUrl(url);
  // }

  // return (
  //   <>
  //     <SectionBlock heading="Abonnementen">
  //       <div className="ml-2 grid grid-cols-3">
  //         {(parkingdata.abonnementsvorm_fietsenstalling) ? parkingdata.abonnementsvorm_fietsenstalling.map((x) => {
  //           // console.log('abonnement', JSON.stringify(x, null, 2));
  //           return <Fragment key={x.abonnementsvormen.naam}>
  //             <div className="col-span-2">{x.abonnementsvormen.naam}</div>
  //             <div className="text-right sm:text-center">&euro;{x.abonnementsvormen.prijs?.toLocaleString('nl-NL') || "---"}</div>
  //           </Fragment>
  //         }) : <></>}
  //         {((abonnementUrl && parkingdata.abonnementsvorm_fietsenstalling && parkingdata.abonnementsvorm_fietsenstalling.length > 0)) ?
  //           <div className="text-right sm:text-center">
  //             <Button className="mt-4" onClick={() => {
  //               window.open(abonnementUrl, '_blank');
  //             }}>
  //               Koop abonnement
  //             </Button>
  //           </div >
  //           :
  //           <div className="text-start col-span-3 mt-4">
  //             Geen abonnementen beschikbaar
  //           </div>}
  //       </div>
  //     </SectionBlock >

  //     <HorizontalDivider className="my-4" />
  //   </>
  // );
};

export default ParkingViewAbonnementen;
