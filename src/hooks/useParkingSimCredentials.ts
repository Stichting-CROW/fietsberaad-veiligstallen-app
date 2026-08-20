import { useCallback, useEffect, useState } from "react";
import {
  readLocalParkingSimCredentials,
  type ParkingSimCredentials,
} from "~/lib/parking-simulation/credentials";

export function useParkingSimCredentials() {
  const [credentials, setCredentials] = useState<ParkingSimCredentials | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(() => {
    setCredentials(readLocalParkingSimCredentials());
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
    const onUpdated = () => refresh();
    window.addEventListener("parking-sim-credentials-updated", onUpdated);
    window.addEventListener("storage", onUpdated);
    return () => {
      window.removeEventListener("parking-sim-credentials-updated", onUpdated);
      window.removeEventListener("storage", onUpdated);
    };
  }, [refresh]);

  return { credentials, loading, refresh };
}
