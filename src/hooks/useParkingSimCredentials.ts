import { useCallback, useEffect, useState } from "react";
import {
  readLocalParkingSimCredentials,
  type ParkingSimCredentials,
} from "~/lib/parking-simulation/credentials";

type CredentialsSource = "local" | "server" | "none";

export function useParkingSimCredentials() {
  const [credentials, setCredentials] = useState<ParkingSimCredentials | null>(null);
  const [source, setSource] = useState<CredentialsSource>("none");
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    const local = readLocalParkingSimCredentials();
    if (local) {
      setCredentials(local);
      setSource("local");
      setLoading(false);
      return;
    }

    try {
      const configRes = await fetch("/api/protected/parking-simulation/config");
      if (configRes.ok) {
        const configData = (await configRes.json()) as {
          session?: { apiUsername?: string | null; apiPassword?: string | null; baseUrl?: string | null };
        };
        const session = configData.session;
        if (session?.apiUsername && session.apiPassword) {
          setCredentials({
            username: session.apiUsername,
            password: session.apiPassword,
            baseUrl: session.baseUrl || localStorage.getItem("parking-sim-baseUrl") || undefined,
          });
          setSource("server");
          setLoading(false);
          return;
        }
      }

      const res = await fetch("/api/protected/fms-test-credentials");
      if (res.ok) {
        const data = (await res.json()) as {
          username?: string;
          password?: string;
        };
        if (data.username && data.password) {
          const baseUrl = localStorage.getItem("parking-sim-baseUrl") || undefined;
          setCredentials({
            username: data.username,
            password: data.password,
            baseUrl,
          });
          setSource("server");
          setLoading(false);
          return;
        }
      }
    } catch {
      // fall through
    }

    setCredentials(null);
    setSource("none");
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
    const onUpdated = () => void refresh();
    window.addEventListener("parking-sim-credentials-updated", onUpdated);
    window.addEventListener("storage", onUpdated);
    return () => {
      window.removeEventListener("parking-sim-credentials-updated", onUpdated);
      window.removeEventListener("storage", onUpdated);
    };
  }, [refresh]);

  return { credentials, source, loading, refresh };
}
