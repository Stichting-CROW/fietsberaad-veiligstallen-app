import { type MunicipalityType } from "./map/active_municipality";
import { type VSContactGemeente } from "~/types/contacts";

export const getMunicipalityBasedOnCbsCode = async (cbsCode: number): Promise<VSContactGemeente | undefined> => {
  if (!cbsCode) return undefined;

  const response = await fetch(`/api/contacts?cbsCode=${cbsCode}`);
  const json = await response.json();
  return json[0] as VSContactGemeente;
};

export const getMunicipalityById = async (id: string): Promise<VSContactGemeente | undefined> => {
  if (!id) return undefined;

  const response = await fetch(`/api/contacts?ID=${id}`);
  const json = await response.json();
  return json as unknown as VSContactGemeente;
};

export const getMunicipalityBasedOnUrlName = async (urlName: string): Promise<VSContactGemeente | undefined> => {
  if (!urlName) {
    console.log('No urlName given');
    return undefined;
  }

  // if(urlName === "fietsberaad") {
  //   urlName = "1";
  // }

  try {
    const response = await fetch(`/api/contacts?urlName=${urlName}`);
    const json = await response.json();
    return json[0] as VSContactGemeente;
  } catch (err) {
    return undefined;
    // console.error('err', err)
  }
}

export const getMunicipalities = async (): Promise<VSContactGemeente[] | false> => {
  try {
    const response = await fetch(`/api/contacts?itemType=organizations`);
    return await response.json() as VSContactGemeente[];
  } catch (err) {
    console.error('err', err)
    return false;
  }
}

export const cbsCodeFromMunicipality = (municipality: false | MunicipalityType): false | number => {
  try {
    if (municipality === false) return false;

    let cbsCode = municipality.municipality.replace('GM', '');
    while (cbsCode.charAt(0) === '0') {
      cbsCode = cbsCode.substring(1);
    }
    return Number(cbsCode);
  } catch (err) {
    console.error('err', err)
    return false;
  }
}
