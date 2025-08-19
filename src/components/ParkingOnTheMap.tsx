// @ts-nocheck
import * as React from "react";
import maplibregl from "maplibre-gl";
import * as turf from "@turf/turf";
import { useDispatch, useSelector } from "react-redux";
import {
  setMapExtent,
  setMapZoom,
  setMapVisibleFeatures,
  setSelectedParkingId,
} from "~/store/mapSlice";

import { type AppState } from "~/store/store";

// Import utils
// import { getParkingColor } from "~/utils/theme";
// import { getParkingMarker, isPointInsidePolygon } from "~/utils/map/index";
// import { getActiveMunicipality } from "~/utils/map/active_municipality";
// import { mapMoveEndEvents } from "~/utils/map/parkingsFilteringBasedOnExtent";
import { createGeoJson } from "~/utils/map/geojson";
// import { parkingTypes } from "~/utils/parkings";

// Import the mapbox-gl styles so that the map is displayed correctly
import "maplibre-gl/dist/maplibre-gl.css";
// Import map styles
import nine3030 from "../mapStyles/nine3030";

// Import component styles, i.e. for the markers
import styles from "./MapComponent.module.css";

// Add custom markers
// const addMarkerImages = (map: any) => {
//   const addMarkerImage = async (parkingType: string) => {
//     if (map.hasImage(parkingType)) {
//       console.log("parkingType image for %s already exists", parkingType);
//       return;
//     }
//     const marker = await getParkingMarker(getParkingColor(parkingType));
//     // Add marker image
//     map.addImage(parkingType, { width: 50, height: 50, data: marker });
//   };
//   parkingTypes.forEach((x) => {
//     addMarkerImage(x);
//   });
// };

function ParkingOnTheMap({ parking }) {
  // this is where the map instance will be stored after initialization
  const [stateMap, setStateMap] = React.useState<maplibregl.Map>();

  // Connect to redux store
  const dispatch = useDispatch();

  const filterActiveTypes = useSelector(
    (state: AppState) => state.filter.activeTypes
  );

  const selectedParkingId = useSelector(
    (state: AppState) => state.map.selectedParkingId
  );

  // React ref to store a reference to the DOM node that will be used
  // as a required parameter `container` when initializing the mapbox-gl
  // will contain `null` by default
  const mapNode = React.useRef(null);

  React.useEffect(() => {
    const node = mapNode.current;

    // if the window object is not found, that means
    // the component is rendered on the server
    // or the dom node is not initialized, then return early
    if (typeof window === "undefined" || node === null) return;

    // If stateMap already exists: Stop, as the map is already initiated
    if (stateMap) return;

    // Get coords from parking variable
    const coords = parking.Coordinaten
      ? parking.Coordinaten.split(",").map((coord: any) => Number(coord))
      : null; // I.e.: 52.508011,5.473280;

    if (coords === null || (coords[0] < -90 || coords[0] > 90 || coords[1] < -180 || coords[1] > 180)) {
      console.warn("invalid coordinates for parking", parking.Title, coords);
      return;
    }

    // otherwise, create a map instance
    const mapboxMap = new maplibregl.Map({
      container: node,
      accessToken: process ? process.env.NEXT_PUBLIC_MAPBOX_TOKEN : "",
      // style: "maplibre://styles/mapbox/streets-v11",
      style: nine3030,
      center: coords ? [coords[1], coords[0]] : [52.508011, 5.47328],
      zoom: 16,
      // Disable map rotation
      dragRotate: false,
      // Disable rotation through touch gestures
      // touchZoomRotate: false,
      // Disable rotation through keyboard
      keyboard: false,
    });

    mapboxMap.on("load", () => onMapLoaded(mapboxMap));
    mapboxMap.on('styleimagemissing', (e) => {
      mapboxMap.addImage(e.id, { width: 0, height: 0, data: new Uint8Array(0) });
    });
    
    // Prevent rotation by resetting bearing to 0 on any movement
    mapboxMap.on('move', () => {
      if (mapboxMap.getBearing() !== 0) {
        mapboxMap.setBearing(0);
      }
    });


    // Function that executes if component unloads:
    return () => {
      mapboxMap.remove();
    };
  }, []);

  // If 'parking' variable changes: Update source data
  React.useEffect(() => {
    try {
      if (!stateMap || stateMap === undefined) return;
      if (!stateMap.getSource) return;

      // Create geojson
      const geojson: any = createGeoJson([parking]);

      // Add or update fietsenstallingen data
      try {
        const source: maplibregl.GeoJSONSource = stateMap.getSource(
          "fietsenstallingen"
        ) as maplibregl.GeoJSONSource;
        if (source) {
          source.setData(geojson);
        } else {
          stateMap.addSource("fietsenstallingen", {
            type: "geojson",
            data: geojson,
          });
        }
      } catch (ex) {
        console.warn("ParkingOnTheMap - unable to add/update source data", ex);
      }

      // Add markers layer
      if (!stateMap.getLayer("fietsenstallingen-markers")) {
        stateMap.addLayer({
          id: "fietsenstallingen-markers",
          source: "fietsenstallingen",
          type: "circle",
          filter: ["all"],
          paint: {
            "circle-color": "#fff",
            "circle-radius": 5,
            "circle-stroke-width": 4,
            "circle-stroke-color": [
              "match",
              ["get", "type"],
              "bewaakt",
              "#00BDD5",
              "geautomatiseerd",
              "#028090",
              "fietskluizen",
              "#9E1616",
              "fietstrommel",
              "#DF4AAD",
              "buurtstalling",
              "#FFB300",
              "publiek",
              "#00CE83",
              "#00CE83",
            ],
          },
        });

        // Highlight one and only active marker
        highlighMarker(stateMap, parking.ID);
      }
    } catch (ex) {
      console.warn("ParkingOnTheMap - unable to add/update source data", ex);
    }
  }, [stateMap, parking]);

  // Function that's called if map is loaded
  const onMapLoaded = (mapboxMap) => {
    // Save map as local variabele
    setStateMap(mapboxMap);
    // Disable drag and zoom handlers.
    mapboxMap.scrollZoom.disable();
    // Disable rotation completely
    mapboxMap.dragRotate.disable();
    // Ensure bearing is always 0 (no rotation)
    mapboxMap.setBearing(0);
  };

  const highlighMarker = (map: any, id: string) => {
    if (!map) return;

    map.setPaintProperty("fietsenstallingen-markers", "circle-radius", [
      "case",
      ["==", ["get", "id"], id],
      10,
      5,
    ]);
    map.setPaintProperty("fietsenstallingen-markers", "circle-stroke-width", [
      "case",
      ["==", ["get", "id"], id],
      3,
      4,
    ]);
  };

  return (
    <div
      ref={mapNode}
      className="rounded-3xl shadow"
      style={{ width: "414px", height: "696px" }}
    />
  );
}

export default ParkingOnTheMap;
