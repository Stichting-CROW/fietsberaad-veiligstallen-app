const LOCAL_DB_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "mysql"]);
/** scripts/launch-ssh-tunnel.sh forwards the remote database to this local port. */
const DEFAULT_TUNNEL_PORTS = ["5555"];

export type InternalTickDecision = { enabled: boolean; reason: string };

export function decideInternalTick(env: Record<string, string | undefined>): InternalTickDecision {
  const explicit = env.BACKGROUND_INTERNAL_TICK?.trim().toLowerCase();
  if (explicit === "true" || explicit === "1") return { enabled: true, reason: "BACKGROUND_INTERNAL_TICK=true" };
  if (explicit === "false" || explicit === "0") return { enabled: false, reason: "BACKGROUND_INTERNAL_TICK=false" };
  if (env.NODE_ENV !== "development") return { enabled: false, reason: "not in dev mode" };

  let url: URL;
  try {
    url = new URL(env.DATABASE_URL ?? "");
  } catch {
    return { enabled: false, reason: "DATABASE_URL not parseable" };
  }
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (!LOCAL_DB_HOSTS.has(host)) return { enabled: false, reason: `database host ${host} is not local` };
  const tunnelPorts = (env.BACKGROUND_TUNNEL_PORTS ?? DEFAULT_TUNNEL_PORTS.join(","))
    .split(",")
    .map((port) => port.trim())
    .filter(Boolean);
  if (url.port && tunnelPorts.includes(url.port)) {
    return { enabled: false, reason: `port ${url.port} is an SSH tunnel to a remote database` };
  }
  return { enabled: true, reason: "dev, local db" };
}
