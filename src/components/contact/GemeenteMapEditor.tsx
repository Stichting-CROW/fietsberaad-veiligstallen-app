// @ts-nocheck
import * as React from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import nine3030 from "../../mapStyles/nine3030";
import { createEditGeoJson } from "~/utils/map/geojson";

interface GemeenteMapEditorProps {
  coordinaten: string;
  zoom: number;
  onCoordinatesChanged: (lat: number, lng: number) => void;
  onZoomChanged: (zoom: number) => void;
  disabled?: boolean;
}

function GemeenteMapEditor({
  coordinaten,
  zoom,
  onCoordinatesChanged,
  onZoomChanged,
  disabled = false,
}: GemeenteMapEditorProps): React.ReactElement {
  const [stateMap, setStateMap] = React.useState<maplibregl.Map>();
  const mapNode = React.useRef(null);
  const isUpdatingFromProps = React.useRef(false);

  // Initialize map
  React.useEffect(() => {
    const node = mapNode.current;

    if (typeof window === "undefined" || node === null) return;
    if (stateMap) return;

    // Parse coordinates
    let ccoords: [number, number];
    if (coordinaten && coordinaten.includes(",")) {
      const coords = coordinaten.split(",").map((coord: any) => Number(coord));
      if (coords[0] && coords[1]) {
        ccoords = [coords[1], coords[0]]; // [lng, lat] for mapbox
      } else {
        ccoords = [5.2913, 52.1326]; // Default center of NL
      }
    } else {
      ccoords = [5.2913, 52.1326]; // Default center of NL
    }

    // Create map instance
    const mapboxMap = new maplibregl.Map({
      container: node,
      accessToken: process ? process.env.NEXT_PUBLIC_MAPBOX_TOKEN : "",
      style: nine3030,
      center: ccoords,
      zoom: zoom || 13,
      dragRotate: false,
      keyboard: false,
    });

    mapboxMap.on("load", () => onMapLoaded(mapboxMap));
    
    // Prevent rotation on any movement
    mapboxMap.on("move", () => {
      if (mapboxMap.getBearing() !== 0) {
        mapboxMap.setBearing(0);
      }
    });
    
    // Handle map movement end - update coordinates only when dragging is complete
    // This prevents conflicts during active dragging
    mapboxMap.on("moveend", () => {
      if (!disabled && !isUpdatingFromProps.current && onCoordinatesChanged) {
        const center = mapboxMap.getCenter();
        onCoordinatesChanged(center.lat, center.lng);
      }
    });
    
    // Handle zoom changes - use zoomend to avoid conflicts
    mapboxMap.on("zoomend", () => {
      if (!disabled && !isUpdatingFromProps.current && onZoomChanged) {
        onZoomChanged(mapboxMap.getZoom());
      }
    });
    
    mapboxMap.on('styleimagemissing', (e) => {
      mapboxMap.addImage(e.id, { width: 0, height: 0, data: new Uint8Array(0) });
    });

    return () => {
      mapboxMap.remove();
    };
  }, []);

  // Update map center when coordinaten prop changes
  React.useEffect(() => {
    if (!stateMap || !coordinaten || !coordinaten.includes(",")) return;
    
    const coords = coordinaten.split(",").map((coord: any) => Number(coord));
    if (coords[0] && coords[1]) {
      try {
        const currentCenter = stateMap.getCenter();
        const newCenter: [number, number] = [coords[1], coords[0]]; // [lng, lat]
        
        // Only update if coordinates actually changed
        if (Math.abs(currentCenter.lng - newCenter[0]) > 0.0001 || 
            Math.abs(currentCenter.lat - newCenter[1]) > 0.0001) {
          isUpdatingFromProps.current = true;
          stateMap.setCenter(newCenter);
          // Reset flag after a short delay to allow moveend event to process
          setTimeout(() => {
            isUpdatingFromProps.current = false;
          }, 100);
        }
      } catch (e) {
        console.warn("invalid coordinates @", coordinaten);
      }
    }
  }, [coordinaten, stateMap]);

  // Update map zoom when zoom prop changes
  React.useEffect(() => {
    if (!stateMap || zoom === undefined) return;
    const currentZoom = stateMap.getZoom();
    if (Math.abs(currentZoom - zoom) > 0.1) {
      isUpdatingFromProps.current = true;
      stateMap.setZoom(zoom);
      // Reset flag after a short delay to allow zoomend event to process
      setTimeout(() => {
        isUpdatingFromProps.current = false;
      }, 100);
    }
  }, [zoom, stateMap]);

  // Update marker when coordinaten changes
  React.useEffect(() => {
    if (!stateMap || !stateMap.getSource) return;
    if (!coordinaten || !coordinaten.includes(",")) return;

    // Create geojson for marker
    const geojson: any = createEditGeoJson(coordinaten);

    // Add or update marker source
    const source: maplibregl.GeoJSONSource = stateMap.getSource(
      "gemeente-marker"
    ) as maplibregl.GeoJSONSource;
    if (source) {
      source.setData(geojson);
    } else {
      stateMap.addSource("gemeente-marker", {
        type: "geojson",
        data: geojson,
      });
    }

    // Add marker layer if it doesn't exist
    if (!stateMap.getLayer("gemeente-marker-layer")) {
      stateMap.addLayer({
        id: "gemeente-marker-layer",
        source: "gemeente-marker",
        type: "circle",
        filter: ["all"],
        paint: {
          "circle-color": "#E51A2C",
          "circle-radius": 10,
          "circle-stroke-width": 3,
          "circle-stroke-color": "#ffffff",
        },
      });
    }
  }, [stateMap, coordinaten]);

  // Function called when map is loaded
  const onMapLoaded = (mapboxMap: maplibregl.Map) => {
    setStateMap(mapboxMap);
    mapboxMap.dragRotate.disable();
    mapboxMap.setBearing(0);
  };

  const cursorStyle = {
    position: "absolute" as const,
    top: "50%",
    left: "50%",
    width: "20px",
    height: "20px",
    background: "red",
    borderRadius: "50%",
    transform: "translate(-50%, -50%)",
    pointerEvents: "none" as const,
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

export default GemeenteMapEditor;