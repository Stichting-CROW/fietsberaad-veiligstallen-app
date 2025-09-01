import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "~/server/db";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { parkingid } = req.query;
  if (!parkingid || Array.isArray(parkingid)) {
    res.status(400).json({ url: "" });
    return;
  }

  const parking = await prisma.fietsenstallingen.findUnique({
    where: { ID: parkingid },
    select: { SiteID: true, Type: true, StallingsID: true },
  });

  if(!parking || !parking.SiteID || !parking.Type) {
    // bad parking info
    res.status(404).json({ status: false, url: "" });
    return;
  }

  // Get UrlName for the municipality
  const municipality = await prisma.contacts.findUnique({
    where: { ID: parking.SiteID },
    select: { UrlName: true },
  });

  const subscriptionTypes = await prisma.abonnementsvormen.findMany({
    where: {
      bikeparkTypeID: parking.Type,
      siteID: parking.SiteID,
    },
    select: { ID: true },
  });

  if (!municipality || !municipality.UrlName || !subscriptionTypes || subscriptionTypes.length === 0) {
    res.status(200).json({ status: true, url: "" });
  } else {
    let url = "";
    switch (parking.Type) {
      case "fietskluizen":
        url = `https://veiligstallen.nl/${municipality.UrlName}/fietskluizen/${parking.StallingsID}#${parking.StallingsID}`;
        break;
      case "fietstrommel":
        url = `https://veiligstallen.nl/${municipality.UrlName}/fietstrommels/${parking.StallingsID}#${parking.StallingsID}`;
        break;
      case "buurtstalling":
        url = `https://veiligstallen.nl/${municipality.UrlName}/buurtstallingen/${parking.StallingsID}#${parking.StallingsID}`;
        break;
      default:
        url = `https://veiligstallen.nl/${municipality.UrlName}/stallingen/${parking.StallingsID}#${parking.StallingsID}`;
        break;
    }
    res.status(200).json({ status: true, url });
  }
}

/* 
    example of original url for redirect to fietskluizen abbo referral: 
    https://veiligstallen.nl/molenlanden/fietskluizen/4201_002#4201_002

    <cfsilent>
      <cfset variables.path_info = Replace(cgi.path_info, "/index.cfm", "")>
      <cfif ListLen(variables.path_info, '/') gte 1>
        <cfset url.gemeente = ListGetAt(variables.path_info, 1, '/')>
      </cfif>

      <cfif ListLen(variables.path_info, '/') gte 2>
        <cfset url.page = ListGetAt(variables.path_info, 2, '/')>
      </cfif>

      <cfif ListLen(variables.path_info, '/') gte 3>
        <cfset url.stallingsID = ListGetAt(variables.path_info, 3, '/')>
      </cfif>
    </cfsilent>      

    base/<gemeente>/<page>/<stallingsID>#<stallingsID>

    <cfif qStalling.type eq "fietskluizen">
      <cfset urlStalling = 'http://#cgi.http_host#/#qStalling.UrlName#/fietskluizen/#qStalling.StallingsID#'>
    <cfelseif qStalling.type eq "fietstrommel">
      <cfset urlStalling = 'http://#cgi.http_host#/#qStalling.UrlName#/fietstrommels/#qStalling.StallingsID#'>
    <cfelseif qStalling.type eq "buurtstalling">
      <cfset urlStalling = 'http://#cgi.http_host#/#qStalling.UrlName#/buurtstallingen/#qStalling.StallingsID#'>
    <cfelse>
      <cfset urlStalling = 'http://#cgi.http_host#/#qStalling.UrlName#/stallingen/#qStalling.StallingsID####qStalling.StallingsID#'>
    </cfif>      

    <cftry>
      <cfif StructKeyExists(url, "gemeente")>
        <cftry>
          <cfset session.council = application.service.getCouncilByUrlName(url.gemeente)>
          <cfcatch>
            <cfset session.council = application.service.getCouncilByCompanyName(url.gemeente)>
          </cfcatch>
        </cftry>
      <cfelseif structkeyExists(url, "siteID")>
        <cfset session.council = application.service.getCouncil(url.siteID)>
      <cfelseif structkeyExists(cookie, "gemeenteID")>
        <cfset session.council = application.service.getCouncil(cookie.gemeenteID)>
      <cfelse>
        <cfset session.council = application.service.getCouncil(1)>
      </cfif>
      <cfcatch>
        <cfset session.council = application.service.getCouncil(1)>
      </cfcatch>
    </cftry>
    <cfset request.siteID = session.council.getID() />
    <cfset cookie.gemeenteID = request.siteID />
    <cfset request.siteID = session.council.getID() />   
    
    council = contacts table
  */