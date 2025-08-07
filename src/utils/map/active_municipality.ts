let controller: AbortController;

export type MunicipalityType = {
  "municipality": string,
  "name": string,
  "owner": string | null,
  "zone_id": number,
  "zone_type": string
}

export const getMunicipalityBasedOnLatLng = async (latLng: string[] | undefined | null): Promise<MunicipalityType | false> => {
  // Abort active fetch call, if any
  if (controller) controller.abort();

  // Create AbortController
  controller = new AbortController();
  const signal = controller.signal;

  if (!latLng) {
    console.log('No latLng given');
    return false;
  }
  if (!latLng[0] || !latLng[1]) {
    console.log('No correct latLng given. Given: ', latLng);
    return false;
  }

  try {
    // Get municipality based on request
    const response = await fetch(
      `https://api.dashboarddeelmobiliteit.nl/dashboard-api/public/get_municipality_based_on_latlng?location=${latLng[0]},${latLng[1]}`,
      { signal }
    )
    const json = await response.json();

    if (json && json.message && json.message === 'No municipality found for these coordinates') {
      console.error(json.message);
      return false;
    }

    return json;
  } catch (err) {
    // console.error('err', err)
    return false;
  }
}
