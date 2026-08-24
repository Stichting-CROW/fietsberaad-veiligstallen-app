export type ParkingSimCredentials = {
  username: string;
  password: string;
  baseUrl?: string;
};

export function readLocalParkingSimCredentials(): ParkingSimCredentials | null {
  if (typeof window === "undefined") return null;
  const username = localStorage.getItem("parking-sim-apiUsername");
  const password = localStorage.getItem("parking-sim-apiPassword");
  const baseUrl = localStorage.getItem("parking-sim-baseUrl");
  if (!username || !password) return null;
  return { username, password, baseUrl: baseUrl || undefined };
}

export function notifyParkingSimCredentialsUpdated(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event("parking-sim-credentials-updated"));
}
