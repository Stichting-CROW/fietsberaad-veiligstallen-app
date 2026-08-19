export type LatLng = { lat: number; lng: number };

/** Centre of the Netherlands, used when no coordinate is available. */
export const DEFAULT_LATLNG: LatLng = { lat: 52.1326, lng: 5.2913 };

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

/** MapLibre expects [lng, lat] and throws on anything out of range. */
export const toMapCenter = (
  value: string | null | undefined,
  fallback: LatLng = DEFAULT_LATLNG,
): [number, number] => {
  const { lat, lng } = parseLatLng(value) ?? fallback;
  return [lng, lat];
};
