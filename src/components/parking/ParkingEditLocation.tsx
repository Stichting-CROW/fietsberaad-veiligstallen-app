// @ts-nocheck
import * as React from "react";
import maplibregl from "maplibre-gl";
// import {
//   setMapExtent,
//   setMapZoom,
//   setMapVisibleFeatures,
//   setSelectedParkingId
// } from "~/store/mapSlice";

// import { AppState } from "~/store/store";

// Import utils
// import { getParkingColor } from "~/utils/theme";
// import { getParkingMarker, isPointInsidePolygon } from "~/utils/map/index";
import { createEditGeoJson } from "~/utils/map/geojson";
// import { parkingTypes } from "~/utils/parkings";

// Import the mapbox-gl styles so that the map is displayed correctly
import "maplibre-gl/dist/maplibre-gl.css";
// Import map styles
import nine3030 from "../../mapStyles/nine3030";

function ParkingEditLocation({
  parkingCoords,
  centerCoords,
  onPan,
  initialZoom = 16,
}): React.ReactElement<{
  parkingCoords: string;
  centerCoords: string | undefined;
  onPan: Function<{ lat: number; lng: number }>;
}> {
  // this is where the map instance will be stored after initialization
  const [stateMap, setStateMap] = React.useState<maplibregl.Map>();

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
    let ccoords;
    if (centerCoords !== undefined) {
      ccoords = centerCoords.split(",").map((coord: any) => Number(coord));
    } else if (typeof parkingCoords === "string") {
      ccoords = parkingCoords.split(",").map((coord: any) => Number(coord));
    } else {
      ccoords = [52.508011, 5.47328];
    }

    // otherwise, create a map instance
    const mapboxMap = new maplibregl.Map({
      container: node,
      accessToken: process ? process.env.NEXT_PUBLIC_MAPBOX_TOKEN : "",
      // style: "maplibre://styles/mapbox/streets-v11",
      style: nine3030,
      center: ccoords ? [ccoords[1], ccoords[0]] : [52.508011, 5.47328],
      zoom: initialZoom,
      // Disable map rotation
      dragRotate: false,
      // Disable rotation through touch gestures
      touchZoomRotate: false,
      // Disable rotation through keyboard
      keyboard: false,
    });

    mapboxMap.on("load", () => onMapLoaded(mapboxMap));
    mapboxMap.on("move", () => {
      if (onPan) {
        const lng = mapboxMap.getCenter().lng;
        const lat = mapboxMap.getCenter().lat;
        onPan(lat, lng);
      }
      // }
      
      // Prevent rotation by resetting bearing to 0 on any movement
      if (mapboxMap.getBearing() !== 0) {
        mapboxMap.setBearing(0);
      }
    });
    mapboxMap.on('styleimagemissing', (e) => {
      mapboxMap.addImage(e.id, { width: 0, height: 0, data: new Uint8Array(0) });
    });


    // Function that executes if component unloads:
    return () => {
      mapboxMap.remove();
    };
  }, []);

  // If 'centerCoords' variable changes: recenter map to new coordinates'
  React.useEffect(() => {
    if (centerCoords !== "" && centerCoords !== undefined) {
      // console.log('recenter map @', centerCoords)
      if (stateMap) {
        const coords = centerCoords.split(",").map((coord: any) => Number(coord));
        try {
          stateMap.setCenter([coords[1], coords[0]]);
        } catch (e) {
          console.warn("invalid manual location @", coords);
        }
      }
    }
  }, [centerCoords]);

  // If 'parkingCoors' variable changes: Update source data
  React.useEffect(() => {
    if (!stateMap || stateMap === undefined) return;
    if (!stateMap.getSource) return;

    // Create geojson
    const geojson: any = createEditGeoJson(parkingCoords);

    // Add or update fietsenstallingen data
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
      highlighMarker(stateMap, -1);
    }
  }, [stateMap, parkingCoords]);

  // Function that's called if map is loaded
  const onMapLoaded = (mapboxMap) => {
    // Save map as local variabele
    setStateMap(mapboxMap);
    // Disable drag and zoom handlers.
    // mapboxMap.scrollZoom.disable();
    // Disable rotation completely
    mapboxMap.dragRotate.disable();
    // Ensure bearing is always 0 (no rotation)
    mapboxMap.setBearing(0);
  };

  const highlighMarker = (map: any, id: string) => {
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

  const cursorStyle = {
    position: "absolute",
    top: "50%",
    left: "50%",
    width: "20px",
    height: "20px",
    background: "red",
    borderRadius: "50%",
    transform: "translate(-50%, -50%)",
    pointerEvents: "none",
    zIndex: 1,
  };

  return (
    <div
      ref={mapNode}
      className="rounded-3xl shadow"
      style={{ width: "100%", height: "696px", position: "relative" }}
    >
      <div className="map-cursor" style={cursorStyle}></div>
    </div>
  );
}

export default ParkingEditLocation;
