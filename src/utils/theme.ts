export const getParkingColor = (parkingType: string | null) => {
  // console.log(parkingType);

  let color;
  switch(parkingType) {
    case 'bewaakt':
      color = '#00BDD5';
      break;
    case 'geautomatiseerd':
      color = '#028090';
      break;
    case 'fietskluizen':
      color = '#9E1616';
      break;
    case 'fietstrommel':
      color = '#DF4AAD';
      break;
    case 'buurtstalling':
      color = '#FFB300';
      break;
    case 'publiek':
      color = '#058959';
      break;
    default:
      color = '#00CE83';
  }
  return color;
}
