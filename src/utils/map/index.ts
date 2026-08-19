import { parseLatLng } from "~/utils/map/coordinates";

// async function getParkingMarker(color: string) {
//   const marker = await styleParkingMarker(color);
//   return marker;
// }

// async function styleParkingMarker(color: string) {
//   const xmlns = "http://www.w3.org/2000/svg";
//   const svgElement = document.createElementNS(xmlns, "svg");

//   // outer transparant circle
//   const circle_1 = document.createElementNS("http://www.w3.org/2000/svg", 'circle');
//   circle_1.setAttribute("cx","12");
//   circle_1.setAttribute("cy","12");
//   circle_1.setAttribute("r","12");
//   circle_1.setAttribute("fill","12");
//   circle_1.setAttribute("opacity","0.304");
//   circle_1.setAttribute("fill", color);
//   svgElement.appendChild(circle_1);

//   // inner non transparant circle
//   const inner_circle = document.createElementNS("http://www.w3.org/2000/svg", 'g');
//   inner_circle.setAttribute("transform","translate(2 2)");
//   inner_circle.setAttribute("fill",color);
//   inner_circle.setAttribute("stroke","#fff");
//   inner_circle.setAttribute("stroke-width","1");

//   const child_circle_1 = document.createElementNS("http://www.w3.org/2000/svg", 'circle');
//   child_circle_1.setAttribute("cx","10");
//   child_circle_1.setAttribute("cy","10");
//   child_circle_1.setAttribute("r","10");
//   child_circle_1.setAttribute("stroke","none");

//   const child_circle_2 = document.createElementNS("http://www.w3.org/2000/svg", 'circle');
//   child_circle_2.setAttribute("cx","10");
//   child_circle_2.setAttribute("cy","10");
//   child_circle_2.setAttribute("r","9.5");
//   child_circle_2.setAttribute("fill","none");
//   inner_circle.appendChild(child_circle_1);
//   inner_circle.appendChild(child_circle_2);
//   svgElement.appendChild(inner_circle);

//   const width: any = {};
//   const height: any = {};

//   // console.log(svg.firstChild.tagName);
//   svgElement.setAttribute("viewBox", "0 0 24 24");

//   width.value = 50;
//   height.value = 50;

//   const canvas = document.createElement('canvas');
//   svgElement.setAttribute('width', width.value);
//   svgElement.setAttribute('height', height.value);
//   canvas.width = width.value;
//   canvas.height = height.value;
//   const data = new XMLSerializer().serializeToString(svgElement);
//   const win = window.URL || window.webkitURL || window;
//   const img = new Image();
//   const blob = new Blob([data], { type: 'image/svg+xml' });

//   const url = win.createObjectURL(blob);
//   img.src = url;
//   await img.decode();
//   const context = canvas.getContext('2d');
//   if(! context) {
//     return;
//   }

//   context.drawImage(img, 0, 0);
//   win.revokeObjectURL(url);

//   return new Uint8Array(context.getImageData(0, 0, img.width, img.height).data.buffer);
// }

// Check if lat/lng point is inside polygon
// https://stackoverflow.com/a/29915728
//
// Example usage:
// var polygon = [ [ 1, 1 ], [ 1, 2 ], [ 2, 2 ], [ 2, 1 ] ];
// isPointInsidePolygon([ 1.5, 1.5 ], polygon); // true
const isPointInsidePolygon = (point: [number, number], vs: [number, number][]): boolean => {
  // Check if point has exactly two numbers
  if (!Array.isArray(point) || point.length !== 2 || point.some(coord => typeof coord !== 'number')) {
    return false;
  }

  // Check if vs is a non-empty array of arrays with two numbers each
  if (!Array.isArray(vs) || vs.length === 0 || vs.some(v => !Array.isArray(v) || v.length !== 2 || v.some(coord => typeof coord !== 'number'))) {
    return false;
  }

  // ray-casting algorithm based on
  // https://wrf.ecse.rpi.edu/Research/Short_Notes/pnpoly.html

  const [x, y] = point;

  let inside = false;
  for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
    const vertex1 = vs[i];
    const vertex2 = vs[j];

    if (!vertex1 || !vertex2) {
      continue; // Skip iteration if either vertex is undefined
    }

    const [xi, yi] = vertex1;
    const [xj, yj] = vertex2;

    const intersect = ((yi > y) !== (yj > y))
      && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }

  return inside;
};

// Returns [lng, lat] as expected by MapLibre, or undefined when the stored value
// is not a usable WGS84 pair (empty, malformed, or Rijksdriehoek metres).
const convertCoordinatenToCoords = (Coordinaten: string | null | undefined): [number, number] | undefined => {
  const latlng = parseLatLng(Coordinaten); // I.e.: 52.508011,5.473280;
  if (latlng === undefined) return undefined;

  return [latlng.lng, latlng.lat];
}

const openRoute = (Coordinaten: string | null) => {
  if (Coordinaten===null) return;
  // Get coords from parking variable
  const coords = convertCoordinatenToCoords(Coordinaten);
  if(coords===undefined||coords.length!==2) return;
  const coordsString = "" + coords[1] + ',' + coords[0]; // E.g. 51.9165409,4.4480073
  // Generate route URL
  // dirflg: b=bicycling. Source: https://webapps.stackexchange.com/a/67255
  const url = `https://www.google.com/maps/dir/?api=1&travelmode=bicycling&destination=${coordsString}&z=17&dirflg=b`;
  // window.open(url, '_blank');
  // If it's an iPhone..
  if ((navigator.platform.indexOf("iPhone") != -1)
    || (navigator.platform.indexOf("iPod") != -1)
    || (navigator.platform.indexOf("iPad") != -1)
  ) {
    window.open(url.replace('https://', 'maps://'));
  }
  else {
    window.open(url);
  }
}

export {
  // getParkingMarker,
  isPointInsidePolygon,
  convertCoordinatenToCoords,
  openRoute
}
