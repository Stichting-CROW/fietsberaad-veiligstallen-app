import { parseLatLng } from "~/utils/map/coordinates";

export type ReverseGeocodeResult = {
    // Define the types according to the data you expect from Nominatim
    address: {
        road?: string;
        house_number?: string;
        city?: string;
        town?: string;
        village?: string;
        quarter?: string;
        state?: string;
        country?: string;
        postcode?: string;
        // Add other fields as needed
    };
    // Add other fields as needed
};

export type GeocodeResult = {
    lat: string;
    lon: string;
};

let lastReverseRequestTime = 0;
let lastGeocodeRequestTime = 0;
const requestInterval = 1500; // 1.5 seconds -> api rate limit is 1 request per second

export const reverseGeocode = async (latLong: string): Promise<ReverseGeocodeResult | false> => {
    try {
        const latlng = parseLatLng(latLong);
        if (latlng === undefined) {
            return false;
        }

        const currentTime = Date.now();
        if (currentTime - lastReverseRequestTime < requestInterval) {
            return false;
            // const waitTime = requestInterval - (currentTime - lastReverseRequestTime);
            // await new Promise(resolve => setTimeout(resolve, waitTime));
        }

        lastReverseRequestTime = Date.now();

        const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latlng.lat}&lon=${latlng.lng}`;

        const response = await fetch(url);
        if (!response.ok) {
            throw new Error('Failed to fetch from Nominatim API');
        }

        const data: ReverseGeocodeResult = await response.json();
        return data;
    } catch (error) {
        console.error('Error in reverse geocoding:', error);
        return false;
    }
}

export const geocodeAddress = async (street: string, postcode: string, city: string): Promise<GeocodeResult | false> => {
    try {
        const currentTime = Date.now();
        if (currentTime - lastGeocodeRequestTime < requestInterval) {
            return false;
            // const waitTime = requestInterval - (currentTime - lastGeocodeRequestTime);
            // await new Promise(resolve => setTimeout(resolve, waitTime));
        }

        lastGeocodeRequestTime = Date.now();

        const address = encodeURIComponent(`${street} ${postcode}, ${city}, Netherlands`);
        const url = `https://nominatim.openstreetmap.org/search?format=json&q=${address}`;

        const response = await fetch(url);
        if (!response.ok) {
            throw new Error('Failed to fetch from Nominatim API');
        }

        const results: GeocodeResult[] = await response.json();

        // No match is a normal outcome, not an error: the caller asks the user to
        // place the stalling by hand.
        // Assuming the first result is the most relevant
        return results[0] || false;
    } catch (error) {
        console.error('Error in geocoding address:', error);
        return false;
    }
}
