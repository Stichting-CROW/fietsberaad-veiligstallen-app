import { type Session } from "next-auth";
import { reverseGeocode } from "~/utils/nomatim";
import { getMunicipalityBasedOnLatLng } from "~/utils/map/active_municipality";
import type { fietsenstallingen, contacts } from "~/generated/prisma-client";
import type { ParkingDetailsType } from "~/types/parking";
import type { VSContactGemeente } from "~/types/contacts";

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
    const response = await fetch(
      `/api/fietsenstallingen?id=${stallingId}`,
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
  if (session === null || !session.user || !session.user.securityProfile) { // TODO: check if this is correct, used OrgUserID before
    return "aanm";
  } else {
    return "1";
  }
}

export const createNewStalling = async (
  session: Session | null, 
  currentLatLong: string[], 
  currentMunicipality?: VSContactGemeente
): Promise<string | undefined> => {
  const data = await getNewStallingDefaultRecord(
    determineNewStatus(session), 
    currentLatLong, 
    currentMunicipality
  )
  // post call assigns a new ID to the stalling
  const response_new_parking = await fetch(
    `/api/protected/fietsenstallingen/aanmelden`,
    {
      method: "POST",
      body: JSON.stringify(data),
      headers: {
        "Content-Type": "application/json",
      },
    });

  if (response_new_parking.status === 201) {
    const result = await response_new_parking.json();
    const newParkingId = result.data[0].ID;
    console.log("createNewStalling - newstalling", newParkingId);
    return newParkingId;
  } else {
    console.error("unable to create new stalling - code ", response_new_parking.status);
    return undefined;
  }
};

export const getNewStallingDefaultRecord = async (
  Status: string, 
  latlong?: string[] | undefined, 
  currentMunicipality?: VSContactGemeente
): Promise<Partial<fietsenstallingen>> => {
  let Location = "";
  let Postcode = "";
  let Plaats = "";
  let Title = "Nieuwe Stalling"

  if (undefined !== latlong) {
    const address = await reverseGeocode(latlong.toString());
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
    SiteID: currentMunicipality?.ID || "1",
    DateCreated: new Date(),
    DateModified: new Date(),
    ExploitantID: "1",
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
  const municipality = thecontact?.UrlName || ""; // gemeente as used in veiligstallen url

  // check if there are any parkings for this SiteID and BerekentStallingskosten === false -> yes? create URL
  const others = fietsenstallingen.filter((fs) => (parkingdata.SiteID === fs.SiteID) && (fs.BerekentStallingskosten === false));

  const visible = others.length > 0 && municipality !== ""

  return visible ? `https://veiligstallen.nl/${municipality}/stallingstegoed` : '';
}

export const createVeiligstallenOrgOpwaardeerLinkForMunicipality = (municipalityID: string, urlName: string | null, fietsenstallingen: ParkingDetailsType[]): string => {
  if (urlName === null) { return '' }

  // check if there are any parkings for this SiteID and BerekentStallingskosten === false -> yes? create URL
  const others = fietsenstallingen.filter((fs) => (municipalityID === fs.SiteID) && (fs.BerekentStallingskosten === false));
  const opwaardeerUrl = urlName !== null &&others.length > 0 ? `https://veiligstallen.nl/${urlName}/stallingstegoed` : '';

  return opwaardeerUrl;
}