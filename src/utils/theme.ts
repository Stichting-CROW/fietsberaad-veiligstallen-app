// this constant array is used in the mapbox mappings
const PARKINGCOLORS = {
  'bewaakt': '#0099CC',      // Deeper, more distinct blue
  'geautomatiseerd': '#015A6B', // Darker, more saturated teal
  'toezicht': '#002366',     // Deeper, more distinct green
  'fietskluizen': '#9E1616',
  'fietstrommel': '#DF4AAD',
  'buurtstalling': '#FFB300',
  'other': '#058959',
}

export const COLORMATCHFORPARKINGTYPE = {
  "circle-color": "#fff",
  "circle-radius": 5,
  "circle-stroke-width": 4,
  "circle-stroke-color": [
    "match",
    ["get", "type"],
    "bewaakt",
    PARKINGCOLORS['bewaakt'],
    "toezicht",
    PARKINGCOLORS['toezicht'],
    "geautomatiseerd",
    PARKINGCOLORS['geautomatiseerd'],
    "fietskluizen",
    PARKINGCOLORS['fietskluizen'],
    "fietstrommel",
    PARKINGCOLORS['fietstrommel'],
    "buurtstalling",
    PARKINGCOLORS['buurtstalling'],
    PARKINGCOLORS['other'],
  ],
};

export const getParkingColor = (parkingType: string | null) => {
  if(parkingType!==null && parkingType in PARKINGCOLORS) {
    return PARKINGCOLORS[parkingType as keyof typeof PARKINGCOLORS];
  }
  return PARKINGCOLORS['other'];
}

// export const getParkingColor = (parkingType: string | null) => {
//   // console.log(parkingType);

//   let color;
//   switch(parkingType) {
//     case 'bewaakt':
//       color = '#00BDD5';
//       break;
//     case 'geautomatiseerd':
//       color = '#028090';
//       break;
//     case 'fietskluizen':
//       color = '#9E1616';
//       break;
//     case 'fietstrommel':
//       color = '#DF4AAD';
//       break;
//     case 'buurtstalling':
//       color = '#FFB300';
//       break;
//     case 'toezicht':
//       color = '#058959';
//       break;
//     default:
//       color = '#00CE83';
//   }
//   return color;
// }
