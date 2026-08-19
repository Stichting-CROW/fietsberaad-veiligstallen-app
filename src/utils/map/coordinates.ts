export type LatLng = { lat: number; lng: number };

/** Last-resort map/save default (Utrecht) when no data-eigenaar pin is available. */
export const DEFAULT_LATLNG: LatLng = { lat: 52.09066, lng: 5.121317 };

export const formatLatLng = (value: LatLng): string => `${value.lat},${value.lng}`;

export const getFallbackLocation = (): string => formatLatLng(DEFAULT_LATLNG);

/**
 * Parse the "Coordinaten" database/form format ("lat,lng", e.g. "52.508011,5.473280").
 * Returns undefined when the value is not a WGS84 pair.
 */
export const parseLatLng = (value: string | null | undefined): LatLng | undefined => {
  if (typeof value !== "string") return undefined;

  const parts = value.split(",");
  if (parts.length !== 2) return undefined;

  const lat = Number(parts[0]);
  const lng = Number(parts[1]);
  if (parts[0]?.trim() === "" || parts[1]?.trim() === "") return undefined;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return undefined;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return undefined;

  return { lat, lng };
};

/** Data-eigenaar pin if it is valid WGS84, otherwise Utrecht. */
export const resolveDefaultLocation = (
  contactCoordinaten?: string | null,
): string => {
  const parsed = parseLatLng(contactCoordinaten);
  return parsed === undefined ? getFallbackLocation() : formatLatLng(parsed);
};

/** Loose Netherlands bounding box. Used to warn, not to reject. */
export const isPlausibleNlLatLng = (value: LatLng): boolean =>
  value.lat >= 50.7 && value.lat <= 53.6 && value.lng >= 3.2 && value.lng <= 7.3;

/**
 * True when the stored "lat,lng" pair is outside NL but swapping the two
 * numbers lands inside NL — the usual lat/lng mix-up.
 */
export const latLngAppearSwapped = (value: string | null | undefined): boolean => {
  const parsed = parseLatLng(value);
  if (parsed === undefined || isPlausibleNlLatLng(parsed)) return false;
  return isPlausibleNlLatLng({ lat: parsed.lng, lng: parsed.lat });
};

const EARTH_RADIUS_M = 6_371_000;

/** Great-circle distance in metres between two WGS84 points. */
export const distanceMeters = (a: LatLng, b: LatLng): number => {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
};

/** True when both values parse as WGS84 and lie within maxMeters of each other. */
export const locationsAreWithin = (
  a: string | null | undefined,
  b: string | null | undefined,
  maxMeters: number,
): boolean => {
  const pa = parseLatLng(a);
  const pb = parseLatLng(b);
  if (pa === undefined || pb === undefined) return false;
  return distanceMeters(pa, pb) <= maxMeters;
};

/** MapLibre expects [lng, lat] and throws on anything out of range. */
export const toMapCenter = (
  value: string | null | undefined,
  fallback: LatLng = DEFAULT_LATLNG,
): [number, number] => {
  const { lat, lng } = parseLatLng(value) ?? fallback;
  return [lng, lat];
};
