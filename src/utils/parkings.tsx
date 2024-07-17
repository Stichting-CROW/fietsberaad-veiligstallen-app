import React from "react";
import { Session } from "next-auth";
import { reverseGeocode } from "~/utils/nomatim";
import { getMunicipalityBasedOnLatLng } from "~/utils/map/active_municipality";

import type { fietsenstallingen, contacts } from "@prisma/client";
import type { ParkingDetailsType, DayPrefix } from "~/types/";

export const findParkingIndex = (parkings: fietsenstallingen[], parkingId: string) => {
  let index = 0,
    foundIndex;
  parkings.forEach((x) => {
    if (x.ID === parkingId) {
      foundIndex = index;
    }
    index++;
  });
  return foundIndex;
};

export const getParkingDetails = async (stallingId: string): Promise<ParkingDetailsType | null> => {
  try {
    // const response = await fetch(`/api/parking?stallingid=${stallingId}`);
    const response = await fetch(
      "/api/fietsenstallingen?id=" + stallingId,
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      }
    );
    if (response.status !== 200) {
      console.error("getParkingDetails - request failed with status", response.status);
      return null;
    }
    const json = await response.json();
    return json;
  } catch (error: any) {
    console.error("getParkingDetails - error: ", error.message);
    return null;
  }
};

export const getAllServices = async (): Promise<any> => {
  try {
    const response = await fetch(
      `/api/services/`
    );
    const json = await response.json();
    if (!json) return;

    return json;
  } catch (err) {
    console.error("get all services error", err);
  }
};

export const getAllFietstypen = async (): Promise<any> => {
  try {
    const response = await fetch(
      `/api/fietstypen`
    );
    const json = await response.json();
    if (!json) return;

    return json;
  } catch (err) {
    console.error("get all fietstypen error", err);
  }
};

const generateRandomChar = () => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  return chars[Math.floor(Math.random() * chars.length)];
}

export const generateRandomId = (prefix = '') => {
  while (prefix.length < 8) {
    prefix += generateRandomChar();
  }

  if (prefix.length > 8) {
    prefix = prefix.substring(0, 8);
  }

  let id = `${prefix}-`;

  // Generate the 'AAAA-AAAA-AAAAAAAAAAAAAAAA' portion
  for (let i = 0; i < 23; i++) {
    if (i === 4 || i === 9) id += '-';
    id += generateRandomChar();
  }

  return id;
}


export const getDefaultLocation = (): string => {
  return '52.09066,5.121317'
}

const determineNewStatus = (session: Session | null): "1" | "aanm" => {
  if (session === null || !session.user || !session.user.OrgUserID) {
    return "aanm";
  } else {
    return "1";
  }
}

export const createNewStalling = async (session: Session | null, currentLatLong: string[]): Promise<string | undefined> => {
  const data = await getNewStallingDefaultRecord(determineNewStatus(session), currentLatLong)
  const result = await fetch(
    "/api/fietsenstallingen",
    {
      method: "POST",
      body: JSON.stringify(data),
      headers: {
        "Content-Type": "application/json",
      },
    });

  if (result.status === 201) {
    const newstalling = await result.json();
    return newstalling.ID;
  } else {
    console.error("unable to create new stalling - code ", result.status);
    return undefined;
  }
};


