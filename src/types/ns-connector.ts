// NS API Connector Type Definitions

export interface NSLink {
  uri: string;
}

export interface NSThumbnail {
  uri: string;
}

export interface NSOpeningHour {
  dayOfWeek: number; // 1-7 (Monday-Sunday)
  startTime: string; // HH:mm format
  endTime: string; // HH:mm format
  closesNextDay?: boolean;
}

export interface NSExtra {
  jafInStalling?: string;
  regime?: string;
  locationCode?: string;
}

export interface NSInfoImage {
  name: string;
  link: NSLink;
  title: string;
  body: string;
}

export interface NSNearbyMeLocationId {
  value: string;
  type: string;
}

export interface NSLocation {
  name: string;
  stationCode: string;
  lat: number;
  lng: number;
  open: string; // "Yes", "No", "Unknown"
  link: NSLink;
  thumbnail?: NSThumbnail;
  infoUrl?: string;
  description?: string;
  openingHours?: NSOpeningHour[];
  extra?: NSExtra;
  infoImages?: NSInfoImage[];
  apps?: any[];
  sites?: any[];
  extraInfo?: any[];
  nearbyMeLocationId?: NSNearbyMeLocationId;
  nextOpeningTime?: string;
  street?: string;
  houseNumber?: string;
  postalCode?: string;
  city?: string;
}

export interface NSFacilityType {
  type: string;
  name: string;
  stationFacilityType: string;
  nearbyMeMarkerIconName: string;
  identifiers: string[];
  categories: string[];
  locations: NSLocation[];
}

export interface NSAPIResponse {
  links: Record<string, any>;
  payload: NSFacilityType[];
}

export interface NSConnectorData {
  fietsenstallingen: NSFacilityType[];
  fietskluizen: NSFacilityType[];
}

