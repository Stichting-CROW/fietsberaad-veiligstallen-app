// @ts-nocheck
import * as React from "react";
import maplibregl from "maplibre-gl";
import * as turf from "@turf/turf";
import { useRouter } from "next/router";
import { useDispatch, useSelector } from "react-redux";
import {
  setMapCurrentLatLong,
  setMapExtent,
  setMapZoom,
  setMapVisibleFeatures,
  // setActiveMunicipality,
  setSelectedParkingId,
  setActiveParkingId,
} from "~/store/mapSlice";

import {
  setActiveArticle,
} from "~/store/appSlice";

import { type AppState } from "~/store/store";

// Import utils
import {
  convertCoordinatenToCoords,
} from "~/utils/map/index";
import { getMunicipalityBasedOnLatLng } from "~/utils/map/active_municipality";
import { mapMoveEndEvents } from "~/utils/map/parkingsFilteringBasedOnExtent";
import useWindowDimensions from "~/hooks/useWindowDimensions";

// Import the mapbox-gl styles so that the map is displayed correctly
import "maplibre-gl/dist/maplibre-gl.css";
// Import map styles
import nine3030 from "../mapStyles/nine3030";
import type { ParkingDetailsType } from "~/types/parking";

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

const createGeoJson = (input: ParkingDetailsType[]) => {
  const features: GeoJsonFeature[] = [];

  input.forEach((x) => {
    if (!x.Coordinaten) return;

    const coords = convertCoordinatenToCoords(x.Coordinaten);

    features.push({
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: coords,
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

function MapboxMap({ fietsenstallingen = [] }: { fietsenstallingen: ParkingDetailsType[] }) {

  // this is where the map instance will be stored after initialization
  const [stateMap, setStateMap] = React.useState<maplibregl.Map>();
  const router = useRouter();
  const { query } = useRouter();

  const { width } = useWindowDimensions();

  const isMobile = React.useMemo(() => width <= 640, [width]); // keep the same as the sm threshold in tailwind

  // Connect to redux store
  const dispatch = useDispatch();

  const filterActiveTypes = useSelector(
    (state: AppState) => state.filter.activeTypes
  );

  const filterQuery = useSelector((state: AppState) => state.filter.query);

  const mapExtent = useSelector((state: AppState) => state.map.extent);

  const mapZoom = useSelector((state: AppState) => state.map.zoom);

  const initialLatLng = useSelector(
    (state: AppState) => state.map.initialLatLng
  );

  // const municipalities = useSelector(
  //   (state: AppState) => state.geo.municipalities
  // );

  const selectedParkingId = useSelector(
    (state: AppState) => state.map.selectedParkingId
  );

  const isParkingListVisible = useSelector(
    (state: AppState) => state.app.isParkingListVisible
  );

  // React ref to store a reference to the DOM node that will be used
  // as a required parameter `container` when initializing the mapbox-gl
  // will contain `null` by default
  const mapNode = React.useRef(null);

  // Highlight marker if selectedParkingId changes
  React.useEffect(() => {
    if (!stateMap) return;
    if (!selectedParkingId) return;
    // Highlight marker
    highlightMarker(stateMap, selectedParkingId);
    // Stop if parking list is full screen
    // If we would continue the parking list would be filtered on click
    // That would result in e.g. only 1 parking in the parking list
    if (isParkingListVisible) return;
    // Center map to selected parking
    const selectedParking = fietsenstallingen.find(
      (x) => x.ID === selectedParkingId
    );
    if (selectedParking) {
      const coords = convertCoordinatenToCoords(selectedParking.Coordinaten);
      stateMap.flyTo({
        center: coords,
        // curve: 1,
        speed: 0.75,
        zoom: 14,
        // easing(t) {
        //   return t;
        // }
      });
    }
  }, [stateMap, selectedParkingId]);

  React.useEffect(() => {
    const node = mapNode.current;

    // if the window object is not found, that means
    // the component is rendered on the server
    // or the dom node is not initialized, then return early
    if (typeof window === "undefined" || node === null) return;

    // If stateMap already exists: Stop, as the map is already initiated
    if (stateMap) return;

    // otherwise, create a map instance
    const mapboxMap = new maplibregl.Map({
      container: node,
      accessToken: process ? process.env.NEXT_PUBLIC_MAPBOX_TOKEN : "",
      // style: "maplibre://styles/mapbox/streets-v11",
      style: nine3030,
      center: [5, 52],
      zoom: 7,
      // Disable map rotation
      dragRotate: false,
      // Disable rotation through touch gestures
      // touchZoomRotate: false,
      // Disable rotation through keyboard
      keyboard: false,
    });

    mapboxMap.on('styleimagemissing', (e) => {
      mapboxMap.addImage(e.id, { width: 0, height: 0, data: new Uint8Array(0) });
    });

    mapboxMap.on("load", () => onMapLoaded(mapboxMap));

    // Function that executes if component unloads:
    return () => {
      mapboxMap.remove();
    };
  }, []);

  // Fly to municipality if initial municipality is given
  React.useEffect(() => {
    if (!stateMap) return;
    if (!initialLatLng) return;

    stateMap.flyTo({
      center: initialLatLng,
      // speed: 0.75,
      duration: 1500,
      essential: true,
      zoom: 13,
    });
  }, [stateMap, initialLatLng]);

  // If 'fietsenstallingen' variable changes: Update source data
  React.useEffect(() => {
    try {
      if (
        !stateMap ||
        stateMap === undefined ||
        "getSource" in stateMap === false ||
        "getLayer" in stateMap === false
      )
        return;

      if (!stateMap.getSource) return;

      // Create geojson
      const geojson: any = createGeoJson(fietsenstallingen);

      // Add or update fietsenstallingen data as sources
      const addOrUpdateSource = (sourceKey) => {
        if (!stateMap || stateMap === undefined) {
          return;
        }
        // Get source, if it exists
        const source: maplibregl.GeoJSONSource = stateMap.getSource(
          sourceKey
        ) as maplibregl.GeoJSONSource;
        if (source) {
          source.setData(geojson);
        } else {
          const sourceConfig = {
            type: "geojson",
            data: geojson,
          };
          if (sourceKey === "fietsenstallingen-clusters") {
            // We want to cluster
            sourceConfig.cluster = true;
            // Max zoom to cluster points on
            // clusterMaxZoom: 18,
            // Radius of each cluster when clustering points (defaults to 50)
            sourceConfig.clusterRadius = 40;
            sourceConfig.clusterMaxZoom = 12;
          }
          stateMap.addSource(sourceKey, sourceConfig);
        }
      };
      addOrUpdateSource("fietsenstallingen");
      addOrUpdateSource("fietsenstallingen-clusters");
      addOrUpdateSource("fietsenstallingen-clusters-count");

      // Add MARKERS layer
      if (!stateMap.getLayer("fietsenstallingen-markers")) {
        stateMap.addLayer({
          id: "fietsenstallingen-markers",
          source: "fietsenstallingen",
          type: "circle",
          filter: ["!", ["has", "point_count"]],
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
          "icon-allow-overlap": true,
          minzoom: 12,
        });
      }

      // Add CLUSTERS layer
      if (!stateMap.getLayer("fietsenstallingen-clusters")) {
        stateMap.addLayer({
          id: "fietsenstallingen-clusters",
          source: "fietsenstallingen-clusters",
          type: "circle",
          filter: ["has", "point_count"],
          paint: {
            // Use step expressions (https://maplibre.org/maplibre-gl-js-docs/style-spec/#expressions-step)
            // with three steps to implement three types of circles:
            //   * Blue, 20px circles when point count is less than 100
            //   * Yellow, 30px circles when point count is between 100 and 750
            //   * Pink, 40px circles when point count is greater than or equal to 750
            "circle-color": "#fff",
            "circle-radius": [
              "step",
              ["get", "point_count"],
              20,
              100,
              30,
              750,
              40,
            ],
            "circle-stroke-width": 3,
            "circle-stroke-color": "#15AEEF",
          },
          maxzoom: 12,
        });
      }

      // Add CLUSTERS COUNT layer
      if (!stateMap.getLayer("fietsenstallingen-clusters-count")) {
        stateMap.addLayer({
          id: "fietsenstallingen-clusters-count",
          source: "fietsenstallingen-clusters",
          type: "symbol",
          filter: ["has", "point_count"],
          layout: {
            "text-field": "{point_count_abbreviated}",
            "text-font": ["DIN Offc Pro Medium", "Arial Unicode MS Bold"],
            "text-size": ["step", ["get", "point_count"], 16, 100, 20, 750, 30],
          },
          paint: {
            "text-color": "#333333",
            // 'text-halo-color': '#fff',
            // 'text-halo-width': 2
          },
          maxzoom: 12,
        });
      }
    } catch (ex) {
      console.warn("error in MapComponent layer update useEffect call", ex);
    }
  }, [stateMap, fietsenstallingen]);

  // Filter map markers if filterActiveTypes filter changes
  React.useEffect(() => {
    try {
      if (!stateMap || stateMap === undefined) return;

      stateMap.setFilter("fietsenstallingen-markers", getLayerFilter(filterActiveTypes, filterQuery));

      // Filter geojson source data for cluster sources
      (() => {
        const filteredGeojson = filterGeojsonForClusterSources(createGeoJson(fietsenstallingen));
        const sources = ["fietsenstallingen-clusters", "fietsenstallingen-clusters-count"];
        sources.forEach((sourceKey) => {
          const source: maplibregl.GeoJSONSource = stateMap.getSource(
            sourceKey
          ) as maplibregl.GeoJSONSource;
          if (source) {
            source.setData(filteredGeojson);
          }
        });
      })();
    } catch (ex) {
      console.warn("error in MapComponent layer setfilter useEffect call", ex);
    }
  }, [stateMap, fietsenstallingen, filterActiveTypes, filterQuery]);

  // Update visible features in state if filter changes
  React.useEffect(() => {
    if (!stateMap) return;

    mapMoveEndEvents(stateMap, (visibleFeatures) => {
      dispatch(setMapVisibleFeatures(visibleFeatures));
    });
  }, [stateMap, filterActiveTypes]);

  const filterGeojsonForClusterSources = (geojson) => {
    if (!geojson.features) return geojson;

    // Filter features
    let filteredGeojson;
    if (filterQuery === "") {
      filteredGeojson = geojson.features.filter((feature) => {
        return filterActiveTypes.indexOf(feature.properties.type) > -1;
      });
    } else {
      filteredGeojson = geojson.features.filter((feature) => {
        return filterActiveTypes.indexOf(feature.properties.type) > -1 &&
          (feature.properties.title.indexOf(filterQuery) > -1 ||
            feature.properties.location.indexOf(filterQuery) > -1 ||
            feature.properties.plaats.indexOf(filterQuery) > -1);
      });
    }

    // Return filtered geojson
    return {
      ...geojson,
      features: filteredGeojson,
    };
  }

  const getLayerFilter = (filterActiveTypes, filterQuery) => {
    let filter = [];
    if (filterQuery === "") {
      filter = [
        "all",
        ["!", ["has", "point_count"]],
        ["in", ["get", "type"], ["literal", filterActiveTypes]],
      ];
    } else {
      filter = [
        "all",
        ["!", ["has", "point_count"]],
        ["in", ["get", "type"], ["literal", filterActiveTypes]],
        [
          "any",
          [
            ">",
            [
              "index-of",
              ["literal", filterQuery.toLowerCase()],
              ["get", "title"],
            ],
            -1,
          ],
          [
            ">",
            [
              "index-of",
              ["literal", filterQuery.toLowerCase()],
              ["get", "locatie"],
            ],
            -1,
          ],
          [
            ">",
            [
              "index-of",
              ["literal", filterQuery.toLowerCase()],
              ["get", "plaats"],
            ],
            -1,
          ],
        ],
      ];
    }
    return filter;
  }

  const highlightMarker = (map: any, id: string) => {
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

  // Function that's called if map is loaded
  const onMapLoaded = (mapboxMap) => {
    // Save map as local variabele
    setStateMap(mapboxMap);
    // Disable rotation completely
    mapboxMap.dragRotate.disable();
    // Ensure bearing is always 0 (no rotation)
    mapboxMap.setBearing(0);
    // Set event handlers
    // mapboxMap.on('movestart', function() {})
    mapboxMap.on("moveend", () => {
      onMoved(mapboxMap);
    });
    mapboxMap.on("zoomend", function () {
      registerMapView(mapboxMap);
    });
    // Call onMoveEnd if map is loaded, as initialization
    // This function is called when all rendering has been done
    // mapboxMap.on("idle", function () {
    onMoved(mapboxMap);

    if (!isMobile) {
      mapboxMap.on('mouseenter', 'fietsenstallingen-markers', function () {
        mapboxMap.getCanvas().style.cursor = 'pointer';
      });

      // When the mouse leaves a feature in the 'markers' layer, change the cursor style back
      mapboxMap.on('mouseleave', 'fietsenstallingen-markers', function () {
        mapboxMap.getCanvas().style.cursor = '';
      });
    }
    // });
    // Show parking info on click
    mapboxMap.on("click", "fietsenstallingen-markers", (e) => {
      // Enlarge parking icon on click
      highlightMarker(mapboxMap, e.features[0].properties.id);
      // Make clicked parking active
      dispatch(setSelectedParkingId(e.features[0].properties.id));
      
      // If mobile: Show parking details
      if (isMobile) {
        router.push({ query: { ...query, stallingid: e.features[0].properties.id } });
      }
      // If desktop: Make clicked parking active
      else {
        dispatch(setActiveParkingId(e.features[0].properties.id));
      }
    });

    // Zoom in on cluster click
    mapboxMap.on("click", "fietsenstallingen-clusters", (e) => {
      // Zoom in
      mapboxMap.flyTo({
        center: e.lngLat,
        duration: 1000,
        zoom: mapboxMap.getZoom() + 4,
      });
    });
  };

  const onMoved = (mapboxMap) => {
    // Register map view in state (extend and zoom level)
    registerMapView(mapboxMap);
    // Set visible features into state
    mapMoveEndEvents(mapboxMap, (visibleFeatures) => {
      dispatch(setMapVisibleFeatures(visibleFeatures));
    });
  };

  const getActiveMunicipality = async (center) => {
    const municipality = await getMunicipalityBasedOnLatLng(center);
    if (!municipality) return;

    return municipality;
  };

  const registerMapView = React.useCallback((theMap) => {
    // Set map boundaries
    const bounds = theMap.getBounds();
    const extent = [
      bounds._sw.lng,
      bounds._sw.lat,
      bounds._ne.lng,
      bounds._ne.lat,
    ];
    // Create polygon that represents the boundaries of the map
    const polygon = turf.points([
      [extent[1], extent[0]],
      [extent[3], extent[2]],
    ]);
    // Calculate the center of this map view
    const center = turf.center(polygon);
    // Get active municipality
    // (async () => {
    //   if (!center) return;
    //   const activeMunicipality = await getActiveMunicipality(
    //     center.geometry.coordinates
    //   );
    //   dispatch(setActiveMunicipalityInfo(activeMunicipality));
    // })();

    // Set values in state
    const coordinates = [center.geometry.coordinates[0].toString(), center.geometry.coordinates[1].toString()]
    dispatch(setMapCurrentLatLong(coordinates));
    dispatch(setMapExtent(extent));
    dispatch(setMapZoom(theMap.getZoom()));
  }, []);

  const isSm = typeof window !== "undefined" && window.innerWidth < 640;

  return (
    <div
      ref={mapNode}
      style={{ width: "100vw", height: "100dvh", overflowY: "hidden" }}
      onClick={() => {
        dispatch(setActiveParkingId(undefined));
        dispatch(setActiveArticle({
          articleTitle: undefined,
          municipality: undefined,
        }));
      }}
    />
  );
}

export default MapboxMap;