export const getNewStallingDefaultRecord = async (Status: string, latlong?: string[] | undefined): Promise<Partial<fietsenstallingen>> => {
  let Location = "";
  let Postcode = "";
  let Plaats = "";
  let Title = "Nieuwe Stalling"

  if (undefined !== latlong) {
    let address = await reverseGeocode(latlong.toString());
    if (address && address.address) {
      Location = ((address.address.road || "---") + " " + (address.address.house_number || "")).trim();
      Postcode = address.address.postcode || "";
      Plaats = address.address.city || address.address.town || address.address.village || address.address.quarter || "";
      Title = "Nieuwe stalling " + (Location + " " + Plaats).trim();
    }
  }


  const data: Partial<fietsenstallingen> = {
    ID: generateRandomId(''),
    Status,
    Title,
    Location,
    Postcode,
    Plaats,
    Type: "bewaakt",
    Image: null,
    Open_ma: new Date(0),
    Dicht_ma: new Date(0),
    Open_di: new Date(0),
    Dicht_di: new Date(0),
    Open_wo: new Date(0),
    Dicht_wo: new Date(0),
    Open_do: new Date(0),
    Dicht_do: new Date(0),
    Open_vr: new Date(0),
    Dicht_vr: new Date(0),
    Open_za: new Date(0),
    Dicht_za: new Date(0),
    Open_zo: new Date(0),
    Dicht_zo: new Date(0),
    Openingstijden: "",
    Capacity: 0,
    Coordinaten: latlong ? latlong.join(',') : getDefaultLocation(),
    FMS: false,
    Beheerder: "",
    BeheerderContact: "",
    SiteID: "",
    DateCreated: new Date(),
    DateModified: new Date(),
    ExploitantID: "",
  }

  return data
}

export const createVeiligstallenOrgLink = async (parkingdata: ParkingDetailsType): Promise<string> => {
  let url = '';
  if (parkingdata.EditorCreated === "NS-connector") {
    url = `https://www.veiligstallen.nl/ns/stallingen/${parkingdata.StallingsID}#${parkingdata.StallingsID}`
  } else {
    if (!parkingdata.Coordinaten || parkingdata.Coordinaten === "") {
      // no municipality available
      return ""
    }
    const stallingMunicipalty = await getMunicipalityBasedOnLatLng(parkingdata.Coordinaten.split(","));
    if (stallingMunicipalty) {
      switch (parkingdata.Type) {
        case "fietskluizen":
          url = `https://veiligstallen.nl/${stallingMunicipalty.name}/fietskluizen/${parkingdata.StallingsID}`;
          break;
        case "fietstrommel":
          url = `https://veiligstallen.nl/${stallingMunicipalty.name}/fietstrommels/${parkingdata.StallingsID}`;
          break;
        case "buurtstalling":
          url = `https://veiligstallen.nl/${stallingMunicipalty.name}/buurtstallingen/${parkingdata.StallingsID}`;
          break;
        default:
          url = `https://veiligstallen.nl/${stallingMunicipalty.name}/stallingen/${parkingdata.StallingsID}#${parkingdata.StallingsID}`;
          break;
      }
    }
  }

  return url;
}

export const createVeiligstallenOrgOpwaardeerLink = (parkingdata: ParkingDetailsType, fietsenstallingen: fietsenstallingen[], contacts: contacts[]): string => {
  const thecontact = contacts.find((contact) => contact.ID === parkingdata.SiteID);
  let municipality = thecontact?.UrlName || ""; // gemeente as used in veiligstallen url

  // check if there are any parkings for this SiteID and BerekentStallingskosten === false -> yes? create URL
  const others = fietsenstallingen.filter((fs) => (parkingdata.SiteID === fs.SiteID) && (fs.BerekentStallingskosten === false));

  const visible = others.length > 0 && municipality !== ""

  return visible ? `https://veiligstallen.nl/${municipality}/stallingstegoed` : '';
}

export const createVeiligstallenOrgOpwaardeerLinkForMunicipality = (municipality: contacts, fietsenstallingen: fietsenstallingen[]): string => {
  if (municipality === undefined) { return '' }

  // check if there are any parkings for this SiteID and BerekentStallingskosten === false -> yes? create URL
  const others = fietsenstallingen.filter((fs) => (municipality.ID === fs.SiteID) && (fs.BerekentStallingskosten === false));
  const visible = others.length > 0

  return visible ? `https://veiligstallen.nl/${municipality.UrlName}/stallingstegoed` : '';
}