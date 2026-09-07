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

const MANAGED_SCOPE_KEY = "parking-sim-managedScope";
const CHECK_TYPE_KEY = "parking-sim-checkType";

export type ManagedWriteScope = "section" | "location";
export type SimCheckType = "user" | "controle" | "system";

export function readManagedWriteScope(): ManagedWriteScope {
  if (typeof window === "undefined") return "section";
  return localStorage.getItem(MANAGED_SCOPE_KEY) === "location" ? "location" : "section";
}

export function writeManagedWriteScope(scope: ManagedWriteScope): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(MANAGED_SCOPE_KEY, scope);
}

export function readSimCheckType(): SimCheckType {
  if (typeof window === "undefined") return "user";
  const v = localStorage.getItem(CHECK_TYPE_KEY);
  return v === "controle" || v === "system" ? v : "user";
}

export function writeSimCheckType(checkType: SimCheckType): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(CHECK_TYPE_KEY, checkType);
}
