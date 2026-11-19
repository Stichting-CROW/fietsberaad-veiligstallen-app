/** Production UrlNames required by `syncNsLocations`. */
export const NS_DATA_EIGENAAR_URL_NAME = "ns";
export const NS_EXPLOITANT_URL_NAME = "ns-stations";

export const NS_DATA_EIGENAAR = {
  ItemType: "organizations" as const,
  CompanyName: "NS",
  Status: "1",
  ParentID: "0",
  Status_website: "0",
  UrlName: NS_DATA_EIGENAAR_URL_NAME,
  ThemeColor1: "003082",
  ThemeColor2: "ffc917",
};

export const NS_EXPLOITANT = {
  ItemType: "exploitant" as const,
  CompanyName: "NS Stations",
  Status: "1",
  ParentID: "0",
  UrlName: NS_EXPLOITANT_URL_NAME,
};
