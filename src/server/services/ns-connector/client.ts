import { env } from "~/env.mjs";
import type { NSFacilityType } from "~/types/ns-connector";

export const NS_PLACES_ENDPOINT = "https://gateway.apiportal.ns.nl/places-api/v2/places";

export type NsPlacesQueryParams = Record<string, string>;

/** ColdFusion `execute()` order: fietskluizen first, then stallingen. */
export const NS_SYNC_QUERIES = [
  {
    id: "fietskluizen" as const,
    label: "Fietskluizen",
    params: {
      type: "stationfacility",
      radius: "1000",
      name: "fietskluis",
      limit: "250",
    },
  },
  {
    id: "fietsenstallingen" as const,
    label: "Fietsenstallingen",
    params: {
      type: "stationfacility",
      radius: "1000",
      identifier: "fietsenstalling",
      limit: "250",
    },
  },
] as const;

export type NsSyncQueryId = (typeof NS_SYNC_QUERIES)[number]["id"];

function extractPayload(data: unknown): NSFacilityType[] {
  if (data && typeof data === "object" && "payload" in data && Array.isArray((data as { payload: unknown }).payload)) {
    return (data as { payload: NSFacilityType[] }).payload;
  }
  if (Array.isArray(data)) {
    return data as NSFacilityType[];
  }
  return [];
}

export function getNsSubscriptionKey(): string | undefined {
  return env.NSCONNECTOR_SUBSCRIPTION_KEY;
}

export async function fetchNsPlaces(
  subscriptionKey: string,
  params: NsPlacesQueryParams,
  queryLabel: string,
): Promise<NSFacilityType[]> {
  const url = `${NS_PLACES_ENDPOINT}?${new URLSearchParams(params).toString()}`;
  const response = await fetch(url, {
    method: "GET",
    headers: {
      "Ocp-Apim-Subscription-Key": subscriptionKey,
    },
  });
  if (!response.ok) {
    throw new Error(`${queryLabel} API error: ${response.status} ${response.statusText}`);
  }
  const data: unknown = await response.json();
  return extractPayload(data);
}

/** Used by the test fetch endpoint (order matches the previous UI: stallingen, then kluizen). */
export async function fetchAllNsConnectorData(subscriptionKey: string): Promise<{
  fietsenstallingen: NSFacilityType[];
  fietskluizen: NSFacilityType[];
}> {
  const [fietsenstallingen, fietskluizen] = await Promise.all([
    fetchNsPlaces(
      subscriptionKey,
      NS_SYNC_QUERIES[1].params as unknown as NsPlacesQueryParams,
      "Fietsenstallingen",
    ),
    fetchNsPlaces(
      subscriptionKey,
      NS_SYNC_QUERIES[0].params as unknown as NsPlacesQueryParams,
      "Fietskluizen",
    ),
  ]);
  return { fietsenstallingen, fietskluizen };
}
