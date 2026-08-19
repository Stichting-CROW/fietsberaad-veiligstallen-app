import { parseLatLng } from "~/utils/map/coordinates";

interface GeoJsonFeature {
  type: string;
  geometry: {
    type: string;
    coordinates: number[];
  };
  properties: {
    title: string;
    location: string;
    plaats: string;
    type: string;
  };
}

const createGeoJson = (input: GeoJsonFeature[]) => {
  const features: GeoJsonFeature[] = [];

  input.forEach((x: any) => {
    // Stallingen without a usable WGS84 coordinate are left off the map: feeding
    // MapLibre a NaN or out-of-range point breaks the whole source.
    const latlng = parseLatLng(x.Coordinaten); // I.e.: 52.508011,5.473280;
    if (latlng === undefined) return;

    features.push({
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: [latlng.lng, latlng.lat],
      },
      properties: {
        id: x.ID,
        title: (x.Title || "").toLowerCase(),
        location: (x.Location || "").toLowerCase(),
        plaats: (x.Plaats || "").toLowerCase(),
        type: x.Type || "unknown",
      },
    });
  });

  return {
    type: "FeatureCollection",
    features: features,
  };
};

const createEditGeoJson = (Coordinaten: string) => {
  const latlng = parseLatLng(Coordinaten);
  // No usable WGS84 pair: return an empty collection so the editor does not
  // draw a fake stalling at the viewport fallback. The map may still open
  // via toMapCenter (data-eigenaar pin or Utrecht).
  const features: GeoJsonFeature[] = latlng === undefined
    ? []
    : [
        {
          type: "Feature",
          geometry: {
            type: "Point",
            coordinates: [latlng.lng, latlng.lat],
          },
          properties: {
            title: "",
            location: "",
            plaats: "",
            type: "",
          },
        },
      ];

  return {
    type: "FeatureCollection",
    features: features,
  };
};

export {
  createGeoJson, createEditGeoJson
}
